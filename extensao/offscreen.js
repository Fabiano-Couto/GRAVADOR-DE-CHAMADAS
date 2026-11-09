// Documento offscreen: onde a gravacao acontece de verdade. Captura o som da aba e o microfone,
// monta o mixer (esquerdo = voce, direito = cliente, aba de volta no alto-falante), grava em fatias
// (memoria + armazem) e entrega o arquivo ao service worker para salvar em Downloads.
// E a UNICA fonte da situacao da gravacao (o service worker dorme). Mapa: docs/gravacao.md.
// Testado no Chrome de verdade, com o Chrome da extensao falso por fora: testes/audio/offscreen.test.js.
import { montarMixer } from './lib/mixer.js';
import { criarGravador, ErroGravador } from './lib/gravador.js';
import { abrirArmazem } from './lib/armazem.js';
import { criarMaquina } from './lib/estado.js';
import { criarDetectorSilencio } from './lib/silencio.js';
import { nomeParaRecuperar } from './lib/nomes.js';

const maquina = criarMaquina();
let sessao = null; // { id, meta, ctx, fluxos, mixer, gravador, detector, alerta, relogio }
let armazemPromessa = null;
const urls = new Map(); // idGravacao -> endereco blob entregue ao service worker
const emEntrega = new Set(); // gravacoes sendo salvas agora (fora da lista de recuperaveis)

const armazem = () => {
  if (!armazemPromessa) {
    armazemPromessa = abrirArmazem().catch((e) => {
      armazemPromessa = null; // tenta abrir de novo na proxima vez
      throw e;
    });
  }
  return armazemPromessa;
};

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (!msg || msg.alvo !== 'offscreen') return false;
  tratar(msg).then(responder, (e) => responder({ ok: false, motivo: 'interno', detalhe: String(e?.message || e) }));
  return true;
});

function avisarSw(tipo, dados = {}) {
  return chrome.runtime.sendMessage({ alvo: 'sw', tipo, ...dados });
}

function resumo() {
  return {
    ok: true,
    estado: maquina.estado,
    atual: sessao
      ? { id: sessao.id, tabId: sessao.meta.tabId, origem: sessao.meta.origem, nome: sessao.meta.nome, inicio: sessao.meta.inicio }
      : null,
    niveis: sessao && maquina.estado === 'gravando' ? sessao.mixer.medir() : null,
    alerta: sessao ? sessao.alerta : false,
    emEntrega: [...emEntrega],
  };
}

function avisarEstado() {
  avisarSw('estado-mudou', { estado: maquina.estado, alerta: sessao ? sessao.alerta : false, origem: sessao ? sessao.meta.origem : null }).catch(
    () => {},
  );
}

async function tratar(msg) {
  switch (msg.tipo) {
    case 'estado':
      return resumo();
    case 'permissao-microfone': {
      const p = await navigator.permissions.query({ name: 'microphone' });
      return { ok: true, estado: p.state };
    }
    case 'iniciar':
      return iniciar(msg);
    case 'parar':
      return pararESalvar();
    case 'salvo':
      return concluir(msg.idGravacao, true);
    case 'falhou-salvar':
      return concluir(msg.idGravacao, false);
    case 'recuperar':
      return recuperar(msg.idGravacao);
    case 'descartar':
      return descartar(msg.idGravacao);
    default:
      return { ok: false, motivo: 'desconhecido' };
  }
}

const pararFluxos = (fluxos) => fluxos.forEach((f) => f.getTracks().forEach((t) => t.stop()));

async function iniciar({ streamId, tabId, origem, nome }) {
  if (!maquina.pedirInicio(tabId)) return { ok: false, motivo: 'aguardar' };
  avisarEstado();
  const fluxos = [];
  let ctx = null;
  let idCriado = null;
  try {
    // 1) som da aba (o identificador vence em segundos: e o primeiro a ser usado)
    let aba;
    try {
      aba = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
        video: false,
      });
    } catch (e) {
      throw new ErroGravador('captura-aba', String(e?.message || e));
    }
    fluxos.push(aba);
    // Escuta o fim da captura (aba fechada) JA AGORA: se acontecer durante o resto do inicio, o
    // evento nao se perde (achado da revisao de 09/11/2026).
    const trilhaAba = aba.getAudioTracks()[0];
    let abaEncerrada = !trilhaAba || trilhaAba.readyState === 'ended';
    if (trilhaAba) {
      trilhaAba.addEventListener('ended', () => {
        abaEncerrada = true;
        if (maquina.estado === 'gravando' && sessao && sessao.id === idCriado) pararESalvar().catch(() => {});
      });
    }

    // 2) microfone (a permissao foi dada antes na pagina permissao.html)
    let mic;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      throw new ErroGravador(e?.name === 'NotAllowedError' ? 'microfone' : 'microfone-falhou', String(e?.message || e));
    }
    fluxos.push(mic);

    // 3) mixer: devolve a aba ao alto-falante e junta os dois lados em estereo
    ctx = new AudioContext();
    await ctx.resume();
    const mixer = montarMixer({
      ctx,
      fonteVoce: ctx.createMediaStreamSource(mic),
      fonteCliente: ctx.createMediaStreamSource(aba),
      saidaMonitor: ctx.destination,
    });

    // 4) gravador (criado antes de registrar: se o formato falhar, nao sobra registro vazio)
    const id = crypto.randomUUID();
    const meta = { id, nome, origem, tabId, inicio: Date.now() };
    const banco = await armazem();
    const gravador = criarGravador({ stream: mixer.stream, armazem: banco, idGravacao: id });
    if (abaEncerrada) throw new ErroGravador('captura-aba', 'a aba foi fechada antes de a gravacao comecar');
    await banco.criarGravacao({ id, nome, origem, inicio: meta.inicio, situacao: 'gravando' });
    idCriado = id;
    gravador.iniciar();

    sessao = { id, meta, ctx, fluxos, mixer, gravador, detector: criarDetectorSilencio(), alerta: false, relogio: null };
    sessao.relogio = setInterval(vigiar, 500);
    maquina.confirmarInicio();
    avisarEstado();
    if (abaEncerrada) pararESalvar().catch(() => {}); // fechou no ultimo instante: salva o que houver
    return { ok: true, origem, nome };
  } catch (e) {
    pararFluxos(fluxos);
    if (ctx) ctx.close().catch(() => {});
    if (idCriado) armazem().then((b) => b.apagarGravacao(idCriado)).catch(() => {});
    sessao = null;
    maquina.falharInicio();
    avisarEstado();
    return { ok: false, motivo: e instanceof ErroGravador ? e.codigo : 'interno', detalhe: String(e?.message || e) };
  }
}

// A cada meio segundo: aviso de microfone mudo (silencio absoluto por 10 s).
function vigiar() {
  if (!sessao || maquina.estado !== 'gravando') return;
  const mudou = sessao.detector.alimentar(sessao.mixer.medir().voce, Date.now());
  if (mudou) {
    sessao.alerta = mudou === 'alerta';
    avisarEstado();
  }
}

async function pararESalvar() {
  if (!maquina.pedirParada()) return { ok: false, motivo: 'nada-a-parar' };
  const s = sessao;
  clearInterval(s.relogio);
  s.alerta = false;
  avisarEstado();
  let arquivo;
  try {
    arquivo = await s.gravador.parar();
  } catch (e) {
    // O que ja foi para o armazem continua la: a gravacao aparece em "nao salvas".
    await concluir(s.id, false);
    return { ok: false, motivo: 'salvar', detalhe: String(e?.message || e) };
  } finally {
    pararFluxos(s.fluxos);
    s.mixer.desmontar();
    s.ctx.close().catch(() => {});
  }
  try {
    await (await armazem()).marcar(s.id, 'salvando');
  } catch {
    // marcar e so informativo (recuperacao usa a marca para o nome); o arquivo ja esta na memoria
  }
  return entregar(s.id, s.meta.nome, arquivo);
}

// Entrega o arquivo ao service worker, que salva em Downloads e depois avisa 'salvo' ou 'falhou-salvar'.
async function entregar(idGravacao, nome, arquivo) {
  const url = URL.createObjectURL(arquivo);
  urls.set(idGravacao, url);
  emEntrega.add(idGravacao);
  let r;
  try {
    r = await avisarSw('arquivo-pronto', { idGravacao, url, nome });
  } catch (e) {
    r = { ok: false, motivo: 'salvar', detalhe: String(e?.message || e) };
  }
  if (!r || !r.ok) {
    await concluir(idGravacao, false);
    return r || { ok: false, motivo: 'salvar' };
  }
  return r;
}

// Fim do salvamento. Sempre solta a maquina e o endereco blob, mesmo se o armazem falhar
// (achado da revisao de 09/11/2026: falha aqui deixava tudo preso em "salvando").
// Vale tambem para gravacao que este offscreen nao conhece (foi recriado no meio do download):
// salvo = apaga a copia de seguranca; falha = marca pendente.
async function concluir(idGravacao, sucesso) {
  try {
    const banco = await armazem();
    if (sucesso) {
      await banco.apagarGravacao(idGravacao);
    } else {
      // Mantem "gravando" quando ja era (a recuperacao continua marcando _recuperada no nome).
      const g = await banco.lerGravacao(idGravacao);
      if (g && g.situacao !== 'gravando') await banco.marcar(idGravacao, 'pendente');
    }
  } catch (e) {
    console.error('Gravador: falha no armazem ao concluir', e);
  } finally {
    const url = urls.get(idGravacao);
    if (url) {
      URL.revokeObjectURL(url);
      urls.delete(idGravacao);
    }
    emEntrega.delete(idGravacao);
    if (sessao && sessao.id === idGravacao && maquina.estado === 'salvando') {
      sessao = null;
      maquina.concluirSalvamento();
      avisarEstado();
    }
  }
  return { ok: true };
}

async function recuperar(idGravacao) {
  if ((sessao && sessao.id === idGravacao) || emEntrega.has(idGravacao)) return { ok: false, motivo: 'em-andamento' };
  const banco = await armazem();
  const gravacao = await banco.lerGravacao(idGravacao);
  if (!gravacao) return { ok: false, motivo: 'nao-encontrada' };
  const arquivo = await banco.montarArquivo(idGravacao);
  if (arquivo.size === 0) {
    await banco.apagarGravacao(idGravacao);
    return { ok: false, motivo: 'vazia' };
  }
  return entregar(idGravacao, nomeParaRecuperar(gravacao), arquivo);
}

async function descartar(idGravacao) {
  if ((sessao && sessao.id === idGravacao) || emEntrega.has(idGravacao)) return { ok: false, motivo: 'em-andamento' };
  await (await armazem()).apagarGravacao(idGravacao);
  return { ok: true };
}

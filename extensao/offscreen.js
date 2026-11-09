// Documento offscreen: onde a gravacao acontece de verdade. Captura o som da aba e o microfone,
// monta o mixer (esquerdo = voce, direito = cliente, aba de volta no alto-falante), grava em fatias
// (memoria + armazem) e entrega o arquivo ao service worker para salvar em Downloads.
// E a UNICA fonte da situacao da gravacao (o service worker dorme). Mapa: docs/gravacao.md.
// Testado no Chrome de verdade, com o Chrome da extensao falso por fora: testes/audio/offscreen.test.js.
import { montarMixer } from './lib/mixer.js';
import { criarGravador, ErroGravador } from './lib/gravador.js';
import { abrirArmazem } from './lib/armazem.js';
import { criarMaquina, gravacoesParaRecuperar } from './lib/estado.js';
import { criarDetectorSilencio } from './lib/silencio.js';
import { nomeParaRecuperar } from './lib/nomes.js';

// Tempos da vigia. Exportados para o teste encurtar (o valor de producao e este).
export const AJUSTES = { silencioVoceMs: 10000, silencioClienteMs: 30000, vigiaMs: 500, fatiaMs: 5000 };

const maquina = criarMaquina();
let sessao = null; // { id, meta, ctx, fluxos, mixer, gravador, detectores, alertas, semCopia, relogio }
let armazemPromessa = null;
// Gravacoes sendo salvas agora: id -> { url, arquivo, nome, origem, inicio }. Ficam fora da lista
// de recuperaveis enquanto o download nao termina.
const entregas = new Map();
// Gravacoes que NAO foram salvas e nao couberam no armazem (cópia de seguranca quebrada): ficam so
// na memoria deste documento, aparecem em "nao salvas" e podem ser salvas de novo — ate o Chrome
// fechar (2a rodada de revisao, 09/11/2026: antes, o blob era revogado e a gravacao sumia).
const naMemoria = new Map();

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

const alertasAtuais = () => (sessao ? [...sessao.alertas] : []);

function resumo() {
  return {
    ok: true,
    estado: maquina.estado,
    atual: sessao
      ? {
          id: sessao.id,
          tabId: sessao.meta.tabId,
          origem: sessao.meta.origem,
          nome: sessao.meta.nome,
          inicio: sessao.meta.inicio,
          microfone: sessao.meta.microfone,
        }
      : null,
    niveis: sessao && maquina.estado === 'gravando' ? sessao.mixer.medir() : null,
    alertas: alertasAtuais(),
    emEntrega: [...entregas.keys()],
    naMemoria: [...naMemoria.entries()].map(([id, g]) => ({ id, nome: g.nome, origem: g.origem, inicio: g.inicio, situacao: 'memoria' })),
  };
}

function avisarEstado() {
  avisarSw('estado-mudou', { estado: maquina.estado, alertas: alertasAtuais(), origem: sessao ? sessao.meta.origem : null }).catch(() => {});
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
  let registrado = false;
  const id = crypto.randomUUID();
  let banco = null;
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
    // evento nao se perde (revisao de 09/11/2026).
    const trilhaAba = aba.getAudioTracks()[0];
    let abaEncerrada = !trilhaAba || trilhaAba.readyState === 'ended';
    if (trilhaAba) {
      trilhaAba.addEventListener('ended', () => {
        abaEncerrada = true;
        if (maquina.estado === 'gravando' && sessao && sessao.id === id) pararESalvar().catch(() => {});
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

    // 4) gravador. A copia de seguranca (armazem) NAO e pre-requisito: se ela falhar, grava so na
    //    memoria e avisa (revisao de 09/11/2026: antes, IndexedDB com problema impedia gravar).
    // Nome do microfone aberto (o padrao do Chrome): a janelinha mostra, para o usuario conferir se e
    // o headset ou o do computador (pergunta do usuario na conferencia local de 09/11/2026).
    const trilhaMic = mic.getAudioTracks()[0];
    const meta = { id, nome, origem, tabId, inicio: Date.now(), microfone: (trilhaMic && trilhaMic.label) || '' };
    try {
      banco = await armazem();
    } catch (e) {
      console.error('Gravador: armazem indisponivel, gravando sem copia de seguranca', e);
    }
    let semCopia = !banco;
    const copia = { guardarPedaco: (...args) => (semCopia ? Promise.resolve() : banco.guardarPedaco(...args)) };
    const gravador = criarGravador({
      stream: mixer.stream,
      armazem: copia,
      idGravacao: id,
      fatiaMs: AJUSTES.fatiaMs,
      aoFalhar: (erro) => gravadorFalhou(id, erro),
    });
    if (abaEncerrada) throw new ErroGravador('captura-aba', 'a aba foi fechada antes de a gravacao comecar');
    if (!semCopia) {
      try {
        await banco.criarGravacao({ id, nome, origem, inicio: meta.inicio, situacao: 'gravando' });
        registrado = true;
      } catch (e) {
        console.error('Gravador: nao registrou a copia de seguranca', e);
        semCopia = true;
      }
    }
    gravador.iniciar();

    sessao = {
      id,
      meta,
      ctx,
      fluxos,
      mixer,
      gravador,
      detectores: {
        voce: criarDetectorSilencio({ duracaoMs: AJUSTES.silencioVoceMs }),
        cliente: criarDetectorSilencio({ duracaoMs: AJUSTES.silencioClienteMs }),
      },
      alertas: new Set(semCopia ? ['sem-copia'] : []),
      semCopia: () => semCopia,
      relogio: null,
    };
    sessao.relogio = setInterval(vigiar, AJUSTES.vigiaMs);
    maquina.confirmarInicio();
    avisarEstado();
    if (abaEncerrada) pararESalvar().catch(() => {}); // fechou no ultimo instante: salva o que houver
    return { ok: true, origem, nome };
  } catch (e) {
    pararFluxos(fluxos);
    if (ctx) ctx.close().catch(() => {});
    if (registrado) banco.apagarGravacao(id).catch(() => {});
    sessao = null;
    maquina.falharInicio();
    avisarEstado();
    return { ok: false, motivo: e instanceof ErroGravador ? e.codigo : 'interno', detalhe: String(e?.message || e) };
  }
}

// A cada meio segundo: avisos de microfone mudo (10 s), de aba muda (30 s: a chamada pode estar
// noutra janela) e de copia de seguranca falhando.
function vigiar() {
  if (!sessao || maquina.estado !== 'gravando') return;
  const agora = Date.now();
  const niveis = sessao.mixer.medir();
  const antes = [...sessao.alertas].sort().join();
  const aplicar = (codigo, mudanca) => {
    if (mudanca === 'alerta') sessao.alertas.add(codigo);
    if (mudanca === 'normal') sessao.alertas.delete(codigo);
  };
  aplicar('microfone-mudo', sessao.detectores.voce.alimentar(niveis.voce, agora));
  aplicar('aba-muda', sessao.detectores.cliente.alimentar(niveis.cliente, agora));
  if (sessao.semCopia() || sessao.gravador.erroArmazem) sessao.alertas.add('sem-copia');
  if ([...sessao.alertas].sort().join() !== antes) avisarEstado();
}

// Erro do MediaRecorder no meio: para, salva o que ha e deixa aviso pendente no icone.
function gravadorFalhou(id, erro) {
  console.error('Gravador: o MediaRecorder parou com erro', erro);
  if (!sessao || sessao.id !== id || maquina.estado !== 'gravando') return;
  avisarSw('aviso', { codigo: 'gravador-parou' }).catch(() => {});
  pararESalvar().catch(() => {});
}

async function pararESalvar() {
  if (maquina.estado === 'salvando') return { ok: false, motivo: 'aguardar' }; // Parar duplo (atalho + clique)
  if (!maquina.pedirParada()) return { ok: false, motivo: 'nada-a-parar' };
  const s = sessao;
  clearInterval(s.relogio);
  s.alertas.clear();
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
  // copiaIncompleta: alguma fatia nao entrou no armazem (buraco na copia de seguranca).
  const copiaIncompleta = Boolean(s.gravador.erroArmazem);
  return entregar(s.id, { nome: s.meta.nome, origem: s.meta.origem, inicio: s.meta.inicio, copiaIncompleta }, arquivo);
}

// Entrega o arquivo ao service worker, que salva em Downloads e depois avisa 'salvo' ou 'falhou-salvar'.
// O arquivo fica guardado em 'entregas' ate o fim: se o salvamento falhar, ainda da para guarda-lo.
async function entregar(idGravacao, meta, arquivo) {
  const url = URL.createObjectURL(arquivo);
  entregas.set(idGravacao, { url, arquivo, nome: meta.nome, origem: meta.origem, inicio: meta.inicio, copiaIncompleta: Boolean(meta.copiaIncompleta) });
  let r;
  try {
    r = await avisarSw('arquivo-pronto', { idGravacao, url, nome: meta.nome });
  } catch (e) {
    r = { ok: false, motivo: 'salvar', detalhe: String(e?.message || e) };
  }
  if (!r || !r.ok) {
    await concluir(idGravacao, false);
    return r || { ok: false, motivo: 'salvar' };
  }
  return r;
}

// Onde fica uma gravacao que NAO foi salva. Devolve 'armazem', 'memoria' ou 'nenhuma'.
// - ja estava no armazem e o arquivo esta na mao: o arquivo SEMPRE substitui os pedacos (numa
//   transacao so). Ele e sempre o melhor que existe: inteiro (veio da memoria do gravador) ou igual
//   a copia (veio dela, na recuperacao). 4a rodada de revisao, 09/11/2026: decidir pela marca
//   copiaIncompleta perdia a marca na segunda tentativa e o inteiro era descartado. Se a troca falhar,
//   a copia antiga fica, o inteiro vai para a memoria e a copia furada e marcada "gravando" (ganha
//   _recuperada se o Chrome fechar antes de salvar);
// - ja estava no armazem, sem arquivo na mao: fica la (mantem "gravando" quando ja era);
// - nunca foi registrada (gravou sem copia de seguranca): tenta guardar no armazem AGORA (ele pode
//   ter voltado); se nao der, fica na memoria.
async function guardarNaoSalva(id, entrega) {
  const paraMemoria = () => {
    naMemoria.set(id, { arquivo: entrega.arquivo, nome: entrega.nome, origem: entrega.origem, inicio: entrega.inicio });
    return 'memoria';
  };
  let banco = null;
  let registrou = false;
  try {
    banco = await armazem();
    const g = await banco.lerGravacao(id);
    if (g) {
      if (entrega) {
        try {
          await banco.substituirPedacos(id, entrega.arquivo);
        } catch (e) {
          console.error('Gravador: a copia nao pode ser trocada pelo arquivo inteiro; ele fica na memoria', e);
          if (entrega.copiaIncompleta && g.situacao !== 'gravando') await banco.marcar(id, 'gravando').catch(() => {});
          return paraMemoria();
        }
      }
      if (g.situacao !== 'gravando') await banco.marcar(id, 'pendente');
      return 'armazem';
    }
    if (!entrega) return 'nenhuma';
    await banco.criarGravacao({ id, nome: entrega.nome, origem: entrega.origem, inicio: entrega.inicio, situacao: 'pendente' });
    registrou = true;
    await banco.guardarPedaco(id, 0, entrega.arquivo);
    return 'armazem';
  } catch (e) {
    console.error('Gravador: nao coube no armazem, fica na memoria', e);
    // Nao deixa registro sem audio (senao a mesma gravacao apareceria duas vezes na lista).
    if (registrou) await banco.apagarGravacao(id).catch(() => {});
    if (!entrega) return 'nenhuma';
    return paraMemoria();
  }
}

// Fim do salvamento. Sempre solta a maquina e o endereco blob, mesmo se o armazem falhar
// (revisao de 09/11/2026: falha aqui deixava tudo preso em "salvando").
// Vale tambem para gravacao que este offscreen nao conhece (foi recriado no meio do download):
// salvo = apaga a copia de seguranca; falha = guarda onde der e avisa onde ficou.
async function concluir(idGravacao, sucesso) {
  const entrega = entregas.get(idGravacao);
  let guardada = null;
  try {
    if (sucesso) {
      const banco = await armazem();
      try {
        await banco.apagarGravacao(idGravacao);
      } catch (e) {
        // O arquivo esta salvo; so a copia ficou. Marca 'salva' para nao aparecer como "nao salva".
        await banco.marcar(idGravacao, 'salva');
        throw e;
      }
    } else {
      guardada = await guardarNaoSalva(idGravacao, entrega);
    }
  } catch (e) {
    console.error('Gravador: falha no armazem ao concluir', e);
  } finally {
    if (entrega) URL.revokeObjectURL(entrega.url);
    entregas.delete(idGravacao);
    if (sessao && sessao.id === idGravacao && maquina.estado === 'salvando') {
      sessao = null;
      maquina.concluirSalvamento();
      avisarEstado();
    }
  }
  if (sucesso) {
    await verificarSeTudoSalvo();
  } else {
    // O aviso diz a verdade sobre onde a gravacao ficou (antes dizia "esta na lista" mesmo sem estar).
    const codigo = guardada === 'memoria' ? 'nao-salva-memoria' : guardada === 'nenhuma' ? 'nao-salva-perdida' : 'nao-salva';
    avisarSw('aviso', { codigo }).catch(() => {});
  }
  return { ok: true, guardada };
}

// O aviso "nao salva" do icone so sai quando nao sobra nenhuma gravacao por salvar (2a rodada de
// revisao, 09/11/2026: antes, nunca saia, e o "!" ficava mentindo depois do Salvar).
// Com o armazem quebrado nao da para conferir a lista dele: o aviso "so na memoria" sai mesmo assim
// (a memoria esta vazia, entao o que estava nela foi resolvido) e o "nao salva" fica (3a rodada de
// revisao, 09/11/2026: antes, o "!" ficava mentindo ate fechar o Chrome).
async function verificarSeTudoSalvo() {
  if (naMemoria.size) return;
  let codigos = ['nao-salva', 'nao-salva-memoria'];
  try {
    const banco = await armazem();
    const ocupadas = [...entregas.keys(), ...(sessao ? [sessao.id] : [])];
    if (gravacoesParaRecuperar(await banco.listarGravacoes(), ocupadas).length) codigos = ['nao-salva-memoria'];
  } catch {
    codigos = ['nao-salva-memoria'];
  }
  avisarSw('limpar-pendente', { codigos }).catch(() => {});
}

async function recuperar(idGravacao) {
  if ((sessao && sessao.id === idGravacao) || entregas.has(idGravacao)) return { ok: false, motivo: 'em-andamento' };
  const daMemoria = naMemoria.get(idGravacao);
  if (daMemoria) {
    naMemoria.delete(idGravacao); // volta para a memoria se falhar de novo (guardarNaoSalva)
    return entregar(idGravacao, daMemoria, daMemoria.arquivo);
  }
  const banco = await armazem();
  const gravacao = await banco.lerGravacao(idGravacao);
  if (!gravacao) return { ok: false, motivo: 'nao-encontrada' };
  const arquivo = await banco.montarArquivo(idGravacao);
  if (arquivo.size === 0) {
    await banco.apagarGravacao(idGravacao);
    return { ok: false, motivo: 'vazia' };
  }
  return entregar(idGravacao, { nome: nomeParaRecuperar(gravacao), origem: gravacao.origem, inicio: gravacao.inicio }, arquivo);
}

// Descartar da memoria nao depende do armazem (3a rodada de revisao, 09/11/2026: com o armazem
// quebrado, o item sumia e a janelinha dizia "Algo deu errado").
async function descartar(idGravacao) {
  if ((sessao && sessao.id === idGravacao) || entregas.has(idGravacao)) return { ok: false, motivo: 'em-andamento' };
  const estavaNaMemoria = naMemoria.delete(idGravacao);
  try {
    await (await armazem()).apagarGravacao(idGravacao);
  } catch (e) {
    if (!estavaNaMemoria) throw e; // so estava no armazem e ele falhou: e erro de verdade
  }
  await verificarSeTudoSalvo();
  return { ok: true };
}

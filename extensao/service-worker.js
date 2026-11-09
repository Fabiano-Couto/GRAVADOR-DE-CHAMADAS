// Service worker: orquestra o clique (ou atalho), a captura da aba, o icone e o salvamento.
// NAO guarda a situacao da gravacao: o service worker dorme depois de 30 s parado. Quem sabe se
// esta gravando e o documento offscreen (offscreen.js). Mapa completo: docs/gravacao.md.
import { origemDaUrl, nomeArquivo, opcoesDownload } from './lib/nomes.js';
import { decidirAlternar, gravacoesParaRecuperar, juntarNaoSalvas } from './lib/estado.js';
import { abrirArmazem } from './lib/armazem.js';
import { textoDoMotivo } from './lib/mensagens.js';
import { anotarSalvamento, retirarSalvamento, arquivoAceito } from './lib/downloads.js';
import { aparenciaDoIcone, CORES } from './lib/icone.js';
import { comPendente, semPendentes, depoisDeVisto } from './lib/pendentes.js';

const MAXIMO_ULTIMAS = 5;

// ---------- eventos ----------

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') abrirPaginaPermissao();
});

chrome.commands.onCommand.addListener((comando, aba) => {
  if (comando !== 'alternar-gravacao') return;
  alternar(aba)
    .then((r) => {
      if (!r.ok) avisarErroNoIcone(r);
    })
    .catch((e) => avisarErroNoIcone({ ok: false, motivo: 'interno', detalhe: String(e?.message || e) }));
});

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (!msg || msg.alvo !== 'sw') return false;
  tratarMensagem(msg).then(responder, (e) => responder({ ok: false, motivo: 'interno', detalhe: String(e?.message || e) }));
  return true;
});

chrome.downloads.onChanged.addListener((delta) => {
  const fim = delta.state?.current;
  if (fim !== 'complete' && fim !== 'interrupted') return;
  concluirDownload(delta.id, fim).catch((e) => console.error('Gravador: falha ao concluir download', e));
});

async function tratarMensagem(msg) {
  switch (msg.tipo) {
    case 'alternar':
      return alternar(await chrome.tabs.get(msg.tabId));
    case 'estado':
      return estadoAtual();
    case 'recuperaveis':
      return recuperaveis();
    case 'recuperar':
      await garantirOffscreen();
      return perguntarOffscreen('recuperar', { idGravacao: msg.idGravacao });
    case 'descartar':
      await garantirOffscreen();
      return perguntarOffscreen('descartar', { idGravacao: msg.idGravacao });
    case 'estado-mudou':
      await atualizarIcone(msg);
      return { ok: true };
    case 'arquivo-pronto':
      return salvarArquivo(msg);
    case 'aviso':
      await mudarPendentes((lista) => comPendente(lista, msg.codigo));
      return { ok: true };
    case 'limpar-pendente':
      await mudarPendentes((lista) => semPendentes(lista, msg.codigos || []));
      return { ok: true };
    case 'pendente-visto':
      await mudarPendentes(depoisDeVisto);
      return { ok: true };
    default:
      return { ok: false, motivo: 'desconhecido' };
  }
}

// ---------- gravar / parar ----------

const INTERNAS = ['chrome://', 'chrome-extension://', 'chrome-untrusted://', 'devtools://', 'edge://', 'about:', 'view-source:'];

function paginaInterna(url) {
  if (!url) return false; // sem endereco (nao deveria acontecer com activeTab): a captura diz se pode
  if (INTERNAS.some((p) => url.startsWith(p))) return true;
  try {
    return new URL(url).hostname === 'chromewebstore.google.com'; // a loja nao pode ser capturada
  } catch {
    return false;
  }
}

async function alternar(aba) {
  if (!aba || aba.id === undefined) return { ok: false, motivo: 'sem-aba' };
  if (paginaInterna(aba.url)) return { ok: false, motivo: 'pagina-interna' };

  await garantirOffscreen();
  const atual = await perguntarOffscreen('estado');
  const acao = decidirAlternar(atual.estado, atual.atual ? atual.atual.tabId : null, aba.id);
  if (acao === 'parar') return perguntarOffscreen('parar');
  if (acao === 'recusar-outra-aba') return { ok: false, motivo: 'outra-aba', origem: atual.atual?.origem };
  if (acao === 'aguardar') return { ok: false, motivo: 'aguardar' };

  // Sem microfone autorizado nao captura a aba (capturar emudece a aba por um instante a toa).
  const permissao = await perguntarOffscreen('permissao-microfone');
  if (permissao.estado !== 'granted') {
    await abrirPaginaPermissao();
    return { ok: false, motivo: 'microfone' };
  }

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: aba.id });
  } catch (e) {
    return { ok: false, motivo: 'captura-aba', detalhe: String(e?.message || e) };
  }
  const origem = origemDaUrl(aba.url);
  return perguntarOffscreen('iniciar', { streamId, tabId: aba.id, origem, nome: nomeArquivo(new Date(), origem) });
}

async function estadoAtual() {
  if (!(await existeOffscreen())) return { ok: true, estado: 'parado', atual: null, niveis: null, alertas: [], emEntrega: [] };
  return perguntarOffscreen('estado');
}

async function recuperaveis() {
  const ocupadas = [];
  let naMemoria = [];
  if (await existeOffscreen()) {
    const e = await perguntarOffscreen('estado');
    if (e.atual) ocupadas.push(e.atual.id);
    ocupadas.push(...(e.emEntrega || []));
    naMemoria = e.naMemoria || []; // nao salvas que nao couberam no armazem (so ate fechar o Chrome)
  }
  const banco = await abrirArmazem();
  try {
    const todas = await banco.listarGravacoes();
    // 'salva' = download concluido, so a copia nao tinha sido apagada: tenta apagar de novo agora.
    for (const g of todas.filter((g) => g.situacao === 'salva')) await banco.apagarGravacao(g.id).catch(() => {});
    const lista = gravacoesParaRecuperar(juntarNaoSalvas(todas, naMemoria), ocupadas);
    return { ok: true, lista: lista.map(({ id, nome, origem, inicio, situacao }) => ({ id, nome, origem, inicio, situacao })) };
  } finally {
    banco.fechar();
  }
}

// ---------- salvar em Downloads ----------

async function salvarArquivo({ idGravacao, url, nome }) {
  if (!arquivoAceito(url, nome, chrome.runtime.getURL(''))) {
    return { ok: false, motivo: 'salvar', detalhe: 'endereço ou nome de arquivo recusado' };
  }
  await anotarSalvamento(chrome.storage.session, url, { idGravacao, nome });
  try {
    const downloadId = await chrome.downloads.download(opcoesDownload(url, nome));
    return { ok: true, nome, downloadId };
  } catch (e) {
    // O offscreen recebe a resposta de falha, guarda a gravacao onde der e manda o aviso certo
    // (so ele sabe se ela ficou no armazem ou so na memoria).
    await retirarSalvamento(chrome.storage.session, url);
    return { ok: false, motivo: 'salvar', detalhe: String(e?.message || e) };
  }
}

async function concluirDownload(downloadId, fim) {
  const [item] = await chrome.downloads.search({ id: downloadId });
  if (!item) return;
  const info = await retirarSalvamento(chrome.storage.session, item.url);
  if (!info) return; // download que nao e nosso
  await garantirOffscreen();
  if (fim === 'complete') {
    await registrarUltima({ downloadId, nome: info.nome, quando: Date.now() });
    await perguntarOffscreen('salvo', { idGravacao: info.idGravacao });
  } else {
    // O offscreen guarda a gravacao onde der e manda o aviso pendente com o texto certo; o icone
    // fica com "!" ate nao sobrar nada por salvar (revisoes de 09/11/2026).
    await perguntarOffscreen('falhou-salvar', { idGravacao: info.idGravacao });
  }
}

async function registrarUltima(registro) {
  const { ultimas = [] } = await chrome.storage.local.get('ultimas');
  await chrome.storage.local.set({ ultimas: [registro, ...ultimas].slice(0, MAXIMO_ULTIMAS) });
}

// ---------- offscreen ----------

let criandoOffscreen = null;

async function existeOffscreen() {
  const contextos = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contextos.length > 0;
}

async function garantirOffscreen() {
  if (await existeOffscreen()) return;
  if (!criandoOffscreen) {
    criandoOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Gravar o som da aba e do microfone durante a chamada.',
      })
      .finally(() => {
        criandoOffscreen = null;
      });
  }
  await criandoOffscreen;
}

function perguntarOffscreen(tipo, dados = {}) {
  return chrome.runtime.sendMessage({ alvo: 'offscreen', tipo, ...dados });
}

// ---------- icone ----------

// Regra da aparencia em lib/icone.js (testada); aqui so aplica.
async function atualizarIcone(r) {
  const { pendentes = [] } = await chrome.storage.session.get('pendentes');
  const a = aparenciaDoIcone(r, pendentes);
  await chrome.action.setBadgeText({ text: a.texto });
  await chrome.action.setBadgeBackgroundColor({ color: a.cor });
  await chrome.action.setTitle({ title: a.titulo });
}

// Avisos que aconteceram sem ninguem olhando (regras em lib/pendentes.js) e o icone em seguida.
// Em fila: duas mudancas proximas (dois avisos, aviso + limpar) nao se atropelam entre o ler e o
// gravar (3a rodada de revisao, 09/11/2026).
let filaPendentes = Promise.resolve();
function mudarPendentes(mudanca) {
  filaPendentes = filaPendentes
    .then(async () => {
      const { pendentes = [] } = await chrome.storage.session.get('pendentes');
      await chrome.storage.session.set({ pendentes: mudanca(pendentes) });
      await atualizarIcone(await estadoAtual().catch(() => ({ estado: 'parado' })));
    })
    .catch((e) => console.error('Gravador: falha ao mudar avisos pendentes', e));
  return filaPendentes;
}

// Erro no atalho de teclado (sem janelinha aberta): marca o icone por 5 s e poe o motivo na dica.
function avisarErroNoIcone(r) {
  chrome.action.setBadgeText({ text: 'X' });
  chrome.action.setBadgeBackgroundColor({ color: CORES.neutra });
  chrome.action.setTitle({ title: textoDoMotivo(r) });
  setTimeout(() => {
    estadoAtual()
      .then(atualizarIcone)
      .catch(() => atualizarIcone({ estado: 'parado' }));
  }, 5000);
}

// Reaproveita a aba da permissao se ja estiver aberta (revisao de 09/11/2026: cada clique sem
// permissao abria mais uma aba).
// (runtime.getContexts lista so paginas da PROPRIA extensao; tabs.query com filtro de endereco seria
// ignorado sem a permissao "tabs" e devolveria todas as abas.)
async function abrirPaginaPermissao() {
  const endereco = chrome.runtime.getURL('permissao.html');
  const abertas = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [endereco] });
  if (abertas.length) {
    await chrome.tabs.update(abertas[0].tabId, { active: true });
    await chrome.windows.update(abertas[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: endereco });
}

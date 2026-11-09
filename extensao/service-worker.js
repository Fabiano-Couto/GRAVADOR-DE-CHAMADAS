// Service worker: orquestra o clique (ou atalho), a captura da aba, o icone e o salvamento.
// NAO guarda a situacao da gravacao: o service worker dorme depois de 30 s parado. Quem sabe se
// esta gravando e o documento offscreen (offscreen.js). Mapa completo: docs/gravacao.md.
import { origemDaUrl, nomeArquivo, opcoesDownload } from './lib/nomes.js';
import { decidirAlternar, gravacoesParaRecuperar } from './lib/estado.js';
import { abrirArmazem } from './lib/armazem.js';
import { textoDoMotivo } from './lib/mensagens.js';
import { anotarSalvamento, retirarSalvamento, arquivoAceito } from './lib/downloads.js';

const COR_GRAVANDO = '#D93025';
const COR_ALERTA = '#E37400';
const COR_NEUTRA = '#5F6368';
const TITULO = 'Gravador de Chamadas';
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
      atualizarIcone(msg);
      return { ok: true };
    case 'arquivo-pronto':
      return salvarArquivo(msg);
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
  if (!(await existeOffscreen())) return { ok: true, estado: 'parado', atual: null, niveis: null, alerta: false };
  return perguntarOffscreen('estado');
}

async function recuperaveis() {
  const ocupadas = [];
  if (await existeOffscreen()) {
    const e = await perguntarOffscreen('estado');
    if (e.atual) ocupadas.push(e.atual.id);
    ocupadas.push(...(e.emEntrega || []));
  }
  const banco = await abrirArmazem();
  try {
    const lista = gravacoesParaRecuperar(await banco.listarGravacoes(), ocupadas);
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
    await chrome.downloads.download(opcoesDownload(url, nome));
    return { ok: true, nome };
  } catch (e) {
    // O offscreen recebe a resposta de falha e conclui como 'falhou-salvar' (gravacao fica guardada).
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

// Recebe tanto o aviso 'estado-mudou' (origem no topo) quanto o resumo do offscreen (origem em
// atual.origem) — achado da revisao de 09/11/2026: a dica mostrava "Gravando undefined".
function atualizarIcone(r) {
  const { estado, alerta } = r;
  const origem = r.origem || (r.atual && r.atual.origem) || 'a aba';
  if (estado === 'gravando') {
    chrome.action.setBadgeText({ text: alerta ? '!' : 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: alerta ? COR_ALERTA : COR_GRAVANDO });
    chrome.action.setTitle({ title: alerta ? 'Gravando ' + origem + ': o microfone está sem som!' : 'Gravando ' + origem });
  } else if (estado === 'iniciando' || estado === 'salvando') {
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: COR_NEUTRA });
    chrome.action.setTitle({ title: estado === 'salvando' ? 'Salvando a gravação' : 'Iniciando a gravação' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: TITULO });
  }
}

// Erro no atalho de teclado (sem janelinha aberta): marca o icone por 5 s e poe o motivo na dica.
function avisarErroNoIcone(r) {
  chrome.action.setBadgeText({ text: 'X' });
  chrome.action.setBadgeBackgroundColor({ color: COR_NEUTRA });
  chrome.action.setTitle({ title: textoDoMotivo(r) });
  setTimeout(() => {
    estadoAtual()
      .then(atualizarIcone)
      .catch(() => atualizarIcone({ estado: 'parado' }));
  }, 5000);
}

async function abrirPaginaPermissao() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('permissao.html') });
}

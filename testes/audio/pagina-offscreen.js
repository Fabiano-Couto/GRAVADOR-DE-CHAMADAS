// Roda o offscreen.js DE VERDADE (o mesmo arquivo da extensao) com o Chrome da extensao falso por
// fora: chrome.runtime (mensagens), captura da aba e microfone (tons de 1000 Hz e 440 Hz), permissao.
// Cada cenario devolve o que aconteceu; o teste em Node (offscreen.test.js) confere.
import { abrirArmazem } from '/extensao/lib/armazem.js';

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const paraBase64 = (blob) =>
  new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(blob);
  });

// ---------- enderecos blob: guarda o arquivo de cada um e anota os revogados ----------
// (a pagina roda sob a politica da extensao, connect-src 'none': nao da para ler o blob com fetch)
const blobs = new Map();
const revogados = new Set();
const criarUrlOriginal = URL.createObjectURL.bind(URL);
const revogarUrlOriginal = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  const url = criarUrlOriginal(blob);
  blobs.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url) => {
  revogados.add(url);
  revogarUrlOriginal(url);
};

// ---------- chrome.runtime falso ----------
const ouvintes = [];
let paraSw = [];
let respostaSw = async () => ({ ok: true });
window.chrome = {
  runtime: {
    onMessage: { addListener: (fn) => ouvintes.push(fn) },
    sendMessage: async (msg) => {
      paraSw.push(msg);
      return respostaSw(msg);
    },
  },
};
function enviar(msg) {
  return new Promise((resolver) => {
    for (const fn of ouvintes) fn({ alvo: 'offscreen', ...msg }, {}, resolver);
  });
}

// ---------- captura da aba e microfone falsos ----------
const ctxFontes = new AudioContext({ sampleRate: 48000 });
let ultimaAba = null;
let ultimoMic = null;
const roteiro = { fecharAbaDuranteMic: false, falharMic: null };
function fluxoDeTom(frequencia) {
  const oscilador = new OscillatorNode(ctxFontes, { frequency: frequencia });
  const volume = new GainNode(ctxFontes, { gain: 0.3 });
  const destino = new MediaStreamAudioDestinationNode(ctxFontes);
  oscilador.connect(volume).connect(destino);
  oscilador.start();
  return destino.stream;
}
function fecharAba() {
  const trilha = ultimaAba.getAudioTracks()[0];
  trilha.stop();
  trilha.dispatchEvent(new Event('ended'));
}
navigator.mediaDevices.getUserMedia = async (pedido) => {
  await ctxFontes.resume();
  if (pedido && pedido.audio && pedido.audio.mandatory && pedido.audio.mandatory.chromeMediaSource === 'tab') {
    ultimaAba = fluxoDeTom(1000);
    return ultimaAba;
  }
  if (roteiro.falharMic) throw new DOMException('microfone (falso)', roteiro.falharMic);
  if (roteiro.fecharAbaDuranteMic) fecharAba();
  ultimoMic = fluxoDeTom(440);
  return ultimoMic;
};
// Microfone e captura da aba fechados de verdade (achado da revisao de seguranca de 09/11/2026:
// nada conferia isso depois do Parar).
const trilhas = () => ({
  aba: ultimaAba ? ultimaAba.getAudioTracks()[0].readyState : null,
  mic: ultimoMic ? ultimoMic.getAudioTracks()[0].readyState : null,
});
navigator.permissions.query = async () => ({ state: 'granted' });

// ---------- falhas do IndexedDB sob encomenda ----------
const falhasIdb = { putGravacoes: false, deleteTudo: false };
const putOriginal = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (...args) {
  if (falhasIdb.putGravacoes && this.name === 'gravacoes') throw new DOMException('falha falsa', 'UnknownError');
  return putOriginal.apply(this, args);
};
const deleteOriginal = IDBObjectStore.prototype.delete;
IDBObjectStore.prototype.delete = function (...args) {
  if (falhasIdb.deleteTudo) throw new DOMException('falha falsa', 'UnknownError');
  return deleteOriginal.apply(this, args);
};

await import('/extensao/offscreen.js');

// ---------- ajudantes ----------
const PEDIDO = { tipo: 'iniciar', streamId: 'id-falso', tabId: 7, origem: 'WhatsApp', nome: 'Gravacoes de Chamadas/a.m4a' };
let arquivoRecebido = null;
function swQueSalva() {
  respostaSw = async (msg) => {
    if (msg.tipo === 'arquivo-pronto') arquivoRecebido = { ...msg, blob: blobs.get(msg.url) };
    return { ok: true };
  };
}
async function esperarArquivo(limiteMs = 8000) {
  const fim = performance.now() + limiteMs;
  while (!arquivoRecebido && performance.now() < fim) await espera(50);
  return arquivoRecebido;
}
async function gravacoesNoArmazem() {
  const banco = await abrirArmazem();
  const lista = await banco.listarGravacoes();
  banco.fechar();
  return lista.map((g) => ({ id: g.id, situacao: g.situacao }));
}
const resumoEstado = (e) => ({ estado: e.estado, tabId: e.atual ? e.atual.tabId : null, emEntrega: e.emEntrega, niveis: e.niveis });

// ---------- cenarios ----------
async function fluxoCompleto() {
  swQueSalva();
  arquivoRecebido = null;
  paraSw = [];
  const inicio = await enviar(PEDIDO);
  await espera(2500);
  const gravando = resumoEstado(await enviar({ tipo: 'estado' }));
  const trilhasGravando = trilhas();
  const parar = await enviar({ tipo: 'parar' });
  const trilhasDepoisDoParar = trilhas();
  const recebido = await esperarArquivo();
  const salvando = resumoEstado(await enviar({ tipo: 'estado' }));
  const situacaoAntes = await gravacoesNoArmazem();
  const revogadoAntesDoSalvo = revogados.has(recebido.url);
  await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  const fim = resumoEstado(await enviar({ tipo: 'estado' }));
  return {
    inicio,
    gravando,
    trilhasGravando,
    parar,
    trilhasDepoisDoParar,
    revogadoAntesDoSalvo,
    revogadoDepoisDoSalvo: revogados.has(recebido.url),
    salvando,
    idGravacao: recebido.idGravacao,
    nomeEntregue: recebido.nome,
    situacaoAntes,
    fim,
    gravacoesDepois: await gravacoesNoArmazem(),
    estadosAvisados: paraSw.filter((m) => m.tipo === 'estado-mudou').map((m) => m.estado),
    arquivo: await paraBase64(recebido.blob),
  };
}

async function abaFechadaDuranteInicio() {
  swQueSalva();
  roteiro.fecharAbaDuranteMic = true;
  const inicio = await enviar(PEDIDO);
  roteiro.fecharAbaDuranteMic = false;
  await espera(300);
  return { inicio, fim: resumoEstado(await enviar({ tipo: 'estado' })), gravacoes: await gravacoesNoArmazem() };
}

async function abaFechadaGravando() {
  swQueSalva();
  arquivoRecebido = null;
  await enviar(PEDIDO);
  await espera(1500);
  fecharAba();
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return {
    recebeuArquivo: Boolean(recebido),
    micDepois: trilhas().mic,
    fim: resumoEstado(await enviar({ tipo: 'estado' })),
    gravacoes: await gravacoesNoArmazem(),
  };
}

// A politica de seguranca da extensao (mandada pelo servidor de teste igual ao manifest) bloqueia
// conexao de verdade no Chrome — ate para o proprio servidor.
async function politicaBloqueiaConexao() {
  let fetchBloqueado = false;
  try {
    await fetch('/extensao/manifest.json');
  } catch {
    fetchBloqueado = true;
  }
  return { fetchBloqueado };
}

async function microfoneNegado() {
  swQueSalva();
  roteiro.falharMic = 'NotAllowedError';
  const inicio = await enviar(PEDIDO);
  roteiro.falharMic = null;
  return {
    inicio,
    fim: resumoEstado(await enviar({ tipo: 'estado' })),
    abaSolta: ultimaAba.getAudioTracks()[0].readyState,
    gravacoes: await gravacoesNoArmazem(),
  };
}

async function armazemFalhandoAoParar() {
  swQueSalva();
  arquivoRecebido = null;
  await enviar(PEDIDO);
  await espera(1500);
  falhasIdb.putGravacoes = true;
  const parar = await enviar({ tipo: 'parar' });
  falhasIdb.putGravacoes = false;
  const recebido = await esperarArquivo();
  falhasIdb.deleteTudo = true;
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  falhasIdb.deleteTudo = false;
  const fim = resumoEstado(await enviar({ tipo: 'estado' }));
  // limpa o que a falha deixou para tras
  if (recebido) {
    const banco = await abrirArmazem();
    await banco.apagarGravacao(recebido.idGravacao);
    banco.fechar();
  }
  return { parar, recebeuArquivo: Boolean(recebido), fim };
}

async function swRecusaEDepoisRecupera() {
  arquivoRecebido = null;
  respostaSw = async () => ({ ok: false, motivo: 'salvar', detalhe: 'download recusado (falso)' });
  await enviar(PEDIDO);
  await espera(2500);
  const parar = await enviar({ tipo: 'parar' });
  const fim = resumoEstado(await enviar({ tipo: 'estado' }));
  const guardadas = await gravacoesNoArmazem();
  swQueSalva();
  const recuperar = await enviar({ tipo: 'recuperar', idGravacao: guardadas[0] && guardadas[0].id });
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return { parar, fim, guardadas, recuperar, nomeRecuperado: recebido && recebido.nome, gravacoesDepois: await gravacoesNoArmazem() };
}

async function conclusaoDeGravacaoDesconhecida() {
  // Como se o offscreen tivesse sido recriado no meio do download: ele nao conhece estas gravacoes.
  const banco = await abrirArmazem();
  await banco.criarGravacao({ id: 'antiga-salva', nome: 'x.m4a', origem: 'WhatsApp', inicio: 1, situacao: 'salvando' });
  await banco.criarGravacao({ id: 'antiga-falhou', nome: 'y.m4a', origem: 'WhatsApp', inicio: 2, situacao: 'salvando' });
  banco.fechar();
  await enviar({ tipo: 'salvo', idGravacao: 'antiga-salva' });
  await enviar({ tipo: 'falhou-salvar', idGravacao: 'antiga-falhou' });
  const depois = await gravacoesNoArmazem();
  const limpar = await abrirArmazem();
  await limpar.apagarGravacao('antiga-falhou');
  limpar.fechar();
  return { depois };
}

window.rodarCenarios = async () => ({
  fluxoCompleto: await fluxoCompleto(),
  abaFechadaDuranteInicio: await abaFechadaDuranteInicio(),
  abaFechadaGravando: await abaFechadaGravando(),
  microfoneNegado: await microfoneNegado(),
  armazemFalhandoAoParar: await armazemFalhandoAoParar(),
  swRecusaEDepoisRecupera: await swRecusaEDepoisRecupera(),
  conclusaoDeGravacaoDesconhecida: await conclusaoDeGravacaoDesconhecida(),
  politicaBloqueiaConexao: await politicaBloqueiaConexao(),
});

window.paginaPronta = true;

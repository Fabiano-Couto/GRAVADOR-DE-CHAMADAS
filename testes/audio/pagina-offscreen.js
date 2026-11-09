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
const roteiro = { fecharAbaDuranteMic: false, falharMic: null, micMudo: false, abaMuda: false };
function fluxoDeTom(frequencia, mudo = false) {
  const oscilador = new OscillatorNode(ctxFontes, { frequency: frequencia });
  const volume = new GainNode(ctxFontes, { gain: mudo ? 0 : 0.3 });
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
    ultimaAba = fluxoDeTom(1000, roteiro.abaMuda);
    return ultimaAba;
  }
  if (roteiro.falharMic) throw new DOMException('microfone (falso)', roteiro.falharMic);
  if (roteiro.fecharAbaDuranteMic) fecharAba();
  ultimoMic = fluxoDeTom(440, roteiro.micMudo);
  // Nome do dispositivo, como o Chrome daria para um microfone de verdade.
  Object.defineProperty(ultimoMic.getAudioTracks()[0], 'label', { value: 'Microfone de Teste (Headset falso)' });
  return ultimoMic;
};

// ---------- MediaRecorder: guarda o ultimo e falha sob encomenda ----------
let ultimoRecorder = null;
const falhasRecorder = { start: false };
const startOriginal = MediaRecorder.prototype.start;
MediaRecorder.prototype.start = function (...args) {
  if (falhasRecorder.start) throw new DOMException('start falso', 'InvalidStateError');
  ultimoRecorder = this;
  return startOriginal.apply(this, args);
};
// Microfone e captura da aba fechados de verdade (achado da revisao de seguranca de 09/11/2026:
// nada conferia isso depois do Parar).
const trilhas = () => ({
  aba: ultimaAba ? ultimaAba.getAudioTracks()[0].readyState : null,
  mic: ultimoMic ? ultimoMic.getAudioTracks()[0].readyState : null,
});
navigator.permissions.query = async () => ({ state: 'granted' });

// ---------- falhas do IndexedDB sob encomenda ----------
const falhasIdb = { putGravacoes: false, deleteTudo: false, fecharAbaAoRegistrar: false, tudo: false, pedacoUmaVez: false, substituir: 0 };
// Falha como a do IndexedDB real: a transacao inteira aborta (nada do que ela fez fica) — 4a rodada
// de revisao, 09/11/2026: lancar sem abortar deixava passar parte da transacao.
function falharTransacao(loja, mensagem, nome) {
  try {
    loja.transaction.abort();
  } catch {
    // ja abortada
  }
  throw new DOMException(mensagem, nome);
}
// Armazem quebrado de verdade: toda transacao falha (3a rodada de revisao, 09/11/2026).
const transacaoOriginal = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args) {
  if (falhasIdb.tudo) throw new DOMException('armazem quebrado (falso)', 'UnknownError');
  return transacaoOriginal.apply(this, args);
};
const putOriginal = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (...args) {
  if (falhasIdb.putGravacoes && this.name === 'gravacoes') throw new DOMException('falha falsa', 'UnknownError');
  if (falhasIdb.pedacoUmaVez && this.name === 'pedacos') {
    falhasIdb.pedacoUmaVez = false; // uma fatia nao entra na copia (disco cheio por um instante)
    falharTransacao(this, 'cota estourada (falso)', 'QuotaExceededError');
  }
  if (falhasIdb.fecharAbaAoRegistrar && this.name === 'gravacoes') {
    falhasIdb.fecharAbaAoRegistrar = false;
    fecharAba(); // a aba fecha exatamente enquanto a gravacao e registrada
  }
  return putOriginal.apply(this, args);
};
const deleteOriginal = IDBObjectStore.prototype.delete;
IDBObjectStore.prototype.delete = function (...args) {
  if (falhasIdb.deleteTudo) throw new DOMException('falha falsa', 'UnknownError');
  // A troca de pedacos (substituirPedacos) comeca apagando os pedacos: falha ali = troca abortada.
  if (falhasIdb.substituir > 0 && this.name === 'pedacos' && this.transaction.objectStoreNames.length === 1) {
    falhasIdb.substituir--;
    falharTransacao(this, 'cota estourada na troca (falso)', 'QuotaExceededError');
  }
  return deleteOriginal.apply(this, args);
};

const offscreen = await import('/extensao/offscreen.js');
const AJUSTES_DE_PRODUCAO = { ...offscreen.AJUSTES };

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
const microfoneInformado = (e) => (e.atual ? e.atual.microfone : null);

// ---------- cenarios ----------
async function fluxoCompleto() {
  swQueSalva();
  arquivoRecebido = null;
  paraSw = [];
  const inicio = await enviar(PEDIDO);
  await espera(3500);
  const estadoGravando = await enviar({ tipo: 'estado' });
  const gravando = resumoEstado(estadoGravando);
  const microfone = microfoneInformado(estadoGravando);
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
    microfone,
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
  const copiaQueSobrou = await gravacoesNoArmazem();
  // limpa o que a falha deixou para tras
  if (recebido) {
    const banco = await abrirArmazem();
    await banco.apagarGravacao(recebido.idGravacao);
    banco.fechar();
  }
  return { parar, recebeuArquivo: Boolean(recebido), fim, copiaQueSobrou };
}

// Avisos durante a gravacao, com os tempos encurtados: com som nos dois lados, nenhum aviso; com
// os dois mudos, "microfone-mudo" e "aba-muda" (a chamada pode estar noutra janela).
async function avisos() {
  swQueSalva();
  Object.assign(offscreen.AJUSTES, { silencioVoceMs: 800, silencioClienteMs: 1500, vigiaMs: 100 });
  try {
    arquivoRecebido = null;
    await enviar(PEDIDO);
    await espera(2500);
    const comSom = (await enviar({ tipo: 'estado' })).alertas;
    await enviar({ tipo: 'parar' });
    let r = await esperarArquivo();
    await enviar({ tipo: 'salvo', idGravacao: r.idGravacao });

    roteiro.micMudo = true;
    roteiro.abaMuda = true;
    arquivoRecebido = null;
    paraSw = [];
    await enviar(PEDIDO);
    // Espera os DOIS avisos aparecerem (com limite), em vez de tempo fixo: com a maquina ocupada a
    // vigia atrasa (2a rodada de revisao, 09/11/2026).
    let mudos = [];
    const limite = performance.now() + 10000;
    while (mudos.length < 2 && performance.now() < limite) {
      await espera(200);
      mudos = (await enviar({ tipo: 'estado' })).alertas;
    }
    const avisados = paraSw.filter((m) => m.tipo === 'estado-mudou' && m.estado === 'gravando').map((m) => m.alertas);
    await enviar({ tipo: 'parar' });
    r = await esperarArquivo();
    await enviar({ tipo: 'salvo', idGravacao: r.idGravacao });
    return { comSom, mudos, ultimoAvisado: avisados[avisados.length - 1] };
  } finally {
    roteiro.micMudo = false;
    roteiro.abaMuda = false;
    Object.assign(offscreen.AJUSTES, AJUSTES_DE_PRODUCAO);
  }
}

// IndexedDB recusando registrar a gravacao: grava mesmo assim (so na memoria) e avisa "sem-copia".
async function semCopiaDeSeguranca() {
  swQueSalva();
  arquivoRecebido = null;
  falhasIdb.putGravacoes = true;
  const inicio = await enviar(PEDIDO);
  falhasIdb.putGravacoes = false;
  const durante = resumoEstado(await enviar({ tipo: 'estado' }));
  const alertas = (await enviar({ tipo: 'estado' })).alertas;
  await espera(1500);
  const parar = await enviar({ tipo: 'parar' });
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return {
    inicio,
    estadoDurante: durante.estado,
    alertas,
    parar,
    bytes: recebido ? recebido.blob.size : 0,
    fim: resumoEstado(await enviar({ tipo: 'estado' })),
    gravacoes: await gravacoesNoArmazem(),
  };
}

// Erro do MediaRecorder no meio: para sozinho, entrega o que ha e deixa aviso pendente.
async function gravadorComErro() {
  swQueSalva();
  arquivoRecebido = null;
  paraSw = [];
  await enviar(PEDIDO);
  await espera(1500);
  ultimoRecorder.dispatchEvent(new Event('error'));
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return {
    recebeuArquivo: Boolean(recebido),
    avisos: paraSw.filter((m) => m.tipo === 'aviso').map((m) => m.codigo),
    fim: resumoEstado(await enviar({ tipo: 'estado' })),
  };
}

// Recuperar gravacao interrompida e o salvamento falhar: continua "gravando" (o nome segue com
// _recuperada na proxima tentativa).
async function recuperarInterrompidaQueFalha() {
  const banco = await abrirArmazem();
  await banco.criarGravacao({ id: 'interrompida', nome: 'Gravacoes de Chamadas/b.m4a', origem: 'Meet', inicio: 3, situacao: 'gravando' });
  await banco.guardarPedaco('interrompida', 0, new Blob(['pedaco']));
  banco.fechar();
  respostaSw = async () => ({ ok: false, motivo: 'salvar' });
  const primeira = await enviar({ tipo: 'recuperar', idGravacao: 'interrompida' });
  const depoisDaFalha = await gravacoesNoArmazem();
  swQueSalva();
  arquivoRecebido = null;
  const segunda = await enviar({ tipo: 'recuperar', idGravacao: 'interrompida' });
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: 'interrompida' });
  return { primeira, depoisDaFalha, segunda, nome: recebido && recebido.nome, gravacoesDepois: await gravacoesNoArmazem() };
}

// A aba fecha exatamente enquanto a gravacao e registrada (ultimo instante do inicio): salva o que houver.
async function abaFechadaNoUltimoInstante() {
  swQueSalva();
  arquivoRecebido = null;
  falhasIdb.fecharAbaAoRegistrar = true;
  const inicio = await enviar(PEDIDO);
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return { inicio, recebeuArquivo: Boolean(recebido), fim: resumoEstado(await enviar({ tipo: 'estado' })), gravacoes: await gravacoesNoArmazem() };
}

// Falha depois de registrar a gravacao (o gravador nao liga): nao sobra registro no armazem.
async function falhaDepoisDeRegistrar() {
  swQueSalva();
  falhasRecorder.start = true;
  const inicio = await enviar(PEDIDO);
  falhasRecorder.start = false;
  await espera(300);
  return { inicio, fim: resumoEstado(await enviar({ tipo: 'estado' })), gravacoes: await gravacoesNoArmazem() };
}

// ---- 2a rodada de revisao (09/11/2026) ----
// Sem copia de seguranca E o download falha: antes, a gravacao sumia (o blob era revogado) e o aviso
// dizia que ela estava na lista. Agora: se o armazem continua quebrado, ela fica na MEMORIA,
// aparece como nao salva e pode ser salva de novo; o aviso diz que e so ate fechar o Chrome.
async function semCopiaEDownloadFalha() {
  let bytesOriginais = 0;
  respostaSw = async (msg) => {
    if (msg.tipo === 'arquivo-pronto') {
      bytesOriginais = blobs.get(msg.url).size;
      return { ok: false, motivo: 'salvar', detalhe: 'download recusado (falso)' };
    }
    return { ok: true };
  };
  paraSw = [];
  falhasIdb.putGravacoes = true; // o armazem continua quebrado do inicio ao fim
  try {
    await enviar(PEDIDO);
    await espera(1500);
    const parar = await enviar({ tipo: 'parar' });
    const depois = await enviar({ tipo: 'estado' });
    const avisos = paraSw.filter((m) => m.tipo === 'aviso').map((m) => m.codigo);
    const naMemoria = depois.naMemoria || [];
    falhasIdb.putGravacoes = false;
    swQueSalva();
    arquivoRecebido = null;
    paraSw = [];
    const recuperar = naMemoria[0] ? await enviar({ tipo: 'recuperar', idGravacao: naMemoria[0].id }) : null;
    const recebido = await esperarArquivo();
    if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
    return {
      parar,
      estadoDepois: depois.estado,
      naMemoria: naMemoria.map((g) => ({ situacao: g.situacao, nome: g.nome })),
      avisos,
      bytesOriginais,
      recuperar,
      bytesRecuperados: recebido ? recebido.blob.size : 0,
      naMemoriaNoFim: ((await enviar({ tipo: 'estado' })).naMemoria || []).length,
      limpouPendente: paraSw.some((m) => m.tipo === 'limpar-pendente'),
      gravacoes: await gravacoesNoArmazem(),
    };
  } finally {
    falhasIdb.putGravacoes = false;
  }
}

// Sem copia no inicio, mas o armazem voltou quando o download falhou: a gravacao e guardada nele
// nessa hora (sobrevive a fechar o Chrome).
async function semCopiaArmazemVolta() {
  respostaSw = async (msg) => (msg.tipo === 'arquivo-pronto' ? { ok: false, motivo: 'salvar' } : { ok: true });
  paraSw = [];
  falhasIdb.putGravacoes = true;
  await enviar(PEDIDO);
  falhasIdb.putGravacoes = false; // o armazem volta durante a gravacao
  await espera(1500);
  await enviar({ tipo: 'parar' });
  const avisos = paraSw.filter((m) => m.tipo === 'aviso').map((m) => m.codigo);
  const guardadas = await gravacoesNoArmazem();
  const naMemoria = ((await enviar({ tipo: 'estado' })).naMemoria || []).length;
  swQueSalva();
  arquivoRecebido = null;
  const recuperar = guardadas[0] ? await enviar({ tipo: 'recuperar', idGravacao: guardadas[0].id }) : null;
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return { avisos, guardadas, naMemoria, recuperar, bytes: recebido ? recebido.blob.size : 0, gravacoesDepois: await gravacoesNoArmazem() };
}

// O aviso "nao salva" so e limpo quando NAO sobra nada por salvar (antes, nunca era limpo).
async function limparAvisoSoNoFim() {
  const banco = await abrirArmazem();
  for (const id of ['p1', 'p2']) {
    await banco.criarGravacao({ id, nome: 'Gravacoes de Chamadas/' + id + '.m4a', origem: 'WhatsApp', inicio: 10, situacao: 'pendente' });
    await banco.guardarPedaco(id, 0, new Blob(['pedaco ' + id]));
  }
  banco.fechar();
  swQueSalva();
  const salvar = async (id) => {
    arquivoRecebido = null;
    paraSw = [];
    await enviar({ tipo: 'recuperar', idGravacao: id });
    await esperarArquivo();
    await enviar({ tipo: 'salvo', idGravacao: id });
    // "nao-salva" so pode ser limpo quando nada mais falta salvar
    return paraSw.some((m) => m.tipo === 'limpar-pendente' && m.codigos.includes('nao-salva'));
  };
  const limpouNoPrimeiro = await salvar('p1');
  const limpouNoSegundo = await salvar('p2');
  return { limpouNoPrimeiro, limpouNoSegundo };
}

// ---- 3a rodada de revisao (09/11/2026) ----
// Armazem quebrado do INICIO AO FIM (o caso real; o cenario anterior religava o armazem antes do
// Salvar): salvar a gravacao da memoria limpa o aviso "so na memoria"; Descartar da memoria
// funciona mesmo sem armazem e tambem limpa.
async function armazemQuebradoDoInicioAoFim() {
  const recusar = async (msg) => (msg.tipo === 'arquivo-pronto' ? { ok: false, motivo: 'salvar' } : { ok: true });
  const limpezas = () => paraSw.filter((m) => m.tipo === 'limpar-pendente').map((m) => [...m.codigos].sort());
  falhasIdb.tudo = true;
  try {
    // 1) grava, o download falha: vai para a memoria; Salvar da memoria com o armazem ainda quebrado
    respostaSw = recusar;
    paraSw = [];
    await enviar(PEDIDO);
    await espera(1500);
    await enviar({ tipo: 'parar' });
    const naMemoria1 = (await enviar({ tipo: 'estado' })).naMemoria || [];
    swQueSalva();
    arquivoRecebido = null;
    paraSw = [];
    await enviar({ tipo: 'recuperar', idGravacao: naMemoria1[0] && naMemoria1[0].id });
    const recebido = await esperarArquivo();
    if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
    const limpouAoSalvar = limpezas();

    // 2) grava de novo, vai para a memoria; Descartar com o armazem quebrado
    respostaSw = recusar;
    await enviar(PEDIDO);
    await espera(1500);
    await enviar({ tipo: 'parar' });
    const naMemoria2 = (await enviar({ tipo: 'estado' })).naMemoria || [];
    paraSw = [];
    const descartar = await enviar({ tipo: 'descartar', idGravacao: naMemoria2[0] && naMemoria2[0].id });
    const naMemoriaFim = ((await enviar({ tipo: 'estado' })).naMemoria || []).length;
    return { naMemoria1: naMemoria1.length, recebeu: Boolean(recebido), limpouAoSalvar, naMemoria2: naMemoria2.length, descartar, naMemoriaFim, limpouAoDescartar: limpezas() };
  } finally {
    falhasIdb.tudo = false;
  }
}

// Uma fatia nao entrou na copia (buraco) e o download falhou: o que fica guardado e o arquivo
// INTEIRO que estava na memoria, nao a copia furada.
async function copiaComBuraco() {
  Object.assign(offscreen.AJUSTES, { fatiaMs: 1000 });
  let bytesOriginais = 0;
  try {
    respostaSw = async (msg) => {
      if (msg.tipo === 'arquivo-pronto') {
        bytesOriginais = blobs.get(msg.url).size;
        return { ok: false, motivo: 'salvar' };
      }
      return { ok: true };
    };
    await enviar(PEDIDO);
    await espera(1200);
    falhasIdb.pedacoUmaVez = true;
    await espera(3000);
    await enviar({ tipo: 'parar' });
    const guardadas = await gravacoesNoArmazem();
    swQueSalva();
    arquivoRecebido = null;
    await enviar({ tipo: 'recuperar', idGravacao: guardadas[0] && guardadas[0].id });
    const recebido = await esperarArquivo();
    if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
    return { furou: !falhasIdb.pedacoUmaVez, guardadas: guardadas.length, bytesOriginais, bytesRecuperados: recebido ? recebido.blob.size : 0 };
  } finally {
    falhasIdb.pedacoUmaVez = false;
    Object.assign(offscreen.AJUSTES, AJUSTES_DE_PRODUCAO);
  }
}

// Sem copia no inicio; na falha do download o registro entra no armazem mas o AUDIO nao (cota): o
// registro sem audio e apagado e a gravacao fica so na memoria — uma vez so na lista.
async function registroSemAudio() {
  respostaSw = async (msg) => (msg.tipo === 'arquivo-pronto' ? { ok: false, motivo: 'salvar' } : { ok: true });
  falhasIdb.putGravacoes = true;
  await enviar(PEDIDO);
  falhasIdb.putGravacoes = false;
  await espera(1500);
  falhasIdb.pedacoUmaVez = true; // o pedaco inteiro nao cabe na hora de guardar a nao salva
  await enviar({ tipo: 'parar' });
  falhasIdb.pedacoUmaVez = false;
  await espera(300);
  const naMemoria = ((await enviar({ tipo: 'estado' })).naMemoria || []).length;
  const noArmazem = await gravacoesNoArmazem();
  const id = ((await enviar({ tipo: 'estado' })).naMemoria || [])[0];
  swQueSalva();
  arquivoRecebido = null;
  if (id) await enviar({ tipo: 'recuperar', idGravacao: id.id });
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return { naMemoria, noArmazem };
}

// ---- 4a rodada de revisao (09/11/2026) ----
// Disco cheio derrubando tudo junto: buraco na copia, download recusado, troca dos pedacos falhando
// -> o inteiro vai para a memoria. Salvar da memoria com tudo falhando DE NOVO: o inteiro continua
// guardado (antes, perdia a marca e era descartado: 27 KB de 52 KB). Depois salva inteiro.
async function buracoMemoriaRetentativa() {
  Object.assign(offscreen.AJUSTES, { fatiaMs: 1000 });
  let bytesOriginais = 0;
  const recusar = async (msg) => {
    if (msg.tipo === 'arquivo-pronto' && !bytesOriginais) bytesOriginais = blobs.get(msg.url).size;
    return msg.tipo === 'arquivo-pronto' ? { ok: false, motivo: 'salvar' } : { ok: true };
  };
  try {
    respostaSw = recusar;
    await enviar(PEDIDO);
    await espera(1200);
    falhasIdb.pedacoUmaVez = true; // buraco na copia
    await espera(3000);
    falhasIdb.substituir = 1; // a troca dos pedacos falha na hora de guardar a nao salva
    paraSw = [];
    await enviar({ tipo: 'parar' });
    const depois1 = await enviar({ tipo: 'estado' });
    const situacaoFurada = (await gravacoesNoArmazem())[0];
    const id = depois1.naMemoria[0] && depois1.naMemoria[0].id;
    // Salvar da memoria com o download recusado e a troca falhando de novo (o aviso desta segunda
    // falha tem de continuar "so na memoria"; com o defeito, virava "nao salva" e o inteiro sumia)
    falhasIdb.substituir = 1;
    paraSw = [];
    await enviar({ tipo: 'recuperar', idGravacao: id });
    const depois2 = await enviar({ tipo: 'estado' });
    const avisos = paraSw.filter((m) => m.tipo === 'aviso').map((m) => m.codigo);
    // Agora salva de verdade
    falhasIdb.substituir = 0;
    swQueSalva();
    arquivoRecebido = null;
    await enviar({ tipo: 'recuperar', idGravacao: id });
    const recebido = await esperarArquivo();
    if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
    return {
      naMemoria1: depois1.naMemoria.length,
      situacaoFurada: situacaoFurada && situacaoFurada.situacao,
      naMemoria2: depois2.naMemoria.length,
      avisos,
      bytesOriginais,
      bytesRecuperados: recebido ? recebido.blob.size : 0,
      gravacoesDepois: await gravacoesNoArmazem(),
    };
  } finally {
    falhasIdb.pedacoUmaVez = false;
    falhasIdb.substituir = 0;
    Object.assign(offscreen.AJUSTES, AJUSTES_DE_PRODUCAO);
  }
}

// Registro existente e o MARCAR falha: a copia continua no armazem (a guarda "registrou" impede
// apagar um registro que nao foi criado agora).
async function marcarFalhaMantemCopia() {
  const banco = await abrirArmazem();
  await banco.criarGravacao({ id: 'existente', nome: 'Gravacoes de Chamadas/e.m4a', origem: 'Meet', inicio: 5, situacao: 'salvando' });
  await banco.guardarPedaco('existente', 0, new Blob(['audio existente']));
  banco.fechar();
  falhasIdb.putGravacoes = true; // marcar(id, 'pendente') falha
  paraSw = [];
  await enviar({ tipo: 'falhou-salvar', idGravacao: 'existente' });
  falhasIdb.putGravacoes = false;
  const avisos = paraSw.filter((m) => m.tipo === 'aviso').map((m) => m.codigo);
  const depois = await gravacoesNoArmazem();
  const limpar = await abrirArmazem();
  const pedacos = (await limpar.lerPedacos('existente')).length;
  await limpar.apagarGravacao('existente');
  limpar.fechar();
  return { depois, pedacos, avisos };
}

// ---- 5a rodada de revisao (09/11/2026) ----
// Copia INTEIRA no armazem, download recusado, e a troca de pedacos falharia: nao ha o que trocar
// (a soma bate), o aviso e "nao salva" (esta no armazem) e nada vai para a memoria.
async function copiaInteiraTrocaFalharia() {
  Object.assign(offscreen.AJUSTES, { fatiaMs: 1000 });
  let bytesOriginais = 0;
  try {
    respostaSw = async (msg) => {
      if (msg.tipo === 'arquivo-pronto' && !bytesOriginais) bytesOriginais = blobs.get(msg.url).size;
      return msg.tipo === 'arquivo-pronto' ? { ok: false, motivo: 'salvar' } : { ok: true };
    };
    await enviar(PEDIDO);
    await espera(3200);
    falhasIdb.substituir = 1; // se alguem tentar trocar, falha
    paraSw = [];
    await enviar({ tipo: 'parar' });
    const avisos = paraSw.filter((m) => m.tipo === 'aviso').map((m) => m.codigo);
    const naMemoria = ((await enviar({ tipo: 'estado' })).naMemoria || []).length;
    const guardadas = await gravacoesNoArmazem();
    const trocaTentada = falhasIdb.substituir === 0;
    falhasIdb.substituir = 0;
    swQueSalva();
    arquivoRecebido = null;
    await enviar({ tipo: 'recuperar', idGravacao: guardadas[0] && guardadas[0].id });
    const recebido = await esperarArquivo();
    if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
    return { avisos, naMemoria, situacao: guardadas[0] && guardadas[0].situacao, trocaTentada, bytesOriginais, bytesRecuperados: recebido ? recebido.blob.size : 0 };
  } finally {
    falhasIdb.substituir = 0;
    Object.assign(offscreen.AJUSTES, AJUSTES_DE_PRODUCAO);
  }
}

// Gravacao na memoria E no armazem (copia furada, troca falhou); Descartar com o armazem quebrado:
// e erro (a copia do armazem nao foi apagada) — antes dizia ok e a gravacao voltava na lista.
async function descartarMemoriaComCopiaQuebrado() {
  Object.assign(offscreen.AJUSTES, { fatiaMs: 1000 });
  try {
    respostaSw = async (msg) => (msg.tipo === 'arquivo-pronto' ? { ok: false, motivo: 'salvar' } : { ok: true });
    await enviar(PEDIDO);
    await espera(1200);
    falhasIdb.pedacoUmaVez = true;
    await espera(2500);
    falhasIdb.substituir = 1;
    await enviar({ tipo: 'parar' });
    const naMemoria = (await enviar({ tipo: 'estado' })).naMemoria || [];
    const id = naMemoria[0] && naMemoria[0].id;
    falhasIdb.tudo = true;
    const descartar = await enviar({ tipo: 'descartar', idGravacao: id });
    falhasIdb.tudo = false;
    const noArmazem = (await gravacoesNoArmazem()).filter((g) => g.id === id).length;
    const limpo = await enviar({ tipo: 'descartar', idGravacao: id }); // com o armazem de volta, apaga
    return { naMemoria: naMemoria.length, descartar: { ok: descartar.ok, motivo: descartar.motivo }, noArmazem, limpo, depois: await gravacoesNoArmazem() };
  } finally {
    falhasIdb.pedacoUmaVez = false;
    falhasIdb.substituir = 0;
    falhasIdb.tudo = false;
    Object.assign(offscreen.AJUSTES, AJUSTES_DE_PRODUCAO);
  }
}

// Descartar gravacao que esta SO no armazem, com o armazem quebrado: erro de verdade, e ela fica.
async function descartarSoArmazemQuebrado() {
  const banco = await abrirArmazem();
  await banco.criarGravacao({ id: 'so-armazem', nome: 'Gravacoes de Chamadas/s.m4a', origem: 'Meet', inicio: 6, situacao: 'pendente' });
  banco.fechar();
  falhasIdb.tudo = true;
  const descartar = await enviar({ tipo: 'descartar', idGravacao: 'so-armazem' });
  falhasIdb.tudo = false;
  const depois = await gravacoesNoArmazem();
  const limpar = await abrirArmazem();
  await limpar.apagarGravacao('so-armazem');
  limpar.fechar();
  return { ok: descartar.ok, motivo: descartar.motivo, depois };
}

// Parar pedido duas vezes ao mesmo tempo (atalho + clique): um salva, o outro manda aguardar.
async function pararDuplo() {
  swQueSalva();
  arquivoRecebido = null;
  await enviar(PEDIDO);
  await espera(1200);
  const respostas = await Promise.all([enviar({ tipo: 'parar' }), enviar({ tipo: 'parar' })]);
  const recebido = await esperarArquivo();
  if (recebido) await enviar({ tipo: 'salvo', idGravacao: recebido.idGravacao });
  return { respostas, fim: resumoEstado(await enviar({ tipo: 'estado' })) };
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
  avisos: await avisos(),
  semCopiaDeSeguranca: await semCopiaDeSeguranca(),
  gravadorComErro: await gravadorComErro(),
  recuperarInterrompidaQueFalha: await recuperarInterrompidaQueFalha(),
  abaFechadaNoUltimoInstante: await abaFechadaNoUltimoInstante(),
  falhaDepoisDeRegistrar: await falhaDepoisDeRegistrar(),
  pararDuplo: await pararDuplo(),
  semCopiaEDownloadFalha: await semCopiaEDownloadFalha(),
  semCopiaArmazemVolta: await semCopiaArmazemVolta(),
  limparAvisoSoNoFim: await limparAvisoSoNoFim(),
  armazemQuebradoDoInicioAoFim: await armazemQuebradoDoInicioAoFim(),
  copiaComBuraco: await copiaComBuraco(),
  registroSemAudio: await registroSemAudio(),
  buracoMemoriaRetentativa: await buracoMemoriaRetentativa(),
  marcarFalhaMantemCopia: await marcarFalhaMantemCopia(),
  descartarSoArmazemQuebrado: await descartarSoArmazemQuebrado(),
  copiaInteiraTrocaFalharia: await copiaInteiraTrocaFalharia(),
  descartarMemoriaComCopiaQuebrado: await descartarMemoriaComCopiaQuebrado(),
});

window.paginaPronta = true;

// Janelinha do icone: mostra a situacao, os medidores (Voce / Cliente), o botao Gravar/Parar e as
// gravacoes nao salvas. Toda acao passa pelo service worker. Mapa: docs/gravacao.md.
import { origemDaUrl, doisDigitos } from './lib/nomes.js';
import { textoDoMotivo, textoDoAlerta, textoDoPendente } from './lib/mensagens.js';

const $ = (id) => document.getElementById(id);
const pedirSw = (tipo, dados = {}) => chrome.runtime.sendMessage({ alvo: 'sw', tipo, ...dados });
const PARADO = { ok: true, estado: 'parado', atual: null, niveis: null, alertas: [], emEntrega: [] };
const nossoDownload = (url) => typeof url === 'string' && url.startsWith('blob:' + chrome.runtime.getURL(''));

let abaAtual = null;
let ocupado = false;
let ultimoEstado = null;
// Depois de Parar/Salvar com sucesso: espera o download terminar para dizer "salva" (ou falhar).
let esperandoSalvar = false;

function mostrarAviso(texto, erro = false) {
  const aviso = $('aviso');
  aviso.textContent = texto || '';
  aviso.hidden = !texto;
  aviso.classList.toggle('erro', Boolean(texto) && erro);
}

function cronometro(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return doisDigitos(Math.floor(total / 3600)) + ':' + doisDigitos(Math.floor((total % 3600) / 60)) + ':' + doisDigitos(total % 60);
}

// Pico (0 a 1) para largura da barra: -60 dB = vazia, 0 dB = cheia.
function largura(pico) {
  if (!pico || pico <= 0) return '0%';
  const db = 20 * Math.log10(pico);
  return Math.round(Math.min(1, Math.max(0, (db + 60) / 60)) * 100) + '%';
}

function desenhar(r) {
  ultimoEstado = r;
  const ponto = $('ponto');
  const texto = $('texto-estado');
  const botao = $('botao');
  const gravandoAqui = r.estado === 'gravando' && r.atual && r.atual.tabId === abaAtual?.id;
  const gravandoOutra = r.estado === 'gravando' && !gravandoAqui;

  ponto.classList.toggle('gravando', r.estado === 'gravando');
  $('cronometro').hidden = !gravandoAqui;
  $('medidores').hidden = !gravandoAqui;
  botao.classList.toggle('parar', gravandoAqui);

  if (gravandoAqui) {
    texto.textContent = 'Gravando: ' + r.atual.origem;
    $('cronometro').textContent = cronometro(Date.now() - r.atual.inicio);
    $('nivel-voce').style.width = largura(r.niveis?.voce);
    $('nivel-cliente').style.width = largura(r.niveis?.cliente);
    botao.textContent = 'Parar e salvar';
    botao.disabled = ocupado;
    if (r.alertas && r.alertas.length) mostrarAviso(r.alertas.map(textoDoAlerta).join(' '));
    else if ($('aviso').dataset.fixo !== 'sim') mostrarAviso('');
  } else if (gravandoOutra) {
    texto.textContent = 'Gravando outra aba: ' + r.atual.origem;
    botao.textContent = 'Gravar esta aba';
    botao.disabled = true;
  } else if (r.estado === 'iniciando') {
    texto.textContent = 'Iniciando a gravação...';
    botao.disabled = true;
  } else if (r.estado === 'salvando') {
    texto.textContent = 'Salvando em Downloads...';
    botao.textContent = 'Gravar esta aba';
    botao.disabled = true;
  } else {
    texto.textContent = 'Pronto para gravar: ' + origemDaUrl(abaAtual?.url);
    botao.textContent = 'Gravar esta aba';
    botao.disabled = ocupado;
  }
}

// Pergunta direto ao offscreen: sem o salto pelo service worker (que antes reenviava a pergunta e
// consultava runtime.getContexts a cada 250 ms). O service worker ainda RECEBE a mensagem (toda
// runtime.sendMessage chega a todos os ouvintes da extensao) e devolve false na hora — correcao da
// revisao de 09/11/2026, que apontou a premissa errada do comentario anterior.
// Sem offscreen aberto ninguem responde: e porque nada esta gravando.
async function atualizar() {
  let r;
  try {
    r = await chrome.runtime.sendMessage({ alvo: 'offscreen', tipo: 'estado' });
  } catch {
    r = null;
  }
  desenhar(r && r.ok ? r : PARADO);
}

async function aoClicar() {
  if (ocupado || !abaAtual) return;
  ocupado = true;
  $('botao').disabled = true;
  const parando = ultimoEstado?.estado === 'gravando';
  $('aviso').dataset.fixo = '';
  // Marca ANTES de pedir: um arquivo pequeno pode terminar de baixar antes da resposta voltar, e o
  // "Gravação salva" se perdia (revisao de 09/11/2026).
  if (parando) esperandoSalvar = true;
  try {
    const r = await pedirSw('alternar', { tabId: abaAtual.id });
    if (!r || !r.ok) {
      esperandoSalvar = false;
      mostrarAviso(textoDoMotivo(r), r?.motivo !== 'microfone');
      $('aviso').dataset.fixo = 'sim';
    } else if (parando) {
      if (esperandoSalvar) mostrarAviso('Salvando em Downloads > Gravacoes de Chamadas...');
      $('aviso').dataset.fixo = 'sim';
    } else {
      mostrarAviso('');
    }
  } catch (e) {
    esperandoSalvar = false;
    mostrarAviso(textoDoMotivo({ motivo: 'interno', detalhe: String(e?.message || e) }), true);
    $('aviso').dataset.fixo = 'sim';
  } finally {
    ocupado = false;
    await atualizar();
    carregarRecuperaveis();
  }
}

function descreverGravacao(g) {
  const d = new Date(g.inicio);
  const quando = doisDigitos(d.getDate()) + '/' + doisDigitos(d.getMonth() + 1) + ' ' + doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes());
  const situacao = g.situacao === 'gravando' ? 'interrompida no meio' : 'não chegou a ser salva';
  return quando + ' · ' + g.origem + ' · ' + situacao;
}

async function carregarRecuperaveis() {
  let r;
  try {
    r = await pedirSw('recuperaveis');
  } catch {
    return;
  }
  const lista = r && r.ok ? r.lista : [];
  const ul = $('lista-recuperar');
  ul.replaceChildren();
  $('recuperar').hidden = lista.length === 0;
  for (const g of lista) {
    const li = document.createElement('li');
    const descricao = document.createElement('span');
    descricao.className = 'descricao';
    descricao.textContent = descreverGravacao(g);
    const acoes = document.createElement('span');
    acoes.className = 'acoes';
    const salvar = document.createElement('button');
    salvar.type = 'button';
    salvar.className = 'botao';
    salvar.textContent = 'Salvar';
    const descartar = document.createElement('button');
    descartar.type = 'button';
    descartar.className = 'botao';
    descartar.textContent = 'Descartar';

    salvar.addEventListener('click', async () => {
      salvar.disabled = true;
      descartar.disabled = true;
      esperandoSalvar = true; // antes de pedir (mesma corrida do Parar)
      const resposta = await pedirSw('recuperar', { idGravacao: g.id }).catch((e) => ({ ok: false, motivo: 'interno', detalhe: String(e) }));
      if (resposta && resposta.ok) {
        if (esperandoSalvar) mostrarAviso('Salvando em Downloads > Gravacoes de Chamadas...');
      } else {
        esperandoSalvar = false;
        mostrarAviso(textoDoMotivo(resposta), true);
      }
      $('aviso').dataset.fixo = 'sim';
      carregarRecuperaveis();
    });

    // Descartar apaga de vez: pede um segundo clique para confirmar.
    descartar.addEventListener('click', async () => {
      if (descartar.dataset.confirmar !== 'sim') {
        descartar.dataset.confirmar = 'sim';
        descartar.textContent = 'Confirmar descarte';
        return;
      }
      descartar.disabled = true;
      salvar.disabled = true;
      const resposta = await pedirSw('descartar', { idGravacao: g.id }).catch((e) => ({ ok: false, motivo: 'interno', detalhe: String(e) }));
      if (!resposta || !resposta.ok) {
        mostrarAviso(textoDoMotivo(resposta), true);
        $('aviso').dataset.fixo = 'sim';
      }
      carregarRecuperaveis();
    });

    acoes.append(salvar, descartar);
    li.append(descricao, acoes);
    ul.append(li);
  }
}

async function mostrarUltima() {
  const { ultimas = [] } = await chrome.storage.local.get('ultimas');
  const p = $('ultima');
  p.replaceChildren();
  if (!ultimas.length) {
    p.hidden = true;
    return;
  }
  const u = ultimas[0];
  const nome = u.nome.split('/').pop();
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'link';
  link.textContent = 'mostrar';
  link.addEventListener('click', () => chrome.downloads.show(u.downloadId));
  p.append('Última: ' + nome + ' ', link);
  p.hidden = false;
}

async function mostrarAtalho() {
  const comandos = await chrome.commands.getAll();
  const atalho = comandos.find((c) => c.name === 'alternar-gravacao')?.shortcut;
  $('atalho').textContent = atalho || 'nenhum (defina em chrome://extensions/shortcuts)';
}

async function iniciar() {
  [abaAtual] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('botao').addEventListener('click', aoClicar);
  $('abrir-pasta').addEventListener('click', () => chrome.downloads.showDefaultFolder());
  // O service worker grava 'ultimas' quando o download TERMINA: so ai a gravacao esta salva.
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local' || !mudancas.ultimas) return;
    mostrarUltima();
    if (esperandoSalvar) {
      esperandoSalvar = false;
      const nome = (mudancas.ultimas.newValue?.[0]?.nome || '').split('/').pop();
      mostrarAviso('Gravação salva: ' + nome);
      $('aviso').dataset.fixo = 'sim';
    }
    carregarRecuperaveis();
  });
  // Download NOSSO que falhou (disco cheio, antivirus): a gravacao volta para "nao salvas". Download
  // de outro site falhando nao conta (revisao de 09/11/2026).
  chrome.downloads.onChanged.addListener(async (delta) => {
    if (delta.state?.current !== 'interrupted' || !esperandoSalvar) return;
    const [item] = await chrome.downloads.search({ id: delta.id });
    if (!item || !nossoDownload(item.url)) return;
    esperandoSalvar = false;
    mostrarAviso(textoDoMotivo({ motivo: 'salvar' }), true);
    $('aviso').dataset.fixo = 'sim';
    setTimeout(carregarRecuperaveis, 500);
  });
  // Aviso que aconteceu com a janelinha fechada (salvamento falhou, gravador parou): mostra e limpa
  // o "!" do icone.
  const { pendente = null } = await chrome.storage.session.get('pendente');
  if (pendente) {
    mostrarAviso(textoDoPendente(pendente), true);
    $('aviso').dataset.fixo = 'sim';
    pedirSw('pendente-visto').catch(() => {});
  }
  mostrarAtalho();
  mostrarUltima();
  carregarRecuperaveis();
  await atualizar();
  setInterval(atualizar, 250);
}

iniciar();

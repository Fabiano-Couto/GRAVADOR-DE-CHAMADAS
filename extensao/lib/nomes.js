// Origem da chamada e nome do arquivo. Regras e testes: docs/gravacao.md, testes/unidade/nomes.test.js.
import { EXTENSAO } from './formato.js';

export const PASTA = 'Gravacoes de Chamadas';

// Caracteres que o Windows nao aceita em nome de arquivo, mais os de controle.
const PROIBIDOS = /[<>:"/\\|?*\u0000-\u001f]/g;
const PONTAS = /^[.\s]+|[.\s]+$/g;
const CODIGO_MEET = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/;

// De onde veio a chamada, pelo endereco da aba: WhatsApp, Meet_<codigo>, ou o dominio.
export function origemDaUrl(url) {
  let endereco;
  try {
    endereco = new URL(url);
  } catch {
    return 'Aba';
  }
  if (endereco.protocol !== 'http:' && endereco.protocol !== 'https:') return 'Aba';
  const host = endereco.hostname.replace(/^www\./, '');
  if (host === 'web.whatsapp.com') return 'WhatsApp';
  if (host === 'meet.google.com') {
    const achado = endereco.pathname.match(CODIGO_MEET);
    return achado ? 'Meet_' + achado[1] : 'Meet';
  }
  return host || 'Aba';
}

function limpar(texto) {
  const limpo = String(texto).replace(PROIBIDOS, '-').replace(PONTAS, '');
  return limpo || 'Aba';
}

export const doisDigitos = (n) => String(n).padStart(2, '0');

// Caminho relativo a pasta Downloads: "Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a".
// Usa a hora LOCAL (a do relogio do usuario), nunca UTC.
export function nomeArquivo(data, origem) {
  const dia = data.getFullYear() + '-' + doisDigitos(data.getMonth() + 1) + '-' + doisDigitos(data.getDate());
  const hora = doisDigitos(data.getHours()) + 'h' + doisDigitos(data.getMinutes());
  return PASTA + '/' + dia + '_' + hora + '_' + limpar(origem) + '.' + EXTENSAO;
}

// Gravacao interrompida no meio (Chrome fechou, travou) e salva com "_recuperada" para avisar que
// pode estar incompleta. Gravacao completa que so nao chegou a ser salva fica com o nome original.
export function nomeParaRecuperar(gravacao) {
  if (gravacao.situacao !== 'gravando') return gravacao.nome;
  const fim = '.' + EXTENSAO;
  const base = gravacao.nome.endsWith(fim) ? gravacao.nome.slice(0, -fim.length) : gravacao.nome;
  return base + '_recuperada' + fim;
}

// Opcoes do chrome.downloads.download: nunca sobrescrever, nunca perguntar onde salvar.
export function opcoesDownload(url, nome) {
  return { url, filename: nome, conflictAction: 'uniquify', saveAs: false };
}

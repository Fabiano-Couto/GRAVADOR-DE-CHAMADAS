// Ligacao "arquivo em download -> gravacao", guardada no chrome.storage.session (o service worker
// dorme e perde variaveis). UMA CHAVE POR DOWNLOAD: dois salvamentos ao mesmo tempo nao se
// sobrescrevem (achado da revisao de 09/11/2026: um mapa unico lido e regravado perdia uma entrada,
// e a gravacao ficava presa em "salvando").
// Testes: testes/unidade/downloads.test.js.

import { PASTA } from './nomes.js';
import { EXTENSAO } from './formato.js';

const PREFIXO = 'salvando:';

// O service worker so baixa um endereco blob da PROPRIA extensao, para a pasta das gravacoes, com
// nome simples terminado em .m4a (achado da revisao de seguranca de 09/11/2026: antes, qualquer
// endereco e nome vindos de mensagem viravam arquivo no disco).
// origemExtensao = chrome.runtime.getURL('') (ex.: chrome-extension://<id>/).
export function arquivoAceito(url, nome, origemExtensao) {
  if (typeof url !== 'string' || typeof nome !== 'string' || !origemExtensao) return false;
  if (!url.startsWith('blob:' + origemExtensao)) return false;
  if (!nome.startsWith(PASTA + '/')) return false;
  const arquivo = nome.slice(PASTA.length + 1);
  if (!arquivo || arquivo.includes('/') || arquivo.includes('\\') || arquivo.startsWith('.')) return false;
  return arquivo.endsWith('.' + EXTENSAO);
}

export async function anotarSalvamento(armazenamento, url, info) {
  await armazenamento.set({ [PREFIXO + url]: info });
}

// Devolve o que foi anotado para este endereco (e apaga a anotacao), ou null se nao e nosso.
export async function retirarSalvamento(armazenamento, url) {
  const chave = PREFIXO + url;
  const achado = await armazenamento.get(chave);
  const info = achado[chave];
  if (!info) return null;
  await armazenamento.remove(chave);
  return info;
}

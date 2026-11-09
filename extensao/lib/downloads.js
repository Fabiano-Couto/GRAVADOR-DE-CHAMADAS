// Ligacao "arquivo em download -> gravacao", guardada no chrome.storage.session (o service worker
// dorme e perde variaveis). UMA CHAVE POR DOWNLOAD: dois salvamentos ao mesmo tempo nao se
// sobrescrevem (achado da revisao de 09/11/2026: um mapa unico lido e regravado perdia uma entrada,
// e a gravacao ficava presa em "salvando").
// Testes: testes/unidade/downloads.test.js.

const PREFIXO = 'salvando:';

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

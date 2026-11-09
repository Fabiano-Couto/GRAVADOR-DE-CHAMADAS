// Ligacao download -> gravacao — Gravador v1, achado da revisao de 09/11/2026.
// Defeito que este teste impede: dois salvamentos ao mesmo tempo (Parar enquanto uma gravacao
// recuperada ainda baixa; dois "Salvar" seguidos) lendo e regravando o mesmo mapa — um perdia a
// entrada, a gravacao nunca era apagada e a maquina ficava presa em "salvando".
// O armazenamento falso responde depois de uma volta do relogio, como o chrome.storage, para que
// uma leitura-e-regravacao de mapa unico realmente se atropele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anotarSalvamento, retirarSalvamento } from '../../extensao/lib/downloads.js';

function armazenamentoFalso() {
  const dados = {};
  const volta = () => new Promise((r) => setTimeout(r, 5));
  return {
    async get(chave) {
      await volta();
      return chave in dados ? { [chave]: structuredClone(dados[chave]) } : {};
    },
    async set(itens) {
      await volta();
      Object.assign(dados, structuredClone(itens));
    },
    async remove(chave) {
      await volta();
      delete dados[chave];
    },
  };
}

test('downloads: dois salvamentos ao mesmo tempo ficam anotados os dois', async () => {
  const s = armazenamentoFalso();
  await Promise.all([
    anotarSalvamento(s, 'blob:a', { idGravacao: 'g1', nome: 'x.m4a' }),
    anotarSalvamento(s, 'blob:b', { idGravacao: 'g2', nome: 'y.m4a' }),
  ]);
  assert.deepEqual(await retirarSalvamento(s, 'blob:a'), { idGravacao: 'g1', nome: 'x.m4a' });
  assert.deepEqual(await retirarSalvamento(s, 'blob:b'), { idGravacao: 'g2', nome: 'y.m4a' });
});

test('downloads: retirar apaga a anotacao; download que nao e nosso devolve null', async () => {
  const s = armazenamentoFalso();
  await anotarSalvamento(s, 'blob:a', { idGravacao: 'g1', nome: 'x.m4a' });
  await retirarSalvamento(s, 'blob:a');
  assert.equal(await retirarSalvamento(s, 'blob:a'), null);
  assert.equal(await retirarSalvamento(s, 'https://outro.site/arquivo.pdf'), null);
});

// Armazem dos pedacos da gravacao no IndexedDB da extensao. Cada fatia que o MediaRecorder entrega
// (a cada 5 s) e gravada na hora: se o Chrome fechar ou travar no meio da chamada, o que ja foi
// gravado continua aqui e pode ser recuperado. Depois que o arquivo e salvo em Downloads, a
// gravacao e apagada do armazem.
// Testado no Chrome de verdade: testes/audio/audio.test.js.
import { TIPO_ARQUIVO } from './formato.js';

export const NOME_BANCO = 'gravador-chamadas';
const VERSAO = 1;

const pedido = (req) =>
  new Promise((resolver, rejeitar) => {
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rejeitar(req.error);
  });

const concluida = (tx) =>
  new Promise((resolver, rejeitar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error);
  });

export async function abrirArmazem(nomeBanco = NOME_BANCO) {
  const req = indexedDB.open(nomeBanco, VERSAO);
  req.onupgradeneeded = () => {
    const db = req.result;
    db.createObjectStore('gravacoes', { keyPath: 'id' });
    const pedacos = db.createObjectStore('pedacos', { keyPath: ['id', 'seq'] });
    pedacos.createIndex('porGravacao', 'id');
  };
  const db = await pedido(req);

  return {
    // meta: { id, nome, origem, inicio, situacao: 'gravando' | 'salvando' | 'pendente' }
    async criarGravacao(meta) {
      const tx = db.transaction('gravacoes', 'readwrite');
      tx.objectStore('gravacoes').put(meta);
      await concluida(tx);
    },

    async guardarPedaco(id, seq, blob) {
      const tx = db.transaction('pedacos', 'readwrite');
      tx.objectStore('pedacos').put({ id, seq, blob });
      await concluida(tx);
    },

    async lerPedacos(id) {
      const tx = db.transaction('pedacos', 'readonly');
      const lista = await pedido(tx.objectStore('pedacos').index('porGravacao').getAll(id));
      return lista.sort((a, b) => a.seq - b.seq).map((p) => p.blob);
    },

    // O arquivo final e a soma dos pedacos na ordem: o MP4 fragmentado do MediaRecorder traz o
    // cabecalho no primeiro pedaco e cada pedaco seguinte e um fragmento completo.
    async montarArquivo(id) {
      const pedacos = await this.lerPedacos(id);
      return new Blob(pedacos, { type: TIPO_ARQUIVO });
    },

    async marcar(id, situacao) {
      const tx = db.transaction('gravacoes', 'readwrite');
      const loja = tx.objectStore('gravacoes');
      const atual = await pedido(loja.get(id));
      if (atual) loja.put({ ...atual, situacao });
      await concluida(tx);
    },

    async lerGravacao(id) {
      const tx = db.transaction('gravacoes', 'readonly');
      return (await pedido(tx.objectStore('gravacoes').get(id))) || null;
    },

    async listarGravacoes() {
      const tx = db.transaction('gravacoes', 'readonly');
      return pedido(tx.objectStore('gravacoes').getAll());
    },

    // Troca todos os pedacos de uma gravacao por um arquivo inteiro, numa transacao so: ou a troca
    // acontece inteira, ou nada muda (a copia antiga fica). O offscreen usa quando a soma dos pedacos
    // difere do arquivo que esta na mao (copia com buraco) — revisoes de 09/11/2026.
    async substituirPedacos(id, blob) {
      const tx = db.transaction('pedacos', 'readwrite');
      const loja = tx.objectStore('pedacos');
      loja.delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
      loja.put({ id, seq: 0, blob });
      await concluida(tx);
    },

    async apagarGravacao(id) {
      const tx = db.transaction(['gravacoes', 'pedacos'], 'readwrite');
      tx.objectStore('gravacoes').delete(id);
      tx.objectStore('pedacos').delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
      await concluida(tx);
    },

    fechar() {
      db.close();
    },
  };
}

// Chrome da extensao FALSO para abrir a janelinha de verdade (extensao/popup.html) no Chrome sem
// cabeca. Roda antes de qualquer script da pagina (Page.addScriptToEvaluateOnNewDocument).
// O teste muda window.__falso para simular cada situacao; a janelinha pergunta a situacao a cada 250 ms.
// Endereco com ?pendentes=a,b simula avisos pendentes guardados; ?recuperavel=gravando|memoria simula
// uma gravacao nao salva na lista.
(() => {
  const busca = new URLSearchParams(location.search);
  const recuperavel = busca.get('recuperavel');
  const falso = {
    estado: { ok: true, estado: 'parado', atual: null, niveis: null, alertas: [], emEntrega: [], naMemoria: [] },
    recuperaveis: recuperavel
      ? [{ id: 'r1', nome: 'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a', origem: 'WhatsApp', inicio: new Date(2026, 10, 9, 14, 30).getTime(), situacao: recuperavel }]
      : [],
    ultimas: [],
    pendentes: (busca.get('pendentes') || '').split(',').filter(Boolean),
    enviadas: [],
    respostaAlternar: { ok: true },
    ouvintesStorage: [],
    ouvintesDownloads: [],
    itensDownload: {}, // id -> { url } (o que chrome.downloads.search devolve)
  };
  window.__falso = falso;
  window.chrome = {
    runtime: {
      getURL: (p) => 'chrome-extension://teste/' + p,
      sendMessage: async (msg) => {
        falso.enviadas.push(msg);
        if (msg.alvo === 'offscreen' && msg.tipo === 'estado') return falso.estado;
        if (msg.alvo === 'sw' && msg.tipo === 'recuperaveis') return { ok: true, lista: falso.recuperaveis };
        if (msg.alvo === 'sw' && msg.tipo === 'alternar') return falso.respostaAlternar;
        return { ok: true };
      },
    },
    tabs: { query: async () => [{ id: 7, url: 'https://web.whatsapp.com/' }] },
    storage: {
      local: { get: async () => ({ ultimas: falso.ultimas }) },
      session: { get: async () => ({ pendentes: falso.pendentes }) },
      onChanged: { addListener: (fn) => falso.ouvintesStorage.push(fn) },
    },
    downloads: {
      onChanged: { addListener: (fn) => falso.ouvintesDownloads.push(fn) },
      search: async ({ id }) => (falso.itensDownload[id] ? [falso.itensDownload[id]] : []),
      show() {},
      showDefaultFolder() {},
    },
    commands: { getAll: async () => [{ name: 'alternar-gravacao', shortcut: 'Alt+Shift+G' }] },
  };
})();

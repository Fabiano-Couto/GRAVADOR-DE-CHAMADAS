// Maquina de estados da gravacao: parado > iniciando > gravando > salvando > parado.
// Uma gravacao por vez. Quem guarda a maquina e o documento offscreen (o service worker dorme).
// Testes: testes/unidade/estado.test.js.

export function criarMaquina() {
  let estado = 'parado';
  let tabId = null;
  return {
    get estado() {
      return estado;
    },
    get tabId() {
      return tabId;
    },
    pedirInicio(id) {
      if (estado !== 'parado') return false;
      estado = 'iniciando';
      tabId = id;
      return true;
    },
    confirmarInicio() {
      if (estado !== 'iniciando') return false;
      estado = 'gravando';
      return true;
    },
    falharInicio() {
      if (estado !== 'iniciando') return false;
      estado = 'parado';
      tabId = null;
      return true;
    },
    // So aceita parar o que esta gravando: o segundo Parar nao gera um segundo arquivo.
    pedirParada() {
      if (estado !== 'gravando') return false;
      estado = 'salvando';
      return true;
    },
    concluirSalvamento() {
      if (estado !== 'salvando') return false;
      estado = 'parado';
      tabId = null;
      return true;
    },
  };
}

// O que um clique (ou o atalho) faz, dada a situacao atual.
export function decidirAlternar(estado, tabIdGravando, tabIdPedido) {
  if (estado === 'parado') return 'iniciar';
  if (estado === 'gravando') return tabIdGravando === tabIdPedido ? 'parar' : 'recusar-outra-aba';
  return 'aguardar';
}

// Gravacoes que sobraram no armazem (interrompidas ou que nao chegaram a ser salvas), mais nova
// primeiro, sem as ocupadas agora: a que esta gravando e as que estao sendo salvas neste momento
// (achado da revisao de 09/11/2026: a que estava sendo salva voltava na lista com botoes ativos).
export function gravacoesParaRecuperar(lista, idsOcupados) {
  return lista.filter((g) => !idsOcupados.includes(g.id)).sort((a, b) => b.inicio - a.inicio);
}

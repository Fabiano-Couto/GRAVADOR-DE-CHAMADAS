// Como o icone da extensao aparece (selo, cor e dica), dada a situacao da gravacao e um eventual
// aviso pendente. Funcao pura: o service worker so aplica. Testes: testes/unidade/icone.test.js.
import { textoDoAlerta, textoDoPendente } from './mensagens.js';

export const CORES = { gravando: '#D93025', alerta: '#E37400', neutra: '#5F6368' };
const TITULO = 'Gravador de Chamadas';

// r: aviso 'estado-mudou' do offscreen ({ estado, alertas, origem }) ou o resumo dele
//    ({ estado, alertas, atual: { origem } }) — a origem pode vir dos dois jeitos (revisao de
//    09/11/2026: a dica mostrava "Gravando undefined").
// pendente: codigo de aviso que aconteceu sem a janelinha aberta (fica ate ela ser aberta) ou null.
export function aparenciaDoIcone(r, pendente) {
  const estado = r ? r.estado : 'parado';
  const alertas = (r && r.alertas) || [];
  const origem = (r && (r.origem || (r.atual && r.atual.origem))) || 'a aba';
  if (estado === 'gravando') {
    if (alertas.length) {
      return { texto: '!', cor: CORES.alerta, titulo: 'Gravando ' + origem + '. ' + alertas.map(textoDoAlerta).join(' ') };
    }
    return { texto: 'REC', cor: CORES.gravando, titulo: 'Gravando ' + origem };
  }
  if (estado === 'iniciando') return { texto: '...', cor: CORES.neutra, titulo: 'Iniciando a gravação' };
  if (estado === 'salvando') return { texto: '...', cor: CORES.neutra, titulo: 'Salvando a gravação' };
  if (pendente) return { texto: '!', cor: CORES.alerta, titulo: textoDoPendente(pendente) };
  return { texto: '', cor: CORES.neutra, titulo: TITULO };
}

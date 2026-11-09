// Lista de avisos pendentes do icone (chrome.storage.session 'pendentes'). Antes era uma vaga so, e
// um aviso apagava outro ainda nao lido (2a rodada de revisao, 09/11/2026).
// - "a resolver" (nao-salva, nao-salva-memoria): saem quando nao sobra nada por salvar;
// - "informativos" (gravador-parou, nao-salva-perdida): saem quando a janelinha mostra o texto.
// Testes: testes/unidade/pendentes.test.js.
import { PENDENTES_INFORMATIVOS } from './mensagens.js';

export function comPendente(lista, codigo) {
  return lista.includes(codigo) ? lista : [...lista, codigo];
}

export function semPendentes(lista, codigos) {
  return lista.filter((c) => !codigos.includes(c));
}

export function depoisDeVisto(lista) {
  return lista.filter((c) => !PENDENTES_INFORMATIVOS.includes(c));
}

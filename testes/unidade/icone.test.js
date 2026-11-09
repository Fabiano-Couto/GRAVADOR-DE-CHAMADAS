// Icone da extensao — Gravador v1, achados da revisao de 09/11/2026.
// Defeitos que estes testes impedem: dica "Gravando undefined" quando a situacao vem no formato do
// resumo; aviso de gravacao com problema sem selo; salvamento que falhou sem ninguem olhando (aba
// fechada no fim da chamada) e o icone voltando ao normal como se nada tivesse acontecido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aparenciaDoIcone } from '../../extensao/lib/icone.js';

test('icone: gravando mostra REC vermelho com a origem', () => {
  assert.deepEqual(aparenciaDoIcone({ estado: 'gravando', alertas: [], origem: 'WhatsApp' }, null), {
    texto: 'REC',
    cor: '#D93025',
    titulo: 'Gravando WhatsApp',
  });
});

test('icone: a origem tambem vale quando vem dentro de atual (formato do resumo)', () => {
  assert.equal(aparenciaDoIcone({ estado: 'gravando', alertas: [], atual: { origem: 'Meet_abc-defg-hij' } }, null).titulo, 'Gravando Meet_abc-defg-hij');
});

test('icone: gravando com aviso mostra "!" ambar e o texto do aviso na dica', () => {
  const a = aparenciaDoIcone({ estado: 'gravando', alertas: ['aba-muda'], origem: 'WhatsApp' }, null);
  assert.equal(a.texto, '!');
  assert.equal(a.cor, '#E37400');
  assert.ok(a.titulo.startsWith('Gravando WhatsApp. Nenhum som vem da aba gravada'), a.titulo);
});

test('icone: parado com aviso pendente continua com "!" ate a janelinha ser aberta', () => {
  assert.deepEqual(aparenciaDoIcone({ estado: 'parado', alertas: [] }, 'nao-salva'), {
    texto: '!',
    cor: '#E37400',
    titulo: 'Uma gravação NÃO foi salva em Downloads. Abra a janelinha: ela está em "Gravações não salvas".',
  });
});

test('icone: parado sem pendencia fica limpo; salvando mostra reticencias', () => {
  assert.deepEqual(aparenciaDoIcone({ estado: 'parado', alertas: [] }, null), { texto: '', cor: '#5F6368', titulo: 'Gravador de Chamadas' });
  assert.equal(aparenciaDoIcone({ estado: 'salvando', alertas: [] }, null).texto, '...');
});

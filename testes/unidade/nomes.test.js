// Regras do nome do arquivo e da origem da chamada — Gravador v1, 09/11/2026.
// Defeitos que estes testes impedem: arquivo que nao diz de onde veio a chamada (WhatsApp, Meet e o
// codigo da reuniao); data fora do formato combinado; caractere proibido no Windows quebrando o
// salvamento; gravacao anterior sobrescrita; janela "Salvar como" aparecendo a cada gravacao;
// gravacao interrompida recuperada sem aviso de que esta incompleta.
// Valores esperados escritos a mao (nada calculado pelo codigo testado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { origemDaUrl, nomeArquivo, nomeParaRecuperar, opcoesDownload } from '../../extensao/lib/nomes.js';

test('origem: web.whatsapp.com vira WhatsApp', () => {
  assert.equal(origemDaUrl('https://web.whatsapp.com/'), 'WhatsApp');
});

test('origem: reuniao do Meet leva o codigo da reuniao', () => {
  assert.equal(origemDaUrl('https://meet.google.com/abc-defg-hij?authuser=0'), 'Meet_abc-defg-hij');
});

test('origem: tela inicial do Meet, sem codigo, vira so Meet', () => {
  assert.equal(origemDaUrl('https://meet.google.com/landing'), 'Meet');
});

test('origem: outro site vira o dominio, sem www', () => {
  assert.equal(origemDaUrl('https://www.teams.microsoft.com/v2/'), 'teams.microsoft.com');
});

test('origem: endereco vazio, ausente, invalido ou interno do Chrome vira Aba', () => {
  assert.equal(origemDaUrl(''), 'Aba');
  assert.equal(origemDaUrl(undefined), 'Aba');
  assert.equal(origemDaUrl('nao e endereco'), 'Aba');
  assert.equal(origemDaUrl('chrome://extensions/'), 'Aba');
});

test('nome: pasta, data e hora locais no formato AAAA-MM-DD_HHhMM e extensao m4a', () => {
  assert.equal(
    nomeArquivo(new Date(2026, 10, 9, 14, 30, 59), 'WhatsApp'),
    'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a',
  );
});

test('nome: mes, dia, hora e minuto com zero a esquerda', () => {
  assert.equal(
    nomeArquivo(new Date(2026, 0, 5, 8, 7, 0), 'Meet_abc-defg-hij'),
    'Gravacoes de Chamadas/2026-01-05_08h07_Meet_abc-defg-hij.m4a',
  );
});

test('nome: cada caractere proibido no Windows vira hifen', () => {
  assert.equal(
    nomeArquivo(new Date(2026, 10, 9, 14, 30, 0), 'a<b>c:d"e/f\\g|h?i*j'),
    'Gravacoes de Chamadas/2026-11-09_14h30_a-b-c-d-e-f-g-h-i-j.m4a',
  );
});

test('nome: caractere de controle vira hifen', () => {
  assert.equal(
    nomeArquivo(new Date(2026, 10, 9, 14, 30, 0), 'a\u0001b\u001fc'),
    'Gravacoes de Chamadas/2026-11-09_14h30_a-b-c.m4a',
  );
});

test('nome: ponto e espaco nas pontas da origem saem (o Windows nao aceita)', () => {
  assert.equal(
    nomeArquivo(new Date(2026, 10, 9, 14, 30, 0), ' .site. '),
    'Gravacoes de Chamadas/2026-11-09_14h30_site.m4a',
  );
});

test('salvar: nunca sobrescreve e nunca abre a janela Salvar como', () => {
  assert.deepEqual(opcoesDownload('blob:abc', 'Gravacoes de Chamadas/x.m4a'), {
    url: 'blob:abc',
    filename: 'Gravacoes de Chamadas/x.m4a',
    conflictAction: 'uniquify',
    saveAs: false,
  });
});

test('recuperar: gravacao interrompida no meio ganha _recuperada no nome', () => {
  assert.equal(
    nomeParaRecuperar({ nome: 'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a', situacao: 'gravando' }),
    'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp_recuperada.m4a',
  );
});

test('recuperar: gravacao completa que so nao chegou a salvar fica com o nome original', () => {
  assert.equal(
    nomeParaRecuperar({ nome: 'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a', situacao: 'salvando' }),
    'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a',
  );
  assert.equal(
    nomeParaRecuperar({ nome: 'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a', situacao: 'pendente' }),
    'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a',
  );
});

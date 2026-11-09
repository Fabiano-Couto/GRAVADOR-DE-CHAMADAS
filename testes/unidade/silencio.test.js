// Aviso de microfone mudo — Gravador v1, 09/11/2026.
// Defeito que estes testes impedem: gravar uma chamada inteira sem a voz do usuario (microfone
// desligado no Windows, outro dispositivo selecionado) sem ninguem perceber. Silencio ABSOLUTO por
// 10 s e sinal de captura quebrada; pausa na conversa ainda tem ruido de sala e nao dispara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarDetectorSilencio } from '../../extensao/lib/silencio.js';

test('silencio: 9,9 s de silencio absoluto nao avisa; 10 s avisa uma vez so', () => {
  const d = criarDetectorSilencio();
  assert.equal(d.alimentar(0, 0), null);
  assert.equal(d.alimentar(0, 9900), null);
  assert.equal(d.alertando, false);
  assert.equal(d.alimentar(0, 10000), 'alerta');
  assert.equal(d.alertando, true);
  assert.equal(d.alimentar(0, 15000), null);
});

test('silencio: o som voltando encerra o aviso', () => {
  const d = criarDetectorSilencio();
  d.alimentar(0, 0);
  d.alimentar(0, 10000);
  assert.equal(d.alimentar(0.2, 10500), 'normal');
  assert.equal(d.alertando, false);
});

test('silencio: um som no meio zera a contagem', () => {
  const d = criarDetectorSilencio();
  d.alimentar(0, 0);
  d.alimentar(0.01, 5000);
  assert.equal(d.alimentar(0, 5500), null);
  assert.equal(d.alimentar(0, 14900), null);
  assert.equal(d.alimentar(0, 15500), 'alerta');
});

test('silencio: ruido baixo de sala (0,001) conta como som, nao como silencio', () => {
  const d = criarDetectorSilencio();
  d.alimentar(0.001, 0);
  assert.equal(d.alimentar(0.001, 20000), null);
  assert.equal(d.alertando, false);
});

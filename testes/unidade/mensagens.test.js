// Mensagens ao usuario — Gravador v1, 09/11/2026.
// Defeito que estes testes impedem: o usuario ver um codigo tecnico (ou nada) quando a gravacao e
// recusada. A guarda testes/guardas/guardas.test.js confere que todo motivo usado no codigo existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDoMotivo } from '../../extensao/lib/mensagens.js';

test('mensagem: outra aba gravando cita a origem da gravacao em andamento', () => {
  assert.equal(
    textoDoMotivo({ ok: false, motivo: 'outra-aba', origem: 'WhatsApp' }),
    'Já existe uma gravação em andamento (WhatsApp) em outra aba. Pare aquela antes de começar outra.',
  );
});

test('mensagem: microfone sem permissao explica o que fazer', () => {
  assert.equal(
    textoDoMotivo({ ok: false, motivo: 'microfone' }),
    'Falta autorizar o microfone. Abri uma aba para você permitir; depois clique em Gravar de novo.',
  );
});

// Revisao de 09/11/2026: a mensagem mandava recarregar a pagina — e recarregar o WhatsApp Web ou o
// Meet derruba a chamada.
test('mensagem: falha de captura manda clicar de novo, nunca recarregar a pagina da chamada', () => {
  assert.equal(
    textoDoMotivo({ ok: false, motivo: 'captura-aba' }),
    'O Chrome não deixou capturar o som desta aba. Feche esta janelinha e clique no ícone de novo (ou use o atalho com a aba da chamada em foco).',
  );
});

test('mensagem: motivo desconhecido ou erro interno mostra o detalhe', () => {
  assert.equal(textoDoMotivo({ ok: false, motivo: 'xyz', detalhe: 'falhou' }), 'Algo deu errado: falhou');
  assert.equal(textoDoMotivo({ ok: false, motivo: 'interno' }), 'Algo deu errado.');
  assert.equal(textoDoMotivo(undefined), 'Algo deu errado.');
});

// Texto mostrado ao usuario para cada motivo de recusa ou erro (janelinha e dica do icone).
// Todo motivo usado no codigo tem de existir aqui: a guarda testes/guardas/guardas.test.js confere.

const TEXTOS = {
  'sem-aba': 'Não encontrei a aba para gravar.',
  'pagina-interna': 'Esta é uma página interna do Chrome e não pode ser gravada. Abra a aba da chamada (WhatsApp Web ou Meet).',
  'outra-aba': (r) =>
    'Já existe uma gravação em andamento' + (r.origem ? ' (' + r.origem + ')' : '') + ' em outra aba. Pare aquela antes de começar outra.',
  aguardar: 'Aguarde um instante: a gravação anterior ainda está sendo salva.',
  microfone: 'Falta autorizar o microfone. Abri uma aba para você permitir; depois clique em Gravar de novo.',
  'microfone-falhou': 'Não consegui abrir o microfone. Confira se ele está conectado e se outro programa não o está usando sozinho.',
  'captura-aba': 'O Chrome não deixou capturar o som desta aba. Recarregue a página da chamada e tente de novo.',
  formato: 'Este Chrome não grava em M4A. Atualize o Chrome.',
  salvar: 'Não consegui salvar o arquivo em Downloads. A gravação ficou guardada: use "Salvar" na lista de gravações não salvas.',
  'nada-a-parar': 'Não há gravação em andamento.',
  vazia: 'Essa gravação não tinha áudio guardado e foi descartada.',
  'nao-encontrada': 'Essa gravação não está mais guardada.',
  'em-andamento': 'Essa gravação ainda está em andamento.',
  interno: (r) => 'Algo deu errado' + (r.detalhe ? ': ' + r.detalhe : '.'),
  desconhecido: 'Pedido desconhecido.',
};

export const MOTIVOS = Object.keys(TEXTOS);

export function textoDoMotivo(resposta) {
  const r = resposta || {};
  const texto = TEXTOS[r.motivo] || TEXTOS.interno;
  return typeof texto === 'function' ? texto(r) : texto;
}

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
  // Nao mandar recarregar: recarregar o WhatsApp Web ou o Meet derruba a chamada (revisao de 09/11/2026).
  'captura-aba': 'O Chrome não deixou capturar o som desta aba. Feche esta janelinha e clique no ícone de novo (ou use o atalho com a aba da chamada em foco).',
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

// Avisos DURANTE a gravacao (icone com "!" e texto na janelinha). A gravacao continua.
const ALERTAS = {
  'microfone-mudo': 'Seu microfone está sem som há mais de 10 segundos. Confira se ele não está mudo no Windows.',
  // Revisao de 09/11/2026: no WhatsApp Web a chamada pode abrir numa janela separada; o som do
  // cliente toca la, e a aba principal capturada fica muda.
  'aba-muda':
    'Nenhum som vem da aba gravada há mais de 30 segundos. Se a chamada abriu numa janela separada, pare aqui e use o atalho com a janela da chamada em foco. Se só ninguém está falando, ignore.',
  'sem-copia':
    'A cópia de segurança não está funcionando: a gravação continua e será salva ao parar, mas não pode ser recuperada se o Chrome fechar no meio.',
};

export const CODIGOS_DE_ALERTA = Object.keys(ALERTAS);

export function textoDoAlerta(codigo) {
  return ALERTAS[codigo] || 'Atenção na gravação.';
}

// Avisos que ficam no icone (aconteceram sem ninguem olhando). Dois tipos:
// - "a resolver": somem quando nao sobra nenhuma gravacao por salvar (o offscreen avisa);
// - "informativos": somem quando a janelinha e aberta e mostra o texto.
const PENDENTES = {
  'nao-salva': 'Uma gravação NÃO foi salva em Downloads. Ela está em "Gravações não salvas": clique em Salvar.',
  'nao-salva-memoria':
    'Uma gravação NÃO foi salva em Downloads e a cópia de segurança não está funcionando: ela está em "Gravações não salvas" só até o Chrome fechar. Clique em Salvar agora.',
  'nao-salva-perdida': 'Uma gravação não pôde ser salva e não havia cópia de segurança dela.',
  // Revisao de 09/11/2026: o texto dizia "foi salvo" antes de o salvamento acontecer.
  'gravador-parou': 'A gravação parou sozinha por um erro do Chrome. O que foi gravado até ali foi mandado para Downloads.',
};

export const CODIGOS_PENDENTES = Object.keys(PENDENTES);
export const PENDENTES_INFORMATIVOS = ['nao-salva-perdida', 'gravador-parou'];

export function textoDoPendente(codigo) {
  return PENDENTES[codigo] || 'Abra a janelinha do Gravador de Chamadas.';
}

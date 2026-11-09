// Pagina da permissao do microfone. O documento offscreen nao consegue mostrar o pedido do Chrome;
// esta pagina, aberta numa aba, pede uma vez e a permissao fica gravada na extensao.
const resultado = document.getElementById('resultado');
const botao = document.getElementById('permitir');

function mostrarPronto() {
  resultado.className = 'ok';
  resultado.textContent = 'Pronto! O microfone está autorizado. Pode fechar esta aba e clicar em Gravar no ícone da extensão.';
  botao.hidden = true;
}

async function pedir() {
  botao.disabled = true;
  resultado.className = '';
  resultado.textContent = 'Aguardando a sua resposta na caixa do Chrome...';
  try {
    const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    fluxo.getTracks().forEach((t) => t.stop());
    mostrarPronto();
  } catch (e) {
    botao.disabled = false;
    if (e && e.name === 'NotAllowedError') {
      resultado.textContent =
        'O microfone ficou bloqueado. Clique no ícone à esquerda do endereço desta página, mude Microfone para Permitir e clique no botão de novo.';
    } else if (e && e.name === 'NotFoundError') {
      resultado.textContent = 'Nenhum microfone foi encontrado. Conecte um microfone (ou fone com microfone) e tente de novo.';
    } else {
      resultado.textContent = 'Não consegui abrir o microfone: ' + String(e?.message || e);
    }
  }
}

botao.addEventListener('click', pedir);

navigator.permissions
  .query({ name: 'microphone' })
  .then((p) => {
    if (p.state === 'granted') mostrarPronto();
  })
  .catch(() => {});

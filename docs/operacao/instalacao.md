# Instalar, atualizar e remover a extensão

A extensão é de uso pessoal: não vai para a Chrome Web Store. Ela é carregada direto da pasta
`codigo\extensao` no Chrome do usuário (modo do desenvolvedor). Esta é a "publicação" do projeto.

## Antes (só leitura)

- Suíte e smoke verdes sobre o commit que vai ser carregado (comandos no [CLAUDE.md](../../CLAUDE.md)).
- Se a pasta do Drive estiver em modo "streaming", marcar `codigo\extensao` como **disponível
  offline** (clique direito → Google Drive → Disponível off-line), para o Chrome não esbarrar em
  arquivo só na nuvem.

## Instalar (primeira vez)

1. Abrir `chrome://extensions`.
2. Ligar **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolher a pasta `codigo\extensao`.
4. A página "Permitir o microfone" abre sozinha → **Permitir microfone** → Permitir na caixa do Chrome.
5. Fixar o ícone na barra (quebra-cabeça → alfinete em "Gravador de Chamadas").

**O que pode dar errado:** o Chrome recusa a pasta (mensagem em vermelho) — normalmente arquivo com
`_` no começo do nome ou manifest inválido; o smoke pega os dois. **Socorro:** remover a extensão
(nada fica para trás além das gravações já salvas em Downloads).

## Atualizar (depois de mudar o código)

1. Conferir que **não há gravação em andamento** (ícone sem `REC`). Recarregar no meio interrompe a
   gravação; ela fica em "Gravações não salvas" e pode ser salva, mas é melhor evitar.
2. `chrome://extensions` → Gravador de Chamadas → **↻ (recarregar)**.
3. Conferir na janelinha que ela abre e mostra "Pronto para gravar".

**Socorro:** voltar o código ao commit anterior (`git checkout <commit> -- extensao`) e recarregar.

## Atalho

`chrome://extensions/shortcuts` → Gravador de Chamadas → "Iniciar ou parar a gravação da aba atual".
Padrão: Alt+Shift+G (se outra extensão já usa, o Chrome deixa sem atalho e a janelinha avisa).

## Remover

`chrome://extensions` → Gravador de Chamadas → **Remover**. Apaga também as gravações **não salvas**
guardadas na extensão (as já salvas em Downloads continuam lá). Antes de remover, salvar o que
aparecer em "Gravações não salvas".

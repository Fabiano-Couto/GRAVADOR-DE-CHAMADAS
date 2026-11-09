# Instalar, atualizar e remover a extensão

A extensão é de uso pessoal: não vai para a Chrome Web Store. O Chrome a carrega de uma **pasta
local, fora do Google Drive** — `C:\Extensoes\Gravador de Chamadas` —, preenchida pelo instalador a
partir de `codigo\extensao`. Esta é a "publicação" do projeto.

**Por que fora do Drive** (decisão do usuário, 09/11/2026, a partir da revisão de segurança): a
extensão roda com o microfone liberado. Se o Chrome lesse a pasta sincronizada, quem conseguisse
escrever nela (pasta compartilhada, conta comprometida, outro dispositivo) passaria a rodar código
no Chrome sem aviso. A pasta local só muda quando o instalador roda.

**Pasta Downloads:** conferida em 09/11/2026 pelo usuário — é local (não sincronizada). Se um dia
passar a apontar para OneDrive ou Drive, as gravações sobem junto (a página de permissão avisa).

## Antes (só leitura)

- Suíte e smoke verdes sobre o commit que vai ser instalado (comandos no [CLAUDE.md](../../CLAUDE.md)).
- `extensao/` sem mudança não commitada (o instalador recusa; `--forcar` só para teste local).
- Nenhuma gravação em andamento (ícone sem `REC`).

## Instalar ou atualizar a pasta local

Dentro de `codigo\`: `node ferramentas/instalar.js`

O instalador:

- recusa destino dentro de pasta sincronizada (Google Drive — inclusive drives compartilhados —,
  OneDrive, Dropbox, iCloud), dentro de um repositório git (pode ser outro checkout com trabalho não
  salvo) ou dentro da própria pasta da extensão;
- só substitui o destino se ele estiver vazio (lixo do sistema como `desktop.ini` não conta) ou for
  uma instalação anterior do Gravador (confere o `manifest.json`); qualquer outra coisa lá dentro faz
  ele parar sem tocar em nada;
- copia `extensao/` (sem `desktop.ini` e lixo do sistema) para uma **pasta irmã temporária**, confere
  arquivo por arquivo pelo hash (lista ordenada pelo caminho) e só então troca a instalação anterior —
  se a cópia falhar no meio, a anterior continua lá;
- imprime o commit, a quantidade de arquivos e uma assinatura curta da cópia (anotar no registro).

`C:\Extensoes` herda da raiz do disco a permissão de escrita para outras contas do Windows. Decisão
do usuário (09/11/2026): manter, porque o computador é de uso dele. Com outros usuários na máquina,
usar uma pasta só da conta: `node ferramentas/instalar.js "%LOCALAPPDATA%\Extensoes\Gravador de Chamadas"`.

**Socorro:** reinstalar o commit anterior (`git checkout <commit> -- extensao`, rodar o instalador
com `--forcar`, recarregar) e depois voltar o arquivo (`git checkout HEAD -- extensao`).

## Carregar no Chrome (primeira vez)

1. Abrir `chrome://extensions`.
2. Ligar **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolher `C:\Extensoes\Gravador de Chamadas`.
4. A página "Permitir o microfone" abre sozinha → **Permitir microfone** → Permitir na caixa do Chrome.
5. Fixar o ícone na barra (quebra-cabeça → alfinete em "Gravador de Chamadas").

O identificador da extensão vem do caminho da pasta: mantendo sempre o mesmo caminho, a permissão
do microfone e as gravações não salvas sobrevivem às atualizações.

**O que pode dar errado:** o Chrome recusa a pasta (mensagem em vermelho) — normalmente arquivo com
`_` no começo do nome ou manifest inválido; o smoke pega os dois. **Socorro:** remover a extensão
(nada fica para trás além das gravações já salvas em Downloads).

## Mudar de pasta (ex.: quem carregou pela pasta do Drive)

O identificador da extensão no Chrome vem do caminho da pasta. Mudar de pasta = **outra extensão**
para o Chrome: a permissão do microfone e as gravações não salvas **não** vão junto.

1. Na extensão antiga, abrir a janelinha e **salvar** o que estiver em "Gravações não salvas".
2. `chrome://extensions` → extensão antiga → **Remover** (duas "Gravador de Chamadas" carregadas
   disputam o atalho e mostram dois ícones).
3. Instalar na pasta nova e **Carregar sem compactação** de lá.
4. Autorizar o microfone de novo (a página abre sozinha).

## Atualizar (depois de mudar o código)

1. Commit, suíte e smoke verdes; nenhuma gravação em andamento.
2. `node ferramentas/instalar.js`.
3. `chrome://extensions` → Gravador de Chamadas → **↻ (recarregar)**.
4. Conferir na janelinha que ela abre e mostra "Pronto para gravar".

Recarregar no meio de uma gravação a interrompe; ela fica em "Gravações não salvas".

## Atalho

`chrome://extensions/shortcuts` → Gravador de Chamadas → "Iniciar ou parar a gravação da aba atual".
Padrão: Alt+Shift+G (se outra extensão já usa, o Chrome deixa sem atalho e a janelinha avisa). O
atalho grava a aba ativa da **janela em foco** — inclusive uma janela de chamada sem barra de
ferramentas, onde o ícone não aparece.

## Remover

`chrome://extensions` → Gravador de Chamadas → **Remover**. Apaga também as gravações **não salvas**
guardadas na extensão (as já salvas em Downloads continuam lá). Antes de remover, salvar o que
aparecer em "Gravações não salvas". A pasta `C:\Extensoes\Gravador de Chamadas` pode ser apagada
depois.

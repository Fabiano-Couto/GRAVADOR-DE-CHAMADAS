# Gravador de Chamadas

Extensão para o **Google Chrome** que grava o áudio de chamadas feitas no navegador — **WhatsApp Web**,
**Google Meet** e qualquer outra aba com som — **nos dois sentidos**: a sua voz e a de quem está do
outro lado, cada uma num canal. O arquivo vai direto para a pasta **Downloads**, em M4A, e **nada sai
do seu computador**.

Feita para quem atende clientes por chamada e precisa rever depois, com calma, tudo o que foi dito.

---

## Sumário

- [O que ela faz](#o-que-ela-faz)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Como gravar](#como-gravar)
  - [WhatsApp Web](#whatsapp-web)
  - [Google Meet](#google-meet)
  - [Outros sites](#outros-sites)
- [A janelinha e o ícone](#a-janelinha-e-o-ícone)
- [As gravações](#as-gravações)
- [Qual microfone é gravado](#qual-microfone-é-gravado)
- [Gravações interrompidas](#gravações-interrompidas)
- [Avisos durante a gravação](#avisos-durante-a-gravação)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Gravar conversas: cuidados legais](#gravar-conversas-cuidados-legais)
- [Limitações conhecidas](#limitações-conhecidas)
- [Solução de problemas](#solução-de-problemas)
- [Para desenvolvedores](#para-desenvolvedores)
- [Próximos passos](#próximos-passos)

---

## O que ela faz

- **Grava os dois lados da chamada:** o som da aba (o cliente, os participantes) e o seu microfone.
- **Vozes separadas:** canal **esquerdo = você**, canal **direito = o outro lado**. No fone, cada voz
  sai de um lado; numa transcrição dá para saber quem falou o quê.
- **Você continua ouvindo normalmente.** Ao capturar uma aba, o Chrome a deixa muda; a extensão
  devolve o som ao seu fone/caixa (e nunca devolve o seu microfone, para você não ouvir a própria voz).
- **Um clique ou um atalho:** `Alt+Shift+G` liga e desliga a gravação da aba em foco.
- **Salva sozinho** em `Downloads\Gravacoes de Chamadas\`, sem perguntar e sem sobrescrever nada.
- **Não perde a gravação se o Chrome fechar:** o áudio é guardado em pedaços durante a chamada e pode
  ser recuperado depois.
- **Avisa quando algo está errado:** microfone mudo, aba gravada sem som, cópia de segurança falhando,
  gravação que não foi salva.
- **Nada vai para a internet:** sem servidor, sem conta, sem análise de uso. O próprio Chrome bloqueia
  qualquer conexão da extensão.

## Requisitos

- **Google Chrome 116 ou mais novo** (desenvolvida e testada no Chrome 156, no Windows 11).
- Um **microfone**. Recomendado: **fone de ouvido com microfone (headset)** — sem fone, a voz do
  cliente sai na caixa de som e entra no seu microfone (vira eco no seu canal).
- A chamada tem de acontecer **numa aba do Chrome** (WhatsApp Web, Meet, Teams na web, Zoom na web...).
  Aplicativos instalados (WhatsApp para Windows, Teams desktop, Zoom desktop) **não** são alcançados
  por uma extensão do navegador.

## Instalação

A extensão é instalada em modo desenvolvedor (não está na Chrome Web Store).

### 1. Baixe o código

- Pelo GitHub: botão **Code → Download ZIP** e descompacte, **ou**
- `git clone https://github.com/Fabiano-Couto/GRAVADOR-DE-CHAMADAS.git`

### 2. Coloque a extensão numa pasta local (recomendado)

A extensão roda com o microfone liberado. Por segurança, o Chrome deve carregá-la de uma **pasta local
que não seja sincronizada** (fora do Google Drive, OneDrive, Dropbox): se alguém conseguisse alterar os
arquivos dessa pasta, o código alterado rodaria no seu Chrome sem aviso.

Com o [Node.js](https://nodejs.org/) instalado, dentro da pasta do projeto:

```
node ferramentas/instalar.js
```

Isso copia a pasta `extensao\` para `C:\Extensoes\Gravador de Chamadas` e confere a cópia arquivo por
arquivo. Outro destino: `node ferramentas/instalar.js "D:\Minhas Extensoes\Gravador"`.
O instalador se recusa a gravar dentro do Google Drive e a apagar uma pasta que não seja uma instalação
anterior do Gravador.

Sem Node.js: copie a pasta `extensao\` à mão para uma pasta local de sua escolha.

### 3. Carregue no Chrome

1. Abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha a pasta da extensão
   (`C:\Extensoes\Gravador de Chamadas` ou a que você usou).
4. Fixe o ícone na barra: ícone de quebra-cabeça → alfinete ao lado de **Gravador de Chamadas**.

### 4. Autorize o microfone (uma vez só)

Na instalação abre sozinha a página **"Permitir o microfone"**. Clique em **Permitir microfone** e
depois em **Permitir** na caixa do Chrome. Pronto: a partir daí a gravação começa direto.

> A permissão vale para a extensão usar o microfone — qualquer um. Qual microfone entra na gravação é
> outra coisa: veja [Qual microfone é gravado](#qual-microfone-é-gravado).

### Atualizar

Baixe a versão nova, rode `node ferramentas/instalar.js` de novo (ou copie a pasta por cima) e clique
em **↻ recarregar** no cartão da extensão em `chrome://extensions`. Mantendo a mesma pasta, a permissão
do microfone e as gravações não salvas continuam. Não atualize no meio de uma gravação.

### Remover

`chrome://extensions` → **Remover**. Antes, salve o que estiver em "Gravações não salvas" na janelinha
(as gravações já salvas em Downloads ficam onde estão).

---

## Como gravar

Em qualquer site o caminho é o mesmo: **com a chamada em andamento, clique no ícone da extensão →
Gravar esta aba** (ou aperte `Alt+Shift+G` com a aba da chamada em foco). Para terminar, **Parar e
salvar** (ou o atalho de novo). Se a aba for fechada, a gravação para e é salva sozinha.

### WhatsApp Web

1. Abra [web.whatsapp.com](https://web.whatsapp.com) no Chrome e atenda (ou faça) a ligação.
2. Grave a aba **onde o som da chamada está tocando**:
   - **Chamada na própria aba do WhatsApp:** ícone da extensão → **Gravar esta aba**.
   - **Chamada numa janela separada** (janela pequena, sem barra de ferramentas — o ícone da extensão
     não aparece nela): clique dentro dessa janela e aperte **`Alt+Shift+G`**. O atalho grava a aba da
     janela em foco.
3. Ao desligar, se a chamada estava numa janela separada, ela fecha e a gravação é salva sozinha; se
   estava na aba principal, clique em **Parar e salvar**.

O arquivo sai como `AAAA-MM-DD_HHhMM_WhatsApp.m4a`.

> **Gravou a aba errada?** Se nenhum som vier da aba gravada por 30 segundos, o ícone fica com **!** e
> a janelinha avisa. Pare e grave a janela/aba onde a chamada está de fato.

### Google Meet

1. Entre na reunião em [meet.google.com](https://meet.google.com).
2. Ícone da extensão → **Gravar esta aba** (ou `Alt+Shift+G`).
3. Ao sair da reunião, **Parar e salvar** (sair da reunião não fecha a aba).

O arquivo leva o código da reunião: `AAAA-MM-DD_HHhMM_Meet_abc-defg-hij.m4a`. Todos os participantes
ficam no canal direito; você no esquerdo.

### Outros sites

Funciona em qualquer aba que toque som: Microsoft Teams na web, Zoom na web, sistemas de atendimento
com telefone no navegador, vídeos. O arquivo leva o domínio do site
(`..._teams.microsoft.com.m4a`). Não funciona em páginas internas do Chrome (`chrome://...`) nem na
Chrome Web Store.

**Uma gravação por vez:** com uma aba gravando, a janelinha das outras abas avisa e não deixa começar
outra.

---

## A janelinha e o ícone

A janelinha (clique no ícone) mostra:

- a situação: **Pronto para gravar: WhatsApp**, **Gravando: WhatsApp**, **Salvando em Downloads...**;
- o **cronômetro** e qual **microfone** está sendo gravado;
- duas barras de volume, **Você** e **Cliente**, que mexem quando cada lado fala — a prova, na hora, de
  que os dois lados estão entrando;
- os avisos, se houver;
- a lista de **Gravações não salvas**, com **Salvar** e **Descartar**;
- a **última gravação** (com "mostrar", que abre a pasta com o arquivo selecionado), o atalho atual e
  **Abrir Downloads**.

O ícone na barra:

| Selo | Significa |
|---|---|
| (nenhum) | parado |
| **REC** vermelho | gravando |
| **!** âmbar | gravando com um aviso — ou parado com algo que você precisa ver (abra a janelinha) |
| **...** | começando ou salvando |
| **X** por 5 s | o atalho foi recusado (passe o mouse no ícone para ver o motivo) |

O atalho pode ser trocado em `chrome://extensions/shortcuts`.

---

## As gravações

- **Onde:** `Downloads\Gravacoes de Chamadas\` (a pasta Downloads configurada no seu Chrome).
- **Nome:** `AAAA-MM-DD_HHhMM_<origem>.m4a`, com a hora do seu relógio. Se já existir um arquivo com o
  mesmo nome, o Chrome acrescenta `(1)`, `(2)`... — nunca sobrescreve.
- **Formato:** M4A (AAC), estéreo, 48 kHz, 96 kbps — **cerca de 0,75 MB por minuto** (uma hora ≈ 45 MB).
  É o formato de áudio comum no celular e no Windows; os testes conferem cada arquivo com o ffmpeg.
- **Canais:** **esquerdo = você** (microfone), **direito = o outro lado** (som da aba). Ouvindo com fone,
  cada voz sai de um lado. Para ouvir só o cliente, use o balanço (L/R) do seu player ou separe os canais
  num editor como o Audacity.
- **Transcrição:** os canais separados permitem transcrever cada lado em separado e montar o texto com
  "Você:" e "Cliente:" (ferramentas como Whisper aceitam M4A).

---

## Qual microfone é gravado

A extensão grava o **microfone padrão do Chrome** — normalmente o mesmo que o WhatsApp Web usa. Durante
a gravação, a janelinha mostra o nome dele, por exemplo:

```
Microfone: Comunicações - Microfone (Headset XYZ)
```

Confira essa linha no começo da chamada. Se não for o que você está usando:

- **Windows:** Configurações → Sistema → Som → Entrada → escolha o microfone; ou
- **Chrome:** `chrome://settings/content/microphone` → escolha o microfone padrão.

O microfone é escolhido no momento em que você clica em **Gravar**; trocar de dispositivo no meio da
gravação não muda o que está sendo gravado.

---

## Gravações interrompidas

Durante a chamada, o áudio é guardado em pedaços (a cada 5 segundos) dentro da própria extensão. Se o
Chrome fechar, travar, o computador desligar ou a extensão for recarregada no meio:

1. Abra a janelinha: a gravação aparece em **Gravações não salvas** ("interrompida no meio").
2. Clique em **Salvar**: ela vai para Downloads com `_recuperada` no nome.

Perda máxima num travamento: **cerca de 10 segundos** finais. **Descartar** pede um segundo clique e
apaga de vez.

Se um salvamento falhar (disco cheio, antivírus, pasta bloqueada), a gravação também fica nessa lista,
e o ícone mostra **!** até você abrir a janelinha.

---

## Avisos durante a gravação

A gravação **continua**; o ícone fica com **!** e a janelinha explica:

| Aviso | Quando | O que fazer |
|---|---|---|
| **Microfone sem som** | 10 s de silêncio absoluto no seu microfone (pausa na conversa não conta: a sala sempre tem ruído) | confira se o microfone não está mudo no Windows ou se é o dispositivo certo |
| **Nenhum som vem da aba gravada** | 30 s de silêncio absoluto na aba | a chamada pode estar noutra janela/aba: pare e grave a certa. Se só ninguém está falando, ignore |
| **Cópia de segurança não está funcionando** | o armazenamento interno falhou | a gravação continua e é salva ao parar, mas não pode ser recuperada se o Chrome fechar no meio |

E, mesmo com a janelinha fechada, o ícone fica com **!** se uma gravação **não foi salva** ou se a
gravação **parou sozinha** por um erro do Chrome (o que foi gravado até ali é salvo).

---

## Privacidade e segurança

Gravações de chamada têm voz e dados de terceiros. A extensão foi feita para que **nada saia do seu
computador**:

- **Sem rede:** a política de segurança da extensão (`content_security_policy` com `connect-src 'none'`)
  faz o próprio Chrome bloquear qualquer conexão das páginas da extensão. Não há servidor, conta,
  estatística ou atualização automática.
- **Sem acesso a sites:** a extensão **não** lê o conteúdo do WhatsApp, do Meet ou de qualquer página —
  não tem permissão de site nem script injetado. Ela só recebe o **som** da aba que você mandou gravar,
  e só depois do seu clique ou atalho (regra do próprio Chrome).
- **Onde o áudio fica:** na memória durante a gravação, numa cópia de segurança interna da extensão
  (apagada assim que o arquivo é salvo) e no arquivo final em Downloads. Se a sua pasta Downloads for
  sincronizada com a nuvem (OneDrive, Google Drive), os arquivos vão junto com ela.
- **Permissões pedidas, e por quê:**

  | Permissão | Para quê |
  |---|---|
  | `tabCapture` | capturar o som da aba que você mandou gravar |
  | `activeTab` | saber o endereço da aba clicada (para o nome do arquivo: WhatsApp, Meet...) — só na aba em que você clicou |
  | `offscreen` | um documento invisível onde a gravação acontece |
  | `downloads` | salvar o arquivo em Downloads |
  | `storage` | lembrar a última gravação e os avisos pendentes |

- **Sempre visível:** enquanto grava, o ícone da extensão mostra **REC** (ou **!**).

## Gravar conversas: cuidados legais

Este projeto não é aconselhamento jurídico. No Brasil, o STF entende que a gravação de uma conversa
**feita por um dos participantes** é lícita, mesmo sem o conhecimento do outro (Tema 237 de Repercussão
Geral). Ainda assim:

- as gravações contêm **dados pessoais** de terceiros: guarde-as com cuidado, use-as só para o que
  justificou a gravação e apague o que não for mais necessário (LGPD);
- **avisar o cliente** de que a chamada está sendo gravada é a boa prática;
- fora do Brasil as regras mudam (em alguns lugares todos os participantes precisam consentir).

---

## Limitações conhecidas

- **Gravação manual:** é preciso clicar (ou usar o atalho) a cada chamada. A gravação automática ao
  começar a chamada está nos próximos passos.
- **Mudo da chamada:** a extensão grava o microfone diretamente — se você ficar no mudo do WhatsApp/Meet
  para falar com alguém na sala, isso **também é gravado**.
- **Só abas do Chrome:** aplicativos instalados no Windows não são alcançados.
- **Saída de som:** o som da chamada é devolvido no dispositivo de saída **padrão** do Windows. Se a
  página da chamada estava usando outro (por exemplo, o Meet configurado para o fone e o Windows para a
  caixa de som), o som pode mudar de lugar ao começar a gravar.
- **Fone Bluetooth:** alguns entregam silêncio absoluto quando você não fala, o que pode disparar o
  aviso "microfone sem som" sem motivo.
- **Uma gravação por vez.**
- **Travamento:** até ~10 s finais podem se perder (veja [Gravações interrompidas](#gravações-interrompidas)).

## Solução de problemas

| Problema | O que fazer |
|---|---|
| "Falta autorizar o microfone" | a página de permissão abre sozinha: **Permitir microfone** → **Permitir**. Se você bloqueou antes: ícone à esquerda do endereço daquela página → Microfone → Permitir |
| Parei de ouvir a chamada ao gravar | clique em **Parar e salvar** (o som volta na hora) e confira o dispositivo de saída padrão do Windows |
| A barra **Cliente** não mexe | você está gravando a aba errada (veja [WhatsApp Web](#whatsapp-web) — janela separada) |
| A barra **Você** não mexe | microfone mudo ou outro dispositivo: veja [Qual microfone é gravado](#qual-microfone-é-gravado) |
| A voz do cliente aparece também no meu canal | sem fone, a caixa de som vaza para o microfone: use headset |
| "O Chrome não deixou capturar o som desta aba" | feche a janelinha e clique no ícone de novo, ou use o atalho com a aba da chamada em foco. **Não recarregue a página** — isso derruba a chamada |
| O atalho não faz nada | `chrome://extensions/shortcuts`: outra extensão pode estar usando a mesma combinação |
| "Carregar sem compactação" dá erro | escolha a pasta que tem o `manifest.json` dentro (`extensao\`, ou a cópia local) |
| Ícone com **!** e nada gravando | abra a janelinha: uma gravação não foi salva ou parou sozinha — ela está em "Gravações não salvas" |

---

## Para desenvolvedores

JavaScript puro em módulos ES, Manifest V3, **sem dependências e sem build**. O Node.js só é usado nos
testes e nas ferramentas.

```
extensao/            o que o Chrome carrega (nada aqui pode começar com "_")
  manifest.json      permissões, política de segurança, atalho
  service-worker.js  clique/atalho, captura, ícone, salvamento
  offscreen.*        onde a gravação acontece (captura, mixer, gravador)
  popup.*            a janelinha
  permissao.*        página do pedido do microfone
  lib/               regras: formato, nomes, estado, mixer, gravador, armazém, downloads, ícone, avisos
testes/
  unidade/           regras puras no Node
  audio/             áudio de verdade num Chrome sem cabeça, conferido com ffmpeg canal por canal
  tela/              a janelinha de verdade num Chrome sem cabeça
  guardas/           leem os arquivos: permissões, política de segurança, nada de rede, docs sem link morto
ferramentas/
  instalar.js        copia a extensão para a pasta local e confere
  smoke.js           conferência rápida (sintaxe, manifest, arquivos citados)
  gerar-icones.js    gera os PNG do ícone
docs/                como cada parte funciona, instalação e o histórico dos trabalhos
```

Comandos (na pasta do projeto; os testes de áudio e de tela precisam do Chrome e do
[ffmpeg](https://ffmpeg.org/) no PATH — sem eles, são pulados):

```
node --test "testes/**/*.test.js"
node ferramentas/smoke.js
node ferramentas/instalar.js
```

Documentação técnica: [docs/gravacao.md](docs/gravacao.md) (como tudo funciona, regras, armadilhas) e
[docs/operacao/instalacao.md](docs/operacao/instalacao.md). Histórico das decisões e das conferências:
[docs/trabalhos/](docs/trabalhos/).

## Próximos passos

- **Gravação automática:** clicar uma vez ao abrir o WhatsApp Web ou o Meet e, a partir daí, cada
  chamada daquela aba começar e parar de gravar sozinha.
- **Transcrição** com "Você:" e "Cliente:", aproveitando os canais separados.
- Nome do contato do WhatsApp no nome do arquivo.
- Acompanhar o mudo da chamada.

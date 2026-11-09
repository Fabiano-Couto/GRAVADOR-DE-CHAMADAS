# Gravação de chamadas — como funciona hoje

## Para que serve

O usuário atende clientes (análise de sistemas) por WhatsApp Web e Google Meet no Chrome e precisa
rever depois o que o cliente disse. A extensão grava a chamada da aba nos dois sentidos — a voz dele
(microfone) e a do cliente (som da aba) — e salva um arquivo M4A em
**Downloads > Gravacoes de Chamadas**. Funciona em qualquer aba com som (Teams web, Zoom web), não só
WhatsApp e Meet.

Etapa 1 (esta): início **manual** — clique no ícone ou atalho **Alt+Shift+G**. A etapa 2 (gravação
automática quando a chamada começa) só depois da validação desta; ver o plano na pasta do projeto.

## Como funciona

1. **Clique ou atalho** → o service worker ([service-worker.js](../extensao/service-worker.js)) recebe
   a aba. A invocação da extensão (clique no ícone, atalho) é o que o Chrome exige para capturar a aba.
2. Garante o **documento offscreen** ([offscreen.js](../extensao/offscreen.js)) e pergunta a situação.
   `decidirAlternar` (lib/estado.js) decide: iniciar, parar, recusar (outra aba gravando) ou aguardar
   (salvando).
3. Confere se o **microfone** está autorizado. Se não, abre [permissao.html](../extensao/permissao.html)
   numa aba e não captura nada.
4. `chrome.tabCapture.getMediaStreamId` → o identificador (serve uma vez, vence em segundos) vai
   direto para o offscreen.
5. O offscreen captura a aba e o microfone, monta o **mixer** (lib/mixer.js) e inicia o **gravador**
   (lib/gravador.js). Cada fatia (5 s) vai para a **memória** (de onde sai o arquivo final, sempre
   inteiro) e para o **armazém** (lib/armazem.js, IndexedDB — cópia de segurança para recuperar).
   Uma falha do armazém não estraga o arquivo final.
6. **Parar** (clique, atalho, ou a aba sendo fechada — inclusive durante o início) → o gravador espera
   a última fatia entrar no armazém e entrega o arquivo → o offscreen cria um endereço blob → o
   service worker anota "endereço → gravação" (lib/downloads.js, uma chave por download no
   `chrome.storage.session`) e salva com `chrome.downloads.download` (lib/nomes.js: nome e opções).
   Download concluído → a gravação é apagada do armazém. Download que falha → fica marcada `pendente`
   e aparece em "Gravações não salvas". O fim do salvamento **sempre** solta a máquina, mesmo com
   falha do armazém.

### Grafo de áudio (lib/mixer.js)

| De | Para | Por quê |
|---|---|---|
| microfone → mono | canal **esquerdo** | decisão do usuário (09/11/2026): esquerdo = você |
| aba → mono | canal **direito** | decisão do usuário: direito = cliente/participantes |
| aba | **alto-falante** (`ctx.destination`) | ao capturar a aba o Chrome tira o som dela do alto-falante; sem esta ligação o usuário para de ouvir o cliente |
| microfone | **nunca** o alto-falante | o usuário ouviria a própria voz |
| cada lado | medidor (AnalyserNode) | barras Você/Cliente na janelinha e aviso de microfone mudo |

### Situações (lib/estado.js)

parado → iniciando → gravando → salvando → parado. Uma gravação por vez. O segundo "Parar" é
recusado (um arquivo só). Durante "salvando" (segundos) não se começa outra.

### Formato (lib/formato.js)

`audio/mp4;codecs=mp4a.40.2` (M4A/AAC) a 96 kbps, estéreo, ~0,7 MB por minuto. O Chrome 156 grava
nativo; MP3 exigiria biblioteca. O MP4 do MediaRecorder é **fragmentado**: o primeiro pedaço traz o
cabeçalho e cada pedaço seguinte é um fragmento completo — por isso a soma dos pedaços, na ordem, é
um arquivo válido (inclusive a soma parcial, na recuperação).

### Nome do arquivo (lib/nomes.js)

`Gravacoes de Chamadas/AAAA-MM-DD_HHhMM_<origem>.m4a`, hora **local**. Origem: `WhatsApp`
(web.whatsapp.com), `Meet_<código>` (meet.google.com/abc-defg-hij), `Meet` (tela inicial), ou o
domínio sem www; endereço inválido ou interno vira `Aba`. Caracteres proibidos no Windows viram
hífen. `conflictAction: 'uniquify'` (nunca sobrescreve) e `saveAs: false` (nunca pergunta).

### Recuperação

Cada fatia vai para o IndexedDB assim que chega. Se o Chrome fechar, travar, ou a extensão for
recarregada no meio, a gravação fica com situação `gravando` no armazém. A janelinha lista as
gravações que sobraram (`gravacoesParaRecuperar`, lib/estado.js — sem a que está gravando e sem as
que estão sendo salvas agora) com **Salvar** e **Descartar** (descartar pede um segundo clique). Gravação interrompida é salva com `_recuperada` no nome
(`nomeParaRecuperar`); a que estava completa e só não chegou a ser salva fica com o nome original.
Perda máxima num travamento: **cerca de 10 s** — o Chrome entrega a 1ª fatia só com o cabeçalho do
MP4 e o primeiro áudio só na 2ª (medido em 09/11/2026: 667 bytes na 1ª fatia), e às vezes junta duas
fatias numa.

### Avisos durante a gravação (lib/silencio.js, lib/mensagens.js)

A gravação continua; o ícone vira `!` âmbar e a janelinha mostra o texto de cada aviso
(`alertas` no resumo do offscreen). Tempos em `AJUSTES` no offscreen.js (o teste encurta).

| Aviso | Quando | Por quê |
|---|---|---|
| `microfone-mudo` | silêncio **absoluto** (pico < 0,00001) no microfone por 10 s | microfone mudo no Windows, outro dispositivo. Pausa na conversa tem ruído de sala e não dispara |
| `aba-muda` | silêncio absoluto no canal da aba por 30 s | **no WhatsApp Web a chamada pode abrir numa janela separada**: o som do cliente toca lá e a aba capturada fica muda. A mensagem manda usar o atalho com a janela da chamada em foco. Janela maior que a do microfone porque o cliente calado ou chamada ainda não atendida também emudecem a aba (revisão de 09/11/2026; antes só o microfone era vigiado) |
| `sem-copia` | a cópia de segurança (IndexedDB) não abriu, não registrou ou falhou numa fatia | grava só na memória: salva ao parar, mas não recupera se o Chrome fechar no meio. Antes, IndexedDB com problema impedia gravar (revisão de 09/11/2026) |

### Avisos pendentes (aconteceram sem ninguém olhando)

Lista `pendentes` no `chrome.storage.session` (lib/pendentes.js): um aviso não apaga o outro. O ícone
fica com `!` enquanto a lista não estiver vazia; a janelinha mostra todos ao abrir.

| Código | Quando | Sai quando |
|---|---|---|
| `nao-salva` | download falhou; a gravação está no armazém ("Gravações não salvas") | não sobra nada por salvar (o offscreen avisa `limpar-pendente`) |
| `nao-salva-memoria` | download falhou e a cópia de segurança não funciona: a gravação está **só na memória** do offscreen, na lista até o Chrome fechar | idem |
| `nao-salva-perdida` | falhou e não havia arquivo nem cópia | a janelinha mostra (informativo) |
| `gravador-parou` | erro do MediaRecorder no meio | a janelinha mostra (informativo) |

**Quem decide o aviso é o offscreen**, que sabe onde a gravação ficou (`guardarNaoSalva`): no
armazém (já estava, ou é guardada nessa hora se o armazém voltou), na memória, ou em lugar nenhum. O
service worker só repassa. 2ª rodada de revisão (09/11/2026): antes, sem cópia de segurança e com o
download falhando, o blob era revogado e a gravação sumia — e o aviso dizia que ela estava na lista;
e o `!` de "não salva" nunca saía, nem depois de salvar.

### Erro do gravador no meio

`MediaRecorder` com erro (codificador) → o offscreen para, entrega o que foi gravado até ali e deixa o
aviso pendente `gravador-parou`. Antes, o REC seguia aceso e o arquivo saía truncado sem aviso.

### Ícone e janelinha

- Ícone (regra em lib/icone.js, testada): `REC` vermelho gravando; `!` âmbar gravando com aviso, ou
  parado com aviso pendente; `...` iniciando/salvando; `X` por 5 s quando o atalho é recusado (a dica
  do ícone diz o motivo).
- Janelinha ([popup.js](../extensao/popup.js)): situação, cronômetro, medidores (−60 dB a 0 dB),
  botão Gravar/Parar, gravações não salvas, última gravação ("mostrar" abre a pasta com o arquivo
  selecionado), atalho atual, "Abrir Downloads". Pergunta a situação **direto ao offscreen** a cada
  250 ms (sem offscreen, ninguém responde = parado) — sem o salto pelo service worker; ele ainda
  recebe a mensagem (toda `runtime.sendMessage` chega a todos os ouvintes) e devolve `false` na hora.
  Diz "Salvando..." ao parar e "Gravação salva: nome" só quando o download **termina** (o service
  worker grava `ultimas` nessa hora; a marca de espera é ligada **antes** de pedir, porque arquivo
  pequeno pode terminar antes da resposta). Download **nosso** interrompido (endereço blob da própria
  extensão) mostra o erro e recarrega a lista. Ao abrir, mostra e limpa o aviso pendente.
- Página do microfone: se já estiver aberta, é trazida para a frente (`runtime.getContexts`), em vez
  de abrir mais uma aba a cada clique.
- **Qual microfone é gravado:** a permissão do Chrome vale para a extensão usar qualquer microfone; o
  que entra na gravação é o **microfone padrão do Chrome** (o mesmo que o WhatsApp Web usa, salvo
  escolha dentro da página da chamada). Durante a gravação a janelinha mostra "Microfone: <nome>"
  (rótulo da trilha que abriu), para o usuário conferir se é o headset (pergunta dele na conferência
  local de 09/11/2026). Trocar: padrão do Chrome em `chrome://settings/content/microphone` ou padrão
  do Windows.
- Mensagens ao usuário: lib/mensagens.js (todo motivo usado no código tem texto — guarda).

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| [manifest.json](../extensao/manifest.json) | Manifest V3; permissões activeTab, tabCapture, offscreen, downloads, storage; atalho |
| [service-worker.js](../extensao/service-worker.js) | orquestra clique/atalho, captura, ícone, salvamento; não guarda situação |
| [offscreen.js](../extensao/offscreen.js) / offscreen.html | captura, mixer, gravador, armazém; dono da situação |
| [popup.js](../extensao/popup.js) / popup.html / popup.css | janelinha |
| [permissao.js](../extensao/permissao.js) / permissao.html | pedido do microfone (uma vez) |
| lib/formato.js | formato M4A/AAC 96 kbps |
| lib/nomes.js | origem, nome do arquivo, opções do download, nome na recuperação |
| lib/estado.js | máquina de estados, decisão do clique, lista de recuperáveis |
| lib/mixer.js | grafo de áudio (canais, alto-falante, medidores) |
| lib/gravador.js | MediaRecorder em fatias: memória (arquivo final) + armazém (cópia de segurança) |
| lib/armazem.js | IndexedDB: gravações e pedaços |
| lib/downloads.js | ligação "endereço em download → gravação", uma chave por download; `arquivoAceito` |
| lib/icone.js | aparência do ícone (selo, cor, dica) pela situação e pelo aviso pendente |
| lib/silencio.js | detector de silêncio absoluto (usado no microfone, 10 s, e na aba, 30 s) |
| lib/pendentes.js | lista de avisos pendentes do ícone (entrar sem repetir, resolver, tirar os informativos) |
| lib/mensagens.js | texto de cada motivo de recusa/erro |
| icones/ | PNG 16/48/128, gerados por [gerar-icones.js](../ferramentas/gerar-icones.js) |

## Regras (com o porquê e quem decidiu)

| Regra | Por quê | Quem / quando |
|---|---|---|
| Esquerdo = microfone, direito = aba | separar quem falou o quê; permite transcrição por lado | usuário, 09/11/2026 |
| Salvar em Downloads > Gravacoes de Chamadas, sem perguntar e sem sobrescrever | automático, nada se perde | usuário, 09/11/2026 |
| M4A/AAC | abre em qualquer player e no celular; nativo no Chrome | Claude, avisado no chat, 09/11/2026 |
| Nada sai do computador. **Barreira:** política de segurança do manifest — o Chrome bloqueia, nas páginas da extensão, `fetch`, XHR, WebSocket, EventSource, `sendBeacon` (`connect-src 'none'`), script de fora e `eval` (`script-src 'self'`). **Não governa** WebRTC (`RTCPeerConnection`), `chrome.tabs.create`/navegação com endereço de fora nem `chrome.downloads.download` de endereço remoto: para esses, só o **alarme** de texto (contra descuido; não segura código escrito para escapar dele) e, no download, `arquivoAceito` | voz e dado de cliente (LGPD); extensão de terceiros lendo o WhatsApp era o risco | plano aprovado, 09/11/2026; barreira pela revisão de segurança; alcance corrigido na 2ª rodada, 09/11/2026 |
| O service worker só baixa blob da própria extensão, para a pasta das gravações, nome simples `.m4a` (`arquivoAceito`, lib/downloads.js) | é a única linha em que valor vindo de mensagem vira arquivo no disco | revisão de segurança, 09/11/2026 |
| O Chrome carrega a extensão de `C:\Extensoes\Gravador de Chamadas` (fora do Drive), preenchida por [instalar.js](../ferramentas/instalar.js) | código com microfone liberado não pode ser o da pasta sincronizada | usuário, 09/11/2026 (revisão de segurança) |
| Mantém `C:\Extensoes` mesmo sabendo que outras contas locais do Windows podem escrever lá (alternativa: `%LOCALAPPDATA%`) | o computador é de uso dele | usuário, 09/11/2026 ("Manter C:\Extensoes") |
| Sem cópia de segurança e download falhando: a gravação é guardada no armazém nessa hora ou fica na memória (na lista até o Chrome fechar) | perder a gravação era o pior efeito | 2ª rodada de revisão, 09/11/2026 |
| Permissões mínimas e lista fechada | idem | plano aprovado; `activeTab` acrescentada na implementação para ler o endereço da aba (nome do arquivo) |
| Grava o microfone direto, mesmo com o usuário no mudo da chamada | etapa 1 não lê o mudo da página | comportamento conhecido, avisado no plano |

## Armadilhas

- **Aba capturada fica muda** para o usuário: o mixer devolve a aba ao alto-falante. Sem isso, ele
  para de ouvir o cliente.
- **Offscreen não mostra pedido de permissão**: a permissão do microfone é dada em permissao.html,
  aberta em aba (automática na instalação e quando faltar).
- **Service worker dorme** após 30 s: a situação mora no offscreen; a ligação downloads → gravação
  mora em `chrome.storage.session`, **uma chave por download** (um mapa único lido e regravado perdia
  entrada com dois salvamentos ao mesmo tempo).
- **IndexedDB ordena as transações**: uma leitura aberta depois de uma escrita espera por ela. Isso
  esconde a falta de espera pela fila de escritas quando o disco está rápido; o teste com armazém
  lento é o que pega.
- **Evento 'ended' da aba** tem de ser escutado logo depois da captura: a aba pode fechar durante o
  resto do início (microfone, armazém) e o evento se perde.
- **Chamada do WhatsApp Web em janela separada** (a confirmar na conferência local): o ícone da
  extensão não aparece numa janela sem barra de ferramentas; o **atalho** grava a aba ativa da janela
  em foco. Clicar o ícone na aba principal grava uma aba muda → aviso `aba-muda` em 30 s.
- **Saída de som** (suspeita da revisão, a confirmar no Meet): o som da aba é devolvido no
  dispositivo **padrão** do Windows, não necessariamente no que a página da chamada usava (o Meet
  deixa escolher; o Windows separa "padrão" de "comunicação"). Se o cliente pular do fone para a
  caixa ao começar a gravar, a voz dele entra no microfone. A extensão não sabe qual saída a página usa.
- **Fone Bluetooth / microfone com porta de ruído** (suspeita da revisão): pode entregar zeros
  digitais quando o usuário não fala → `microfone-mudo` falso depois de 10 s ouvindo o cliente.
  Conferir com o fone de verdade do usuário.
- **`tabs.query` com filtro de endereço** é ignorado sem a permissão `tabs` (devolve todas as abas):
  para achar páginas da própria extensão, usar `runtime.getContexts`.
- **O identificador da captura vence em segundos** e serve uma vez: é o primeiro a ser usado no
  offscreen.
- **Endereço blob** só vale enquanto o offscreen estiver aberto: o offscreen não é fechado.
- **Arquivo ou pasta com `_`** dentro de extensao/ impede o Chrome de carregar (por isso `docs/_modelos`
  fica fora de extensao/).
- **`activeTab`** é o que dá acesso ao endereço da aba (o `tabCapture` sozinho não dá).
- **Sem fone de ouvido**, a voz do cliente sai na caixa de som e entra no microfone: aparece também no
  canal esquerdo. O cancelamento de eco do Chrome está ligado, mas fone resolve de vez.
- **Empacotador de MP4 do Chrome**: a 1ª fatia traz só o cabeçalho (667 bytes, sem áudio); o primeiro
  áudio chega na 2ª fatia com o dobro do tempo; depois às vezes junta duas fatias numa (medido em
  09/11/2026 com fatias de 1 s: 667 B, 25,5 KB, 12,5 KB, 12,5 KB, —, 25 KB). Teste que espera tempo
  fixo por fatia fica instável com a máquina ocupada: esperar pela quantidade de pedaços.

## Receitas

- **Depurar:** chrome://extensions → Gravador de Chamadas → "Inspecionar visualizações": service
  worker e offscreen.html (aparece depois da primeira gravação).
- **Conferir um arquivo:** `ffprobe -v error -show_streams arquivo.m4a` (codec aac, 2 canais).
- **Recarregar depois de mudar código:** ↻ em chrome://extensions. Gravação em andamento é
  interrompida e aparece em "Gravações não salvas".
- **Regenerar ícones:** `node ferramentas/gerar-icones.js`.

## Testes que protegem

| Teste | O que prova |
|---|---|
| [nomes.test.js](../testes/unidade/nomes.test.js) | origem, nome, caracteres proibidos, não sobrescrever, `_recuperada` |
| [estado.test.js](../testes/unidade/estado.test.js) | máquina de estados, Parar duplo, outra aba, recuperáveis |
| [silencio.test.js](../testes/unidade/silencio.test.js) | aviso só com 10 s de silêncio absoluto; ruído de sala não dispara |
| [formato.test.js](../testes/unidade/formato.test.js) | M4A/AAC 96 kbps |
| [mensagens.test.js](../testes/unidade/mensagens.test.js) | textos ao usuário |
| [downloads.test.js](../testes/unidade/downloads.test.js) | dois salvamentos ao mesmo tempo não se atropelam |
| [audio.test.js](../testes/audio/audio.test.js) | Chrome real + ffmpeg: AAC estéreo; esquerdo só voz, direito só cliente; alto-falante toca o cliente e nunca a voz; medidores; armazém lento sem órfão; armazém falho não estraga o arquivo; recuperação |
| [offscreen.test.js](../testes/audio/offscreen.test.js) | o offscreen.js de verdade com o Chrome falso por fora: fluxo inteiro com os canais certos; microfone e aba fechados depois do Parar; endereço blob liberado; aba fechada no início, no último instante e no meio; microfone negado solta a aba; falha do armazém não prende em "salvando"; download recusado guarda pendente; conclusão de gravação desconhecida; avisos de microfone e aba mudos; gravação sem cópia de segurança; erro do gravador; recuperação que falha mantém `_recuperada`; Parar duplo |
| [icone.test.js](../testes/unidade/icone.test.js) | selo, cor e dica do ícone; aviso pendente persiste |
| [popup.test.js](../testes/tela/popup.test.js) | a janelinha de verdade em Chrome real (Chrome da extensão falso injetado antes dos scripts, sob a política do manifest): estilo **calculado** (barras escondidas parado), textos e botões em cada situação, nome do microfone, aviso, recusa como erro, "Gravação salva" mesmo com o download terminando antes da resposta, aviso pendente; confere que o CSS carregou (largura 320 px) para não ficar cego |
| (sem teste automático) | service-worker.js usa APIs que só existem na extensão carregada (tabCapture, downloads, offscreen, action): a lógica que dá para separar foi para lib/ (estado, nomes, downloads, icone, mensagens) e é testada; o resto é conferido na conferência local guiada |
| [guardas.test.js](../testes/guardas/guardas.test.js) | política de segurança exata no manifest; alarme de rede/código de fora em todo arquivo da extensão; permissões exatas; áudio fora do git; sem `_`; motivos com texto; docs sem caminho morto |
| [instalar.test.js](../testes/unidade/instalar.test.js) | instalador: cópia conferida (sem depender da ordem do disco), recusa apagar pasta alheia, recusa destino em pasta sincronizada (Drive, drives compartilhados, OneDrive, Dropbox, iCloud) e dentro de repositório git, pasta só com `desktop.ini` conta como vazia, sem pasta temporária sobrando |
| [pendentes.test.js](../testes/unidade/pendentes.test.js) | um aviso pendente não apaga o outro; informativos saem ao abrir; "não salva" só ao resolver |
| offscreen.test.js (política) | as páginas de teste rodam sob a mesma política do manifest: a gravação funciona e o Chrome bloqueia conexão de verdade |
| [smoke.js](../ferramentas/smoke.js) | sintaxe, manifest e arquivos citados; controle que tem de falhar |

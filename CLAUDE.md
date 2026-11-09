# Gravador de Chamadas

Extensão do Chrome (Manifest V3), de uso pessoal, que grava o áudio de chamadas do WhatsApp Web e do
Google Meet nos dois sentidos — microfone do usuário no canal esquerdo, som da aba (cliente ou
participantes) no direito — e salva em M4A na pasta Downloads. Stack: JavaScript puro em módulos ES,
**sem dependências e sem build**; Node 26 só para os testes.

O **estado de agora** (último pedido, em andamento, pendências) fica fora do repositório, na pasta
do projeto: `../ESTADO_DO_PROJETO.md`. Memória e planos também ficam lá, em `../.claude/`. (Este
arquivo pode ir para o GitHub: nada de segredo aqui.)

O **método** (ciclo do pedido, guiado, testes e sabotagem, smoke, conferência local, revisor e revisão
independente, segredos, git, publicação) é o da skill **code-guardian**, chamada pelo `CLAUDE.md` da
pasta DEV. Este arquivo só acrescenta o que é deste projeto.

## Fluxo de todo pedido

1. **Rotear** pelo quadro abaixo e **ler o documento do assunto** antes de abrir o código.
2. **Abrir o registro** `docs/trabalhos/AAAA-MM-DD-assunto.md` (modelo em `docs/_modelos/trabalho.md`),
   listar em `docs/trabalhos/README.md` e **carimbar o ESTADO** como "em andamento".
3. Trabalhar seguindo o ciclo da code-guardian.
4. **Pronto** só quando: documento do assunto atualizado no mesmo commit; registro fechado com os
   números; carimbo atualizado; suíte e smoke verdes; conferência no Chrome do usuário quando o
   comportamento mudou.

## Roteador

| Se o pedido é sobre… | Documento |
|---|---|
| gravação, canais, formato, nome do arquivo, salvamento, recuperação, janelinha, atalho, permissão do microfone | [docs/gravacao.md](docs/gravacao.md) |
| instalar, atualizar ou remover a extensão do Chrome | [docs/operacao/instalacao.md](docs/operacao/instalacao.md) |

## Mapa

- `extensao/` — **só** o que o Chrome carrega. Nenhum arquivo ou pasta aqui pode começar com `_`
  (o Chrome recusa carregar a extensão). Docs, testes e ferramentas ficam fora.
- `testes/unidade/` — regras puras (nomes, estados, silêncio), no Node.
- `testes/audio/` — áudio de verdade num Chrome sem cabeça, conferido com ffmpeg/ffprobe.
- `testes/guardas/` — leem os arquivos: permissões, nada de rede, nada de `_`, docs sem caminho morto.
- `testes/tela/` — a janelinha de verdade em Chrome sem cabeça, com o Chrome da extensão falso.
- `ferramentas/` — smoke e gerador dos ícones.

## Comandos (rodar dentro de `codigo\`)

- Versões: Node 26 (PATH), Chrome em `C:\Program Files\Google\Chrome\Application\chrome.exe` (ou
  variável `CHROME_PATH`), ffmpeg e ffprobe no PATH (WinGet).
- Testes (tudo): `node --test "testes/**/*.test.js"` (≈ 15 s; o teste de áudio abre um Chrome sem
  cabeça). Um assunto: `node --test testes/unidade/nomes.test.js`.
- Smoke: `node ferramentas/smoke.js` — `node --check` em todo `.js`, manifest lido, todo arquivo citado
  no manifest e nas páginas existe; controle que tem de falhar: um `.js` quebrado de propósito numa
  pasta temporária.
- Sintaxe de arquivo tocado: `node --check <arquivo>`.
- Ícones: `node ferramentas/gerar-icones.js` (regrava `extensao/icones/*.png`).
- Instalar/atualizar no Chrome do usuário: `node ferramentas/instalar.js` (copia para
  `C:\Extensoes\Gravador de Chamadas`, recusa código não commitado) → `chrome://extensions` →
  recarregar (↻). Depurar: "Inspecionar visualizações" → service worker / offscreen.html.

## Regras de ouro (não quebrar sem decisão do usuário)

- **Nada sai do computador.** A barreira é a política de segurança do manifest
  (`content_security_policy`, com `connect-src 'none'`): o Chrome bloqueia qualquer conexão das
  páginas da extensão. A guarda `testes/guardas/guardas.test.js` exige essa política exata e é um
  alarme de texto contra descuido (rede, código de fora) — não segura código escrito para escapar
  dela. Gravação tem voz e dado de cliente (LGPD).
- **O Chrome carrega a extensão de `C:\Extensoes\Gravador de Chamadas`**, nunca da pasta do Drive
  (decisão do usuário, 09/11/2026). Atualizar = `node ferramentas/instalar.js` + recarregar.
- **Permissões mínimas, lista fechada** no manifest (a guarda confere a lista exata). Permissão nova é
  decisão do usuário.
- **Canal esquerdo = microfone (você), direito = aba (cliente).** Decisão do usuário, 09/11/2026.
- **O som da aba volta para o alto-falante; o microfone nunca vai para o alto-falante.** Sem a
  primeira, o usuário para de ouvir o cliente; com a segunda, ouve a própria voz.
- **Nunca sobrescrever arquivo** em Downloads (conflictAction uniquify).
- **Gravações nunca entram no git** (`.gitignore`: m4a, webm, wav…).
- **Segredo nunca vai para a tela, chat, documento ou commit** (code-guardian, segredos). Este projeto
  não tem segredo nenhum — se aparecer um, algo está errado.
- **Mudança de regra vem com teste, sabotado uma vez.**

## Git e publicação

- Repositório só local por enquanto (`codigo\`, branch principal `main`). GitHub: ainda não existe;
  criar **privado** e enviar só com o OK do usuário.
- **Quem autoriza** enviar ao GitHub: o usuário.
- "Publicar" = recarregar a extensão no Chrome do usuário. Receita: [docs/operacao/instalacao.md](docs/operacao/instalacao.md).

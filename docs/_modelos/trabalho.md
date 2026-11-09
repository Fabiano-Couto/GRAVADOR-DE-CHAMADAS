# <AAAA-MM-DD> — <assunto>

> Modelo do registro de trabalho. Um arquivo por pedido, em `docs/trabalhos/AAAA-MM-DD-assunto.md`,
> com link na lista de `docs/trabalhos/README.md`. O registro é a **história** do pedido: enquanto está
> aberto, cresce; depois de concluído, fica congelado. Como o sistema funciona hoje vai para o
> documento do assunto em `docs/`.

**Situação:** <em andamento / pausado / concluído / no ar> · **Assunto:** [<documento>](../<documento>.md)
**Branch / commits:** `<branch>` · <hashes> · **Produção:** <sim, desde AAAA-MM-DD HH:MM / não>

## Pedido

_As palavras do usuário/cliente (citação curta) e o resultado que ele quer._

## Achados

_O que a investigação encontrou antes de mudar qualquer coisa: o defeito, a causa, os números._

## Decisões

| Decisão | Alternativa recusada | Por quê | Quem / quando |
|---|---|---|---|

## O que mudou

_Arquivos e o papel de cada mudança. Commits._

## Conferência

- Testes do assunto: <N passaram>. Suíte inteira: <antes → depois>.
- Smoke: <N/N>. Tipos/lint: <ok>. Build: <ok, id>.
- Sabotagens: **<N de N pegas>** (tabela abaixo).
- **Contra o plano aprovado:** cada item do plano, feito ou deixado para depois (com o porquê).
  Suíte verde não prova que o pedido foi atendido.

### Sabotagens

| Regra sabotada | Pegou? |
|---|---|

## Revisão independente

_Quem revisou (agente com o roteiro da code-guardian; quantos; foco de cada um), sem acesso às
conclusões do autor._
**Segredos:** <"sem vazamento de segredo" ou o que foi achado e feito>.

| Achado | Gravidade | Feito |
|---|---|---|

**O que o revisor deixou de lado** (e a decisão sobre cada linha):

| Item | Por que ele deixou de lado | Decisão |
|---|---|---|

## Conferência local (com o usuário)

_Dados de conferência gravados (só no banco local, valores falsos), onde ficou a cópia do antes, e a
restauração conferida no fim._

| Etapa | O que o usuário viu | Resultado |
|---|---|---|

## Publicação

_OK de quem autoriza, com as palavras dele._

| Etapa | Resultado |
|---|---|
| 1 — servidor, só leitura | |
| 2 — `main` e GitHub | |
| 3 — servidor | <socorro: commit anterior, cópia do build, dump> |
| 4 — conferência | |

**`main = GitHub = servidor = <commit>`**

## Pendências

_O que ficou para depois, de quem é a ação e onde está registrado no ESTADO._

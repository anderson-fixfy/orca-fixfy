# Instruções para agentes no `orca-fixfy`

Este é o fork do Orca de onde sai o build da Fixfy. A norma de código é a do upstream, no `AGENTS.md` importado abaixo,
que não se edita aqui: cada linha mudada nele vira conflito na sincronização. Este arquivo diz só o que o fork acrescenta.
O desenho que ele roteia está no `PLN-025-design.md` do workspace, em
`work/plans/PLN-025-orca-no-fluxo-de-trabalho-da-fixfy/`, itens D1, D3 e D4.

@AGENTS.md

## Onde vai cada mudança

| Mudança                                                              | Vai para                                                                                                             |
| :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| Código da Fixfy no renderer                                          | `src/renderer/src/components/native-chat/fixfy/`                                                                     |
| Código da Fixfy no processo principal                                | `src/main/ipc/fixfy-*.ts`                                                                                            |
| Ligar o código da Fixfy a um arquivo do Orca                         | Uma linha de montagem nesse arquivo, e o resto na pasta própria                                                      |
| O que serviria a um projeto fora da Fixfy — build, atualizador, tema | O `brz-anderson/orca-dev`, numa sessão aberta no clone dele, em `~/Projects/orca-dev`; chega aqui pela sincronização |

## A sincronização

A cadeia é `stablyai/orca` → `orca-dev` → `orca-fixfy`, por tag de release (D4). O `orca-dev` faz merge da tag; aqui
só entra o merge de `orca-dev/main`, num worktree, com PR. O remote `orca-dev` é local ao clone, e o comando que o cria
está no `README.md` do workspace, em "O `orca-fixfy` fica fora do clone padrão".

## O build

O build é o do D1: `pnpm run build:mac`, com `CSC_NAME="Apple Development: anderson@fixfy.com.br"` para assinar com o
hardened runtime; sem a variável, sai ad hoc. A primeira assinatura pede o Keychain e roda no terminal de Anderson.

## Os erros que um agente comete primeiro

- O `gh` acha o `stablyai/orca` como pai do fork: todo `gh pr` e `gh run` leva `--repo anderson-fixfy/orca-fixfy`,
  também onde o `AGENTS.md` diz `--repo stablyai/orca`.
- O PR tem base `master`, a branch padrão do fork, e não a `main` do upstream.
- Não faça merge do `stablyai/orca` direto aqui: ele passa pelo `orca-dev` (D4).

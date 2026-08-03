# Visão — registo de decisões

Notas de direção que não cabem nos ficheiros temáticos (01-DESIGN, 02-FRONTEND…)
mas que a equipa precisa de encontrar quando pergunta "porquê é que isto é
assim?".

---

## Direção visual da landing — escolhida e implementada

Em julho de 2026 puseram-se **oito propostas de hero** lado a lado, mais uma
página que as compara todas (`todos.html`). Ficou a **"Vanguard"**, que é a que
está em produção hoje.

As maquetes vivem em **`design/direcoes/`**: HTML estático, sem build, abrem-se
com duplo clique. Ficam como **referência histórica** — são a única memória do
que foi ponderado e recusado, e é barato mantê-las (não entram no bundle, não
são servidas, não têm dependências).

## Dívida paga: `/mockups` já não é público

Durante um tempo estas mesmas maquetes estavam **copiadas** para
`public/mockups/` (~4,4 MB) e, por isso, servidas em
`autoimport.arestadigital.pt/mockups/index.html`. Não era uma funcionalidade: a
Deployment Protection da Vercel tranca os previews, e essa era a forma mais
rápida de a equipa ver as propostas sem mexer nas definições da conta.

Estavam protegidas do indexador (`<meta name="robots" noindex>` em cada página +
`/mockups/` no disallow do `app/robots.ts`), mas eram **públicas para quem
soubesse o URL**.

**Removido.** `public/mockups/` foi apagado e a entrada saiu do `app/robots.ts`;
o `todos.html`, que só existia lá, passou para `design/direcoes/`.

⚠️ Se algum dia for preciso repetir isto, **não fazer `git revert` do commit
`fbbbe8e`** (o que introduziu as maquetes): a landing mudou muito desde então e
o revert desfaria trabalho bom junto. Copiar os ficheiros à mão.

**A lição, que vale para a próxima:** `public/` não tem autenticação nenhuma.
Tudo o que lá for parar é internet pública, `noindex` ou não. Para partilhar algo
só com a equipa, o sítio é um preview da Vercel com a proteção ligada — ou o
próprio repositório.

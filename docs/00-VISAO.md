
---

## ⚠️ Dívida técnica com data marcada

**Rota `/mockups` em produção — POR REMOVER.**

Em 28 jul 2026 publicámos maquetes de design em `public/mockups/` (~4,4 MB de
HTML, vídeos e imagens), acessíveis em `autoimport.arestadigital.pt/mockups/index.html`.
Não é uma funcionalidade: a Deployment Protection da Vercel tranca os previews e
era a única forma de a equipa ver as propostas sem mexer nas definições da conta.

Está protegida do indexador (`<meta name="robots" noindex>` nas 9 páginas +
`/mockups/` no disallow de `app/robots.ts`), mas **é pública para quem souber o
URL**.

A direção já foi escolhida (hero "Vanguard", implementado). Fica só enquanto for
útil ter as outras propostas à mão para consulta. Para remover:
`public/mockups/`, a entrada em `app/robots.ts`, e decidir se `design/direcoes/`
fica como referência histórica.

Introduzido no commit `fbbbe8e`. ⚠️ Não fazer `git revert` cego — a landing mudou
desde então e o revert desfaria trabalho bom junto.

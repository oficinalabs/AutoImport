# 📁 Estrutura do Projeto — AutoImport

Definição do projeto **AutoImport**, preenchida a partir do pack
[`oficinalabs/template-projeto`](https://github.com/oficinalabs/template-projeto).
Estes ficheiros são a fonte de verdade das decisões de produto, design e stack —
lê-os de cima a baixo **antes** de escrever código.

## Convenção
- 🔒 **Fixo** — é o standard; não mexer sem uma boa razão escrita.
- ✏️ **Preencher / Preenchido** — valor específico deste projeto.
- ☑️ **Escolher** — uma opção marcada com `[x]`; a recomendada vinha marcada e os desvios estão anotados no próprio ficheiro.

## Ficheiros

| # | Ficheiro | O quê |
|---|---|---|
| 00 | [GERAL](00-GERAL.md) | identidade, âmbito, stack fixa |
| 01 | [DESIGN](01-DESIGN.md) | cores, tipografia, movimento |
| 02 | [FRONTEND](02-FRONTEND.md) | interface e estado |
| 03 | [BACKEND](03-BACKEND.md) | API, auth, jobs |
| 04 | [BASE-DE-DADOS](04-BASE-DE-DADOS.md) | schema e dados |
| 05 | [INFRA-E-DEPLOY](05-INFRA-E-DEPLOY.md) | hosting, CI/CD |
| 06 | [SERVICOS-EXTERNOS](06-SERVICOS-EXTERNOS.md) | pagamentos, email, IA |

## Investigação de suporte
As decisões acima assentam nos relatórios em [`../research`](../research):
- [Países viáveis para importação (2026)](../research/paises-viaveis-importacao-2026.md) — Alemanha, França, Bélgica, Holanda (+ Espanha marginal).
- [Sites e agregadores por país](../research/sites-stands-por-pais-2026.md) — ~208 fontes de anúncios que alimentam a engine de dados.

## Desvios ao template (num relance)
- **i18n:** só PT no MVP (o template sugere next-intl). — [02](02-FRONTEND.md)
- **Jobs:** GitHub Actions para o batch diário da engine (o template sugere Inngest). — [03](03-BACKEND.md)
- **Multi-tenant:** ativado (stand = tenant). — [03](03-BACKEND.md)

## ⚠️ Bloqueador a resolver antes do build
Agregar/scrape das fontes de anúncios (mobile.de, AutoScout24, …) pode violar
os ToS e o direito de bases de dados da UE. Validar via feeds oficiais de
concessionário, parceria ou parecer legal **antes** de construir a engine.
Detalhe em [06 — Serviços Externos](06-SERVICOS-EXTERNOS.md).

---

Documento vivo — ajusta à medida que o projeto evolui.

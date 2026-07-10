# 📋 Projeto — Definição Geral

> **Como preencher este pack**
> - 🔒 **Fixo** — é o standard. Não mexer sem uma boa razão escrita.
> - ✏️ **Preencher** — valor específico deste projeto.
> - ☑️ **Escolher** — marca **uma** opção com `[x]`. A recomendada já vem marcada.
>
> Copia esta pasta para cada projeto novo e preenche de cima a baixo **antes** de escrever código.

## Índice
1. [Geral](00-GERAL.md) — este ficheiro
2. [Design](01-DESIGN.md) — cores, tipografia, movimento
3. [Frontend](02-FRONTEND.md) — interface e estado
4. [Backend](03-BACKEND.md) — API, auth, lógica
5. [Base de Dados](04-BASE-DE-DADOS.md) — dados e schema
6. [Infra & Deploy](05-INFRA-E-DEPLOY.md) — hosting, CI/CD
7. [Serviços Externos](06-SERVICOS-EXTERNOS.md) — pagamentos, email, IA

---

## Identidade
- ✏️ **Nome:** AutoImport
- ✏️ **Slug / repositório:** `oficinalabs/AutoImport`
- ✏️ **Uma frase (o que é):** Ferramenta B2B que mostra a stands automóveis portugueses que viaturas compensa importar da Europa, com o **custo final real já com impostos** (ISV, IUC, transporte, legalização) calculado e comparado com o preço em Portugal.
- ✏️ **Domínio:** `autoimport.pt` _(a registar/confirmar — ver [Infra](05-INFRA-E-DEPLOY.md))_
- ☑️ **Tipo de projeto:**
  - [ ] Site institucional / landing
  - [x] SaaS (subscrição)
  - [ ] Web app (sem cobrança)
  - [ ] API / serviço
  - [ ] Engine de dados (batch/cron) — _existe por baixo (ingestão diária), mas o produto é o SaaS_
- ☑️ **Estado:**
  - [x] Ideia / protótipo
  - [ ] MVP
  - [ ] Produção

## Âmbito
- ✏️ **Problema que resolve:** Importar carros para Portugal muitas vezes compensa, mas é difícil e trabalhoso. Os stands não têm forma rápida de comparar o **custo real** de uma viatura estrangeira (já com ISV/IUC/transporte/legalização) contra o preço a que a vendem/compram em Portugal — hoje fazem-no à mão, site a site, país a país.
- ✏️ **Público-alvo:** Stands automóveis em Portugal (pequenos e médios revendedores de usados), sobretudo os que já importam ou querem começar. Utilizador típico: dono do stand ou comprador/gestor de stock.
- ✏️ **Métrica de sucesso (uma):** Nº de stands pagantes ativos (≈ MRR). Meta de arranque: validar disposição a pagar ~100€/mês após o trial.
- ✏️ **Fora de âmbito (não fazer):**
  - Não vendemos, transportamos nem legalizamos carros — só damos a **inteligência de decisão**.
  - Não é B2C (não é para o consumidor final que quer um carro para si).
  - Sem financiamento/crédito nem intermediação de pagamento entre stand e vendedor estrangeiro.
  - MVP não cobre Reino Unido nem Leste Europeu como origens recomendadas (ver [relatório de viabilidade](../research/paises-viaveis-importacao-2026.md)).

## Standards fixos (valem para toda a stack)
- 🔒 **Linguagem:** TypeScript (modo strict). Python só em engines de dados. _→ a engine de ingestão/scraping é em Python._
- 🔒 **Framework:** Next.js (App Router).
- 🔒 **Gestor de pacotes:** pnpm.
- 🔒 **Lint & format:** Biome.
- 🔒 **Node:** versão LTS, fixada em `.nvmrc`.
- 🔒 **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:` …).
- 🔒 **Branching:** `main` protegida; trabalho em branch + Pull Request.
- ✏️ **Idiomas do produto:** PT (só português no MVP — os stands são portugueses; EN fica para depois).

## Stack fixa (num relance)
| Camada | Standard |
|---|---|
| Linguagem | TypeScript |
| Framework | Next.js (App Router) |
| Estilo / UI | Tailwind + shadcn/ui |
| Estado do servidor | TanStack Query |
| Formulários | React Hook Form + Zod |
| Base de dados | PostgreSQL |
| ORM | Drizzle |
| Autenticação | Better Auth |
| Email | Resend |
| Erros | Sentry |
| CI/CD | GitHub Actions |
| Deploy | Vercel |

> Isto é a **espinha dorsal**. As camadas opcionais e as escolhas por projeto estão nos ficheiros seguintes.
> **Peça específica deste projeto:** uma **engine de dados em Python** (ingestão diária de anúncios das fontes europeias + recálculo de ISV/custo final) que corre em GitHub Actions e escreve na mesma base de dados. Ver [Backend](03-BACKEND.md) e [Infra](05-INFRA-E-DEPLOY.md).

## Marca (resumo — detalhe em [Design](01-DESIGN.md))
- ✏️ **Tom numa palavra:** Rigoroso.
- ✏️ **Referências / inspiração:** mobile.de e AutoScout24 (densidade e filtros de dados automóvel); ImportRust e OParking (mercado PT de importação); estética de **terminal de dados/fintech** (Bloomberg-lite) para tabelas e comparações — profissional, não app de consumo.

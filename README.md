# AutoImport

Plataforma B2B para **stands automóveis** em Portugal encontrarem bons negócios de importação de viaturas do estrangeiro (sobretudo mercado europeu).

## Problema

Importar carros para Portugal muitas vezes compensa, mas é difícil e trabalhoso. Os stands não têm uma ferramenta que compare custo real, já com impostos.

## O que a plataforma faz

- **Histórico português** de preços para os vários modelos.
- **Preços no estrangeiro** de vários stands/fontes (foco Europa).
- **Comparação PT vs. estrangeiro**.
- **Taxas e impostos de importação** (ISV, IUC, etc.) incluídos para uma comparação **justa** do custo final.

## Modelo de negócio

- Subscrição **~100€/mês** por stand.
- **Primeiro mês grátis** para experimentar.
- Go-to-market: visita presencial a stands.

## Referências / Fontes a estudar

- **[ImportRust](https://www.importrust.com/)** — referência de serviço de importação de carros para PT (comparação de custos, impostos, benchmark de UX).
- **[mobile.de](https://www.mobile.de/)** — maior marketplace de automóveis da Alemanha; fonte de preços/stock do estrangeiro.
- **[AutoScout24](https://www.autoscout24.com/)** — marketplace pan-europeu; fonte de preços/stock do estrangeiro.
- **[OParking](https://www.oparking.pt/)** — plataforma portuguesa; referência de preços/mercado nacional (PT).

## Desenvolvimento

Next.js (App Router) + Drizzle + Postgres. **Dados reais de ponta a ponta**: os
coletores enchem um corpus local, o pipeline calcula os custos, e o publicador
leva a montra para a base que serve a app.

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # cost engine, normalizador, pipeline, queries
pnpm test:smoke     # a app compilada, a servir, com sessão real
```

⚠️ **São duas bases de dados** e o default é a local. Ler o
[`CLAUDE.md`](CLAUDE.md) antes de correr o que quer que seja contra a base — tem
a história de como isto já partiu a produção.

- **O que falta para o MVP:** [`MVP.md`](MVP.md) — auditoria com o estado item a item.
- **Estrutura e decisões:** [`docs/`](docs) — identidade, design, stack, infra.
- **Fronteira frontend/backend:** [`docs/07-FRONTEND-HANDOFF.md`](docs/07-FRONTEND-HANDOFF.md)
  — a UI lê tudo por [`lib/data.ts`](lib/data.ts); o contrato está em [`lib/types.ts`](lib/types.ts).
- **Design de referência:** [`design/`](design).
- **Investigação:** [`research/`](research) — países viáveis e fontes de anúncios.

## Estado

🚧 A caminho do MVP. O motor está pronto (custos, matching, pipeline, publicação);
falta ligar o **checkout** da Polar e automatizar a **recolha**. Detalhe em
[`MVP.md`](MVP.md).

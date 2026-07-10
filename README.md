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

Frontend em Next.js (App Router) já implementado, a correr sobre uma **camada de
dados mock**. Backend a ligar por cima (divisão de trabalho: frontend / backend).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

- **Estrutura e decisões:** [`docs/`](docs) (00–06) — identidade, design, stack.
- **Ligar o backend:** [`docs/07-FRONTEND-HANDOFF.md`](docs/07-FRONTEND-HANDOFF.md) — o
  único sítio a mexer é [`lib/data.ts`](lib/data.ts); o contrato está em [`lib/types.ts`](lib/types.ts).
- **Design de referência:** [`design/`](design).
- **Investigação:** [`research/`](research) — países viáveis e fontes de anúncios.

## Estado

🌱 Frontend implementado (mock). A ligar backend (auth, dados reais, email mascarado, Polar).

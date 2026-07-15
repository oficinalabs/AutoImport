# Páginas legais — investigação (jul/2026)

Material que deu origem às páginas em `app/(legal)/`. Produzido por 51 agentes que
leram os documentos legais de **45 sites/ângulos**: os marketplaces de que a engine
recolhe dados (AutoScout24, mobile.de, StandVirtual, OLX, La Centrale…), concorrentes
e adjacentes (Carvago, INDICATA, Autobiz, carVertical, AUTO1), SaaS de scraping
(Apify, Bright Data, Oxylabs), SaaS português (Moloni, InvoiceXpress, Vendus), o
Polar (o nosso Merchant of Record), referências de qualidade (Stripe, Linear, Vercel)
e o quadro legal PT/UE (CNPD, DL 7/2004, direito sui generis de bases de dados).

Nada aqui é texto copiado — os agentes tinham instrução expressa de extrair
**estrutura, temas e padrões**, e parafrasear.

| Ficheiro | O que é |
|---|---|
| [00-plano-de-entrega.md](00-plano-de-entrega.md) | **Começa por aqui.** Que páginas, que conteúdo, o que falta ao produto, e as decisões por tomar |
| [01-termos-estrutura.md](01-termos-estrutura.md) | Termos secção a secção, com o padrão de mercado em que cada uma se baseia |
| [02-privacidade-rgpd.md](02-privacidade-rgpd.md) | Privacidade com os artigos do RGPD que obrigam a cada secção |
| [03-faq.md](03-faq.md) | FAQ redigido, com as perguntas desconfortáveis marcadas |
| [04-risco-scraping.md](04-risco-scraping.md) | ⚠️ **O mais importante.** O risco legal da origem dos dados |
| [05-ux.md](05-ux.md) | Design e arquitetura de informação das páginas |

## O que isto mudou face ao que assumíamos

**A jurisprudência sobre scraping de anúncios automóveis é recente e desfavorável — e
é específica deste setor**, não é teoria geral:

- **La Centrale** — 100.000 € (França, 2025)
- **leboncoin / Entreparticuliers** — 70.000 €
- **Innoweb / AutoTrack** — TJUE: um meta-motor que pesquisa a base de outro é
  reutilização proibida, mesmo sem copiar os dados
- **CV-Online / Melons** — TJUE, 2021: o critério é o prejuízo ao investimento do
  titular da base

E, ao contrário do que se poderia esperar: **ser pago e B2B agrava a exposição, não
protege**.

Isto está desenvolvido em [04-risco-scraping.md](04-risco-scraping.md) e continua a
ser o bloqueador nº 1 do projeto — anterior às páginas legais, não resolúvel por elas.
Por isso o texto público é deliberadamente genérico ("fontes públicas e de mercado") e
**nunca nomeia as plataformas de origem nem descreve o método**.

## Antes de isto ir para o ar

As páginas mostram um aviso de rascunho enquanto `lib/legal.ts` tiver campos por
preencher. Ver a secção 4 do [plano](00-plano-de-entrega.md) para a lista completa do
que precisa de advogado — e a secção 5 para o que o **código** ainda não faz mas as
páginas prometem (apagar conta, cancelar self-service).

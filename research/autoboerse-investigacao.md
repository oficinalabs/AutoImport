# autoboerse.de — investigação técnica (spec do coletor)

> Como recolher dados do autoboerse.de (3º alvo, após theparking.eu e AutoTrader.nl). Data: 2026-07-11.
> Método: reconhecimento estático (`curl` + análise do `__NEXT_DATA__`).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Anti-bot **Imperva/Incapsula
  PASSIVO** (cookies `visid_incap`/`incap_ses`, sem challenge) → rápido; rate-limit + retry mitigam.
- **Fonte = `__NEXT_DATA__` (SSR).** App Next.js; embute `props.pageProps.classifieds.classifiedList[]`
  (riquíssimo) + `.total`, e ainda `props.pageProps.brands[]`/`provinces[]` (contagens) → seed do `--full`.
- **18 anúncios/página**, paginação `?page=N`. Rota de listagem: `/fahrzeugsuche`.
- **~263 mil anúncios DE.** Cobertura total → fatiar por **marca** (path `/fahrzeugsuche/{marca}`);
  a lista de marcas (com contagens) vem no `__NEXT_DATA__` — o `--full` descobre-a e percorre-a.
- **Recência REAL** (vantagem vs AutoTrader): ordenação por data (`?orderBy=date`, de facto o default)
  **e** cada anúncio traz `createdAt` (timestamp de criação).

## Acesso

- **Host canónico:** `autoboerse.de` **sem `www`** (o `www.` dá 308 → redirect). Usamos o canónico.
- **Anti-bot Imperva/Incapsula passivo:** 200 sem challenge com UA de browser; cookies de sessão
  guardados pelo `lib/http`. Risco de escalar sob volume → rate-limit + backoff (já no lib).
- **robots.txt tolerante:** `Allow: /`; bloqueia só `/fahrzeugvergleich`, `/gespeicherte-suchen`,
  `/merkzettel`, `/lieblingsautos`. A listagem (`/fahrzeugsuche`) é permitida — nunca tocamos os 4 paths.
- Só **DE** (domínio .de; rede de concessionários parceiros da Santander).

## Dados por anúncio (`__NEXT_DATA__.props.pageProps.classifieds.classifiedList[]`)

Página: `https://autoboerse.de/fahrzeugsuche?page=N`. `classifieds` traz `total` (263.477) e
`classifiedList[]` (18). Cada item (mapa → schema em `tools/collector/autoboerse/schema.mjs`):

| Campo item | → schema | Exemplo |
|---|---|---|
| `make.name` | make | NISSAN |
| `model.name` | model | Townstar |
| `version \|\| model.original` | variant | Townstar 1,3 DIG Kombi Tekna |
| `registration.year` | year / (com `.month`) first_registration | 2026 / 06/2026 |
| `mileage.amount` | km | 1225 |
| `fuel.name` / `transmission.name` | fuel / gearbox | Benzin / Schaltgetriebe |
| `engine.cc` | engine | 1332 |
| `engine.powerKw` / `.powerPs` | power_kw / power_ps | 96 / 130 |
| `color.name` | color | andere |
| `measures.bodyDoors` | doors | 5 |
| `body.name` | **category** (carroçaria) | Kleintransporter |
| `price.amount` / `.currency` | price / currency | 28950 / EUR |
| `'GERMANY'` (fixo) | country | GERMANY |
| `currentProvince.name` | region | Nordrhein-Westfalen |
| `showroomList[0].{city,postalCode}` | city / postalCode | Werl / 59457 |
| `dealer.name` | **source** / dealer | PRE-CAR Fahrzeugvertrieb … |
| `efficiency.wltp.co2EmissionsCombined` | co2 | 166 g/km |
| `huDate` | hu_date (TÜV) | 2029-06-01 |
| `previousOwner` / `accidents` | previous_owner / accidents | 1 / false |
| `createdAt` | listing_created_at (recência real) | 2026-07-11T13:48:21+00:00 |
| `imageList[]` (`.name`) | image (`img.autoboerse.de/`+name) + images (nº) | …jpg / 18 |
| `visibleId` / `id` | visibleId / id (UUID, dedupe) | WbEu3QlYwmmH / e5608caa-… |

- **URL de detalhe:** `/fahrzeugsuche/{slug}/{visibleId}` (slug SEO = `{marca}-{modelo}-{combustível}-{província}`).
  O objeto não traz o slug → lemos as âncoras exatas do HTML (mapa `visibleId→path`); fallback reconstrói o slug.
- **CDN de imagens:** `cdnURL` do runtimeConfig = `https://img.autoboerse.de/`; URL = base + `imageList[].name`.
- Campos naturalmente esparsos: `co2`/`hu_date` (nulos em elétricos / carros novos), `year` (nulo em alguns novos).

## Paginação, ordenação e cobertura

- **Paginação:** `?page=N` (confirmado; p1/p2 sem sobreposição).
- **Ordenação por recentes:** `?orderBy=date` (é o default — `orderByFromQuery` = `&orderBy=date`).
  E cada anúncio traz `createdAt` → recência fiável (o que faltava no AutoTrader). Sinal do watch resolvido.
- **Cobertura total:** fatiar por **marca** via path `/fahrzeugsuche/{marca}?page=N` (ex.
  `/fahrzeugsuche/volkswagen` → 40.292). Slugs + contagens vêm de `brands[]`. Marcas densas
  (VW/Mercedes/BMW/Audi, dezenas de milhar) podem saturar o cap de paginação → o próximo corte
  fino seria por modelo/preço (taxonomia path-based combinável: `/{marca-modelo}`, `/{regiao}`).

## Coletor (mesma lógica do theparking/autotrader)

- Batch: `tools/collector/run-autoboerse.mjs` (`--max-pages`, `--brand`, `--full`, `--resume`).
- Contínuo (1 min): `tools/collector/watch-autoboerse.mjs` (novos + mudanças de preço; `?orderBy=date`).
- Módulos: `autoboerse/{http,parse,schema,crawl,watch}.mjs` sobre `lib/{http,normalize,sink}.mjs`.
- Pronto exceto o envio para a DB (isolado em `lib/sink.mjs`).

**Verificado 2026-07-11:** amostra 3 páginas = 54 anúncios/8s, campos preenchidos (preço,
marca/modelo, ano, km, combustível, região, dealer, cidade/CP, potência kW, CO2, `listing_created_at`);
`--resume` estendeu para 5 páginas (88) sem duplicar; watch 2 ciclos (ciclo 2 só apanhou novos reais);
guarda robots bloqueia os 4 paths disallow; imagem do CDN carrega (200).

## Changelog

- **2026-07-11** — Investigação + coletor construído e verificado.

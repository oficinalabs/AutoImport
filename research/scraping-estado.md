# Estado do scraping das fontes de anúncios

> **Documento vivo — tracker do processo de scraping.** Registamos aqui o estado de recolha de cada fonte. Fonte de análise técnica: [`scraping-viabilidade-2026.md`](scraping-viabilidade-2026.md). Lista completa de sites: [`sites-stands-por-pais-2026.md`](sites-stands-por-pais-2026.md).
>
> **Âmbito atual:** trabalhamos nas 4 categorias abaixo. Sempre que um coletor for construído/testado, atualizar a coluna **Estado** e apontar o script na coluna **Coletor**.

## Legenda de estado

| Símbolo | Significado |
|---|---|
| 🔴 Por fazer | Identificado, ainda sem coletor |
| 🟡 Em progresso | Coletor em construção/teste |
| 🟢 A recolher | Coletor a funcionar e a extrair dados |
| ⏸️ Em espera | Bloqueado por decisão (ex. política robots/ToS) |
| ⚫ Fora de âmbito | Bloqueado tecnicamente; exigiria evasão de anti-bot |

**Schema-alvo de normalização** (para onde todos os coletores mapeiam): `make, model, variant, year, km, fuel, gearbox, power, price, currency, country, region, source, url`.

---

## 1. Alavanca nº1 — AutoScout24 (pan-europeu)

*O mesmo motor (`/lst` + `__NEXT_DATA__`/JSON-LD) cobre 5 países num único coletor, com filtro por país (`cy`). Maior alavancagem de cobertura.*

**⚠️ Decisão pendente:** o `robots.txt` da AutoScout24 desautoriza `/lst` e bloqueia por nome `ClaudeBot`/`GPTBot`/`CCBot`. Avançar é uma **decisão de política/ToS** — daí o estado ⏸️.

**Progresso:** 0/1 a recolher · a aguardar decisão.

| Instância | País | Método | Estado | Coletor | Notas |
|---|---|---|---|---|---|
| autoscout24.de | Alemanha | `__NEXT_DATA__` + JSON-LD | ⏸️ Em espera | — | ~1,2–2M anúncios; robots bloqueia `/lst` + ClaudeBot |
| autoscout24.fr | França | idem | ⏸️ Em espera | — | JSON-LD `Offer` confirmado |
| autoscout24.be | Bélgica | idem | ⏸️ Em espera | — | ~120k anúncios (nl/fr) |
| autoscout24.nl | Holanda | idem | ⏸️ Em espera | — | ~200k NL; AutoTrader.nl é o mesmo motor |
| autoscout24.es | Espanha | idem | ⏸️ Em espera | — | JSON-LD rico (`AutoDealer`, `Offer`) |

---

## 2. Ganhos fáceis limpos

*JSON-LD/SSR estruturado, sem anti-bot ativo, robots tolerante. Prioridade de arranque — reutilizar o padrão JSON-LD já validado no coletor do OParking.*

**Progresso:** 13/13 a recolher.

| Site | País | Método | Estado | Coletor | Notas |
|---|---|---|---|---|---|
| AutoTrader.nl | Holanda | `__NEXT_DATA__` SSR (20/página) | 🟢 A recolher | [`tools/collector/run-autotrader.mjs`](../tools/collector/run-autotrader.mjs) | ✅ Coletor batch + contínuo (1min). Stack Scout24 (molde p/ AutoScout24). ~233k NL, sem anti-bot, robots-clean. `--full` fatia por faixa de preço. Watch usa `sort=age` (proxy de recência — sem sort por data). Investigação: [`autotrader-investigacao.md`](autotrader-investigacao.md) |
| theparking.eu | BE + multi-país | JSON-LD `Vehicle` (27/página) | 🟢 A recolher | [`tools/collector/`](../tools/collector/) | ✅ Coletor batch (`run-theparking.mjs`) + **recolha contínua** (`watch-theparking.mjs`, poll 1min de recentes, deteta novos + preço alterado). HTTP puro, 20 campos, fonte por card, dedupe+resume. Pronto exceto envio p/ DB (isolado em `theparking/sink.mjs`). Investigação: [`theparking-investigacao.md`](theparking-investigacao.md) |
| autoboerse.de | Alemanha | `__NEXT_DATA__` SSR (18/página) | 🟢 A recolher | [`tools/collector/run-autoboerse.mjs`](../tools/collector/run-autoboerse.mjs) | ✅ Coletor batch + contínuo (1min). ~263k DE, Incapsula passivo, robots-clean. `--full` fatia por marca (`/fahrzeugsuche/{marca}`). **Recência REAL**: `?orderBy=date` (default) + `createdAt` por anúncio. Dados riquíssimos (potência kW/PS, CO2 WLTP, TÜV, dono/acidentes, dealer, cidade/CP). Investigação: [`autoboerse-investigacao.md`](autoboerse-investigacao.md) |
| Autocasión | Espanha | JSON-LD `Product`+`Car` (26/página) + card | 🟢 A recolher | [`tools/collector/run-autocasion.mjs`](../tools/collector/run-autocasion.mjs) | ✅ Coletor batch + contínuo (1min). ~122k ES (grupo Sumauto), Cloudflare passivo, robots-clean. Molde theparking (JSON-LD + card juntos por `identifier`); `fuel`/região/dealer do card. `--full` fatia por marca (SEO `/coches-segunda-mano/{marca}-ocasion`). Extras: `power_hp`, `dealer_rating`, `certified`, `condition`. Watch usa ordem default (proxy de recência — sem sort por data), loga `max(identifier)`. Investigação: [`autocasion-investigacao.md`](autocasion-investigacao.md) |
| OcasionPlus | Espanha | JSON-LD `ItemList`+`Vehicle` (20/página) + card | 🟢 A recolher | [`tools/collector/run-ocasionplus.mjs`](../tools/collector/run-ocasionplus.mjs) | ✅ Coletor batch + contínuo (1min). ~13,7k ES (stock próprio, ~120 centros), Next.js/CloudFront sem anti-bot, robots-clean. Molde autocasion (JSON-LD + card juntos por token do slug); região/centro e preços PVP/financiado do card. `--full` fatia por marca via path `/coches-segunda-mano/{marca}` (76 slugs de `/marcas`). ⚠️ filtros por query proibidos pelo robots → só path + `?page`. Extras: `center`, `power_hp`, `price_reference`, `price_finance`, `monthly`, `condition`. Watch usa ordem default (proxy de recência — sem sort por data). Investigação: [`ocasionplus-investigacao.md`](ocasionplus-investigacao.md) |
| Flexicar | Espanha | `__NEXT_DATA__` SSR (12/página) | 🟢 A recolher | [`tools/collector/run-flexicar.mjs`](../tools/collector/run-flexicar.mjs) | ✅ Coletor batch + contínuo (1min). ~22,5k ES (stock próprio, rede Flexicar), Next.js, **sem anti-bot**, robots-clean. Molde autoboerse (`initialVehicles`). ⚠️ SSR não pagina (12/URL); a API de paginação (`services.flexicar.es`) tem robots `Disallow: /` → não usada. Cobertura por **facetas** SEO; `--full` seeda ~9.684 facetas do `sitemap.xml`. Região/CP derivadas do concessionário; extras `power_kw`/`eco_sticker`/preços de campanha. Recência-proxy como o AutoTrader. Investigação: [`flexicar-investigacao.md`](flexicar-investigacao.md) |
| Aramisauto | França | `__NUXT__` SSR (Nuxt, 24/página) | 🟢 A recolher | [`tools/collector/run-aramisauto.mjs`](../tools/collector/run-aramisauto.mjs) | ✅ Coletor batch + contínuo (1min). ~2,9k FR (retalhista stock próprio), Cloudflare passivo, robots-clean (Crawl-delay 5s → rate 5s). Fonte = `displayedSearchVehicleResponse.vehicles` do estado Nuxt (avaliado em sandbox `node:vm`). Paginação `?page=N` sem teto (404 no fim). `--full` fatia por categoria (silos SEO `/achat/{cat}/`); sem path por marca → `--slice` por categoria/combustível. Watch usa ordem default (proxy de recência — sem sort por data), loga `max(vehicleId)`. Extras: `offer_type`, `power_ch`, `discount`, `monthly_loan`, `promotions`. Investigação: [`aramisauto-investigacao.md`](aramisauto-investigacao.md) |
| Trovit (coches/voiture/auto) | ES (+FR·IT extensível) | JSON-LD `Car` (25/página) + card | 🟢 A recolher | [`tools/collector/run-trovit.mjs`](../tools/collector/run-trovit.mjs) | ✅ Coletor batch + contínuo (1min). Agregador Lifull Connect, **sem anti-bot**, listagem `/coches/{slug}` robots-clean (UA de browser; grupo `*`). Molde theparking (JSON-LD `SearchResultsPage.about[]` + card juntos por `id`); `fuel`/`gearbox`/potência por regex, região/recência do card. Paginação no **path**; **sem página "todos"** → `--full` fatia por marca. **Recência REAL** (`?order_by=source_date` + "Hace Xh"). ⚠️ **origem escondida** atrás de `rd.clk.thribee.com` (robots `Disallow: /`) → `source`=null, dedupe por `id`. ⚠️ robots bloqueia bots nomeados (ClaudeBot) mas permite o grupo `*`. Investigação: [`trovit-investigacao.md`](trovit-investigacao.md) |
| MeinAuto.de | Alemanha | `__NUXT_DATA__` Nuxt 3 (devalue, 47/página) | 🟢 A recolher | [`tools/collector/run-meinauto.mjs`](../tools/collector/run-meinauto.mjs) | ✅ Coletor batch + contínuo (1min). ~9,1k usados DE (marketplace de stands; filtro `conditionCategories=PRE_OWNED` isola os Gebrauchtwagen do stock de novos/leasing). Anti-bot passivo (envoy/GCLB + Baqend), robots-clean. Molde aramisauto (Nuxt) mas Nuxt 3 → payload devalue em JSON puro re-hidratado (`unflatten`), sem `node:vm`. Paginação `?page=N` **sem teto** (query única cobre tudo); `--full` fatia por marca (`makes=`). **Recência REAL**: `sortBy=createdAt&order=desc` + `createdAt`. Dados ricos (power_kw, CO2, dono/acidentes, 1ª-matrícula, stand+CP). Investigação: [`meinauto-investigacao.md`](meinauto-investigacao.md) |
| Quoka.de | Alemanha | JSON-LD `Vehicle` (20/página) + card | 🟢 A recolher | [`tools/collector/run-quoka.mjs`](../tools/collector/run-quoka.mjs) | ✅ Coletor batch + contínuo (1min). Classificados **P2P** (Automarkt), Cloudflare passivo, robots-clean (`/anzeigen/…` permitido). Molde theparking, mas **card HTML = fonte principal** (JSON-LD dá a cilindrada); join por hash de 32c. `source='particular'` (card não nomeia vendedor); `make`/`model` do slug (`--full`/`--brand` = 100%) ou dicionário no título. `--full` fatia por marca (`/automarkt/{marca}/`, 87 slugs). **Recência REAL**: sort `date` + `listing_date` por anúncio. Extras: `article_id`, `city`, `price_old`, `images`, `premium`, `verified_phone`. Investigação: [`quoka-investigacao.md`](quoka-investigacao.md) |
| Ooyyo (BE) | Bélgica (agregador) | Card HTML server-rendered (15/página) via API `qselements` + SRP | 🟢 A recolher | [`tools/collector/run-ooyyo.mjs`](../tools/collector/run-ooyyo.mjs) | ✅ Coletor batch + contínuo (1min). **Agregador**, ~72k BE (`idCountry=23`), Cloudflare passivo, `Crawl-delay: 30` honrado (`--rate` default 30000). Seed via API interna `quicksearch/qselements` (devolve URL da SRP + `count` + marcas); paginação por link **"Next"**. `source`=site de origem do anúncio (autolive.be, autoline.be…) extraído do URL da imagem-proxy. `--full` fatia por marca (`idMake`). Descrição classificada por vocabulário (fuel/carroçaria/cor). Extras: `source_host`, `deal`, `save_percent`, `image_count`. Watch usa ordem default (proxy de recência — sem sort por data). Investigação: [`ooyyo-investigacao.md`](ooyyo-investigacao.md) |
| Autoline.pt / Via-Mobilis (BE) | Bélgica | Card HTML + JSON-LD `ItemList`+`Product` (25/página) | 🟢 A recolher | [`tools/collector/run-autoline.mjs`](../tools/collector/run-autoline.mjs) | ✅ Coletor batch + contínuo (1min). Marketplace Via Mobilis; secção BE, categoria CARROS (~590; ⚠️ quase todo LEILÃO + alguns ligeiros-comerciais). HTTP puro, sem anti-bot, robots-clean. Card é a fonte primária (JSON-LD vem vazio nalguns países, ex. GB); JSON-LD enriquece preço/condição/carroçaria. `--full` fatia por país (DE/BE/GB/FR/ES/CH). Recência REAL: `id`=timestamp de criação → `created_at` (robots proíbe `?sort=`). Extras: `is_auction`, `euro_norm`, `ref_code`, `power`, `condition`. Investigação: [`autoline-investigacao.md`](autoline-investigacao.md) |
| Autohero | Alemanha (grupo AUTO1) | API GraphQL interna (mesmo host, 100/pág) | 🟢 A recolher | [`tools/collector/run-autohero.mjs`](../tools/collector/run-autohero.mjs) | ✅ Coletor batch + contínuo (1min). ~7,4k DE (retalhista stock próprio), CloudFront passivo, robots-clean. SPA Apollo → SSR só traz ~30 e ignora `?page`; fonte = **API GraphQL `POST /v1/retail-customer-gateway/graphql`** (`searchAdV9AdsV2`, escalar JSON, sem auth). **Achado-chave:** a API está no MESMO host e o seu path NÃO é proibido pelo robots → permitida (contraste c/ Flexicar). Paginação `limit`/`offset` (≤100) c/ sort determinístico `newest_eligible` → cobertura completa em ~75 pedidos, sem facetas. **Recência REAL** (`firstPublishedAt`). Extras ricos (potência, CO2, donos/acidentes/danos, histórico de preço, sucursal). ⚠️ depende de query GraphQL extraída do bundle (mais frágil que SSR). Investigação: [`autohero-investigacao.md`](autohero-investigacao.md) |

---

## 3. Maior volume mas risco DataDome à escala

*Grande volume e dados ricos; passam num pedido isolado mas podem escalar para bloqueio DataDome/Akamai sob scraping intensivo. Testar com cautela (ritmo controlado, monitorizar 403) antes de comprometer volume.*

**Progresso:** 0/6 a recolher.

| Site | País | Método | Estado | Coletor | Notas |
|---|---|---|---|---|---|
| Marktplaats.nl | Holanda | JSON-LD `Vehicle` rico | 🔴 Por fazer | — | ~267k; maior volume NL; DataDome à escala |
| 2dehands.be | Bélgica | JSON-LD + attrs embebidos | 🔴 Por fazer | — | ~102k; maior volume BE |
| Wallapop | Espanha | `__NEXT_DATA__` | 🔴 Por fazer | — | 700k+; DataDome à escala |
| Coches.net | Espanha | sitemap + API interna | 🔴 Por fazer | — | ~251k (maior ES); cards via API (mais esforço) |
| Coches.com | Espanha | JSON-LD `Product`/`Offer` | 🔴 Por fazer | — | ~90k; Incapsula passivo |
| Kleinanzeigen.de | Alemanha | HTML cards `aditem` | 🔴 Por fazer | — | ~800k particulares; Akamai ativo (passou 1º pedido) |

---

## 4. Bloqueados (precisariam de evasão — fora de âmbito)

*Anti-bot ativo (DataDome/Akamai/Incapsula/Cloudflare-challenge). Aceder exigiria browser stealth + proxies residenciais = evasão → **não fazemos**. Registados para não os re-testar e para reavaliar via parceria/API oficial se o negócio justificar.*

| Site | País | Anti-bot | Estado | Notas |
|---|---|---|---|---|
| mobile.de | Alemanha | Akamai + DataDome | ⚫ Fora de âmbito | 403 na homepage; via correta = API oficial |
| Leboncoin | França | DataDome | ⚫ Fora de âmbito | robots proíbe scraping explicitamente |
| La Centrale | França | DataDome | ⚫ Fora de âmbito | 403 + `geo.captcha-delivery.com` |
| Le Parking | França | Cloudflare challenge | ⚫ Fora de âmbito | agregador; usar theparking.eu (irmão, passa) |
| Spoticar (.fr/.es) | FR·ES | Akamai | ⚫ Fora de âmbito | 403 na homepage |
| Zoomcar (FR) | França | Incapsula | ⚫ Fora de âmbito | — |
| Ouest-France Auto | França | Incapsula | ⚫ Fora de âmbito | mesma infra que Zoomcar |
| Qarson | França | Cloudflare | ⚫ Fora de âmbito | — |
| AutoUncle | Alemanha | Cloudflare challenge | ⚫ Fora de âmbito | meta-índice de mobile.de/AS24 — scrapar as fontes fáceis |
| Copart (.de/.es) | DE·ES | Incapsula | ⚫ Fora de âmbito | nicho salvage |
| Bid.Cars | Espanha | Cloudflare Turnstile | ⚫ Fora de âmbito | nicho salvage |
| Gocar.be | Bélgica | Cloudflare 403 | ⚫ Fora de âmbito | — |
| Gaspedaal.nl | Holanda | WAF DPG Media (Akamai) | ⚫ Fora de âmbito | cobertura obtém-se agregando AS24+Marktplaats |
| AutoTrack.nl | Holanda | WAF DPG Media | ⚫ Fora de âmbito | — |
| AutoWeek.nl | Holanda | WAF DPG Media | ⚫ Fora de âmbito | inventário = AutoTrack |
| AutoWereld.nl | Holanda | WAF DPG Media | ⚫ Fora de âmbito | ~277k |
| Bynco (NL) | Holanda | WAF DPG Media | ⚫ Fora de âmbito | retalhista único |
| Sites de marca .de (mercedes-benz.de…) | Alemanha | fingerprint TLS/HTTP2 | ⚫ Fora de âmbito | fragmentado por concessionário |
| Facebook Marketplace | ES·FR | 400 + robots proíbe | ⚫ Fora de âmbito | risco de ban de conta |

---

## 5. Portugal — mercado nacional (base de comparação de preço)

*O lado PT da comparação: para dizer "importar poupa X%" precisamos do preço nacional das mesmas
viaturas. Fontes portuguesas de anúncios — marketplaces, agregadores e redes de stands. Levantamento
por pesquisa profunda (2026-07-12, 75 factos verificados adversarialmente); volumes lidos ao vivo, a
confirmar por probe técnica no arranque de cada coletor. **Estado inicial: por investigar/fazer.***

**Progresso:** 7/16 a recolher (5a completa; 5b = 2/3 a recolher + 1 bloqueado; falta 5c/5d).

### 5a. Marketplaces primários (nacionais) — ✅ 5/5 a recolher

| Site | Tipo | Volume PT (aprox.) | Stands/Particulares | Notas técnicas (recolha) | Estado |
|---|---|---|---|---|---|
| [StandVirtual](https://www.standvirtual.com) → [`run-standvirtual.mjs`](../tools/collector/run-standvirtual.mjs) | Marketplace primário (líder PT) | ~42,3k carros | Ambos (stand/particular via `seller.__typename`) | ✅ **SSR `__NEXT_DATA__`→urqlState** `advertSearch.edges[].node` (32/pág). **HTTP puro passa** (DataDome **passivo**, sem proxies/stealth). **API GraphQL sob `/api/` robots-proibida → usamos o SSR** (`Allow: /`). **Sem cap de paginação** (a intuição do ~500 estava errada) → `--full` cobre os 42k direto; `--brand` por marca. **Recência REAL** (`created_at_first:desc` + `createdAt`). Imagens olxcdn | 🟢 A recolher |
| [OLX Portugal](https://www.olx.pt/carros-motos-e-barcos/carros/) | Marketplace primário | ~50,8k usados | Ambos (business/private via `isBusiness`) | ✅ **SSR `window.__PRERENDERED_STATE__`** `listing.ads[]` (52/pág; atributos no array `params[]`). **HTTP puro passa** (anti-bot passivo). ⚠️ **API `/api/v1/offers` robots-proibida (`Disallow: /api/`) → usamos o SSR humano**; guard bloqueia `/api/`. `--full` fatia por marca (path `/carros/{marca}/`, teto 100 págs). **Recência REAL** (`created_at:desc` + `createdTime`) | 🟢 A recolher |
| [CustoJusto](https://www.custojusto.pt/portugal/veiculos/carros-usados) → [`run-custojusto.mjs`](../tools/collector/run-custojusto.mjs) | Marketplace primário | ~26,4k | Ambos (`companyAd` → Profissional/Particular) | ✅ **Next.js SSR `__NEXT_DATA__`** `pageProps.listItems` (40/pág) + total `initialState…totalAds`. Cloudflare passivo, HTTP puro. ⚠️ **Paginação `?o=N` robots-proibida (`Disallow: /*?o=*`) → cobertura por facetas** path-based (marca×distrito, 1500; combos densos truncam a 40). make via taxonomia `carBrands`; km/power best-effort. **Recência REAL** (sort data + `listTime`) | 🟢 A recolher |
| [Auto.pt](https://www.auto.pt/carros-usados) → [`run-autopt.mjs`](../tools/collector/run-autopt.mjs) | Marketplace primário | ~16,2k carros usados | Ambos (`owner_type` por card) | ✅ **SSR Symfony** — molde quoka/autocasion: **card `car_listing_entry` + JSON-LD `Vehicle`/`ItemList` juntos por id** (alinhamento 20/20/20). Cloudflare passivo, robots-clean. `--full` fatia por marca via path (~132 slugs); `--make`/`--district`. ⚠️ filtros/sort por query dão 500 → só path + `?page`. gearbox/cor/segmento só no detalhe (null na listagem). Recência-proxy (ordem default) | 🟢 A recolher |
| [Auto SAPO](https://auto.sapo.pt) → [`run-autosapo.mjs`](../tools/collector/run-autosapo.mjs) | Marketplace primário (portal SAPO) | ~24,4k usados | Particulares + profissionais (detalhe-only) | ✅ **SSR ASP.NET Core** (a pista "SPA/API `auto-frontoffice`" era **falsa** — sem API JSON de pesquisa). Fonte = **cards HTML** de `/carros-usados?p=N` (20/pág); marca/modelo via sitemap de marcas. **Recência REAL via ObjectId** (timestamp embutido) + `orderby=1`. `--full` pagina até `p=1218` sem facetas. **`--detail`** (1 req/anúncio) enriquece caixa/cor/distrito/vendedor/`national` (PT vs importado). HTTP puro, robots-clean | 🟢 A recolher |

### 5b. Agregadores / meta-motores

| Site | Tipo | Volume PT (aprox.) | Stands/Particulares | Notas técnicas (recolha) | Estado |
|---|---|---|---|---|---|
| [AutoUncle.pt](https://www.autouncle.pt/pt/carros-usados) → [`run-autouncle.mjs`](../tools/collector/run-autouncle.mjs) | Agregador/meta-motor | ~99k (de ~9 fontes PT; "93 sites" é total global) | Ambos (`source`=site de origem) | ✅ **SSR** (Next.js App Router) junta **JSON-LD** (`ItemList` 25/pág + `numberOfItems`) + **payload RSC** (`__next_f`) pelo carId (molde theparking). Cloudflare passivo, **HTTP puro passa**. Paginação `?page=N` (teto ~100); ⚠️ **robots proíbe filtros por query `s[...]=`** → `--full` fatia por marca via **path** (config API robots-permitida); `/pt/link-externo/` só lido, nunca pedido. Extras: **AutoScore** (`price_rating`), preço-justo estimado, dias-em-stock. Recência por proxy (`days_on_market`). Densas (~14 marcas) saturam o teto. Investigação: [`autouncle-investigacao.md`](autouncle-investigacao.md) | 🟢 A recolher |
| [encontracarros.pt](https://www.encontracarros.pt) → [`run-encontracarros.mjs`](../tools/collector/run-encontracarros.mjs) | Agregador/meta-motor | ~50k alcançáveis (site anuncia 100k+/800 stands; "1,67M" é global) | Ambos (`source`=site de origem) | ✅ **Meta-motor PT** (compara standvirtual/olx/custojusto/auto.sapo/auto.pt + stands próprios), Next.js **sem anti-bot**, robots-clean (só `/link`). ⚠️ Listagem `/pesquisa` **client-side** → recolha via **`sitemap.xml`** (~50k recentes c/ `lastmod`) + detalhe SSR (1 req/anúncio; JSON-LD `Vehicle` + `carListing` RSC). **`source_url`** do anúncio original → dedupe cross-coletor. **Recência REAL** via `lastmod` (watch por watermark). Extras: `dealer`, `condition`, `national`, `seats`. Investigação: [`encontracarros-investigacao.md`](encontracarros-investigacao.md) | 🟢 A recolher |
| [OParking](https://www.oparking.pt) | Agregador/meta-motor | ~128k indexados PT | Ambos (indexa stands + part.) | ⚫ **BLOQUEADO** por Cloudflare *managed challenge* ativo (403 `cf-mitigated: challenge` em TODOS os pedidos, incl. `/robots.txt`; sem `cf_clearance` sem JS; não intermitente — probes 2026-07-13). A nota anterior "sem Cloudflare" estava **errada**. Mesmo motor que o theparking.eu (que **passa** a 200), mas política de CF por zona muito mais agressiva → HTTP puro não chega. **Caminho viável: fatia `portugal` do coletor theparking** (`/used-cars/portugal.html`, 200, `nb_results=128 281`, mesmo JSON-LD, fontes custojusto/standvirtual/olx). Investigação: [`oparking-investigacao.md`](oparking-investigacao.md) | ⚫ Fora de âmbito (usar theparking·PT) |

### 5c. Redes de stands (concessionários) com stock online

| Site | Tipo | Volume PT (aprox.) | Stands/Particulares | Notas técnicas (recolha) | Estado |
|---|---|---|---|---|---|
| [Santogal](https://www.santogal.pt) | Rede de stands (multimarca, >40 marcas) | ~3,8k viaturas | Só stands (certificado) | **SSR com paginação** (~40/pág × ~95 págs), **sem anti-bot → favorável**; maior rede PT | 🔴 Por fazer |
| [Carplus](https://www.carplus.pt) | Rede de stands (Grupo Salvador Caetano) | ~1,0k usados | Só stands (certificado, garantia até 3 anos) | Páginas de detalhe standard; imagens AWS CloudFront; financiamento Credibom; **sem API pública** | 🔴 Por fazer |
| [Caetano / Baviera](https://www.caetano.pt) | Rede de stands (Grupo Salvador Caetano) | n/d | Só stands | Página de pesquisa `/pesquisa/`; plataforma oficial de marca (usados/seminovos) | 🔴 Por fazer |

*Top-5 redes de stands PT (32% da quota): Santogal, Salvador Caetano, Auto-Industrial, Entreposto, Baviera — as restantes têm inventário fragmentado por concessionário.*

### 5d. Híbrido stands+particulares e leilões B2B (maioria login-gated / anti-bot)

| Site | Tipo | Volume PT (aprox.) | Stands/Particulares | Notas técnicas (recolha) | Estado |
|---|---|---|---|---|---|
| [PiscaPisca](https://www.piscapisca.pt) | Marketplace de stands (Credibom + APDCA, desde 2020) | >58k viaturas | **Misto** (orientado a stands, mas particulares anunciam grátis) | ⚠️ **Cloudflare ativo → HTTP 403** a clientes não-browser; app Android (`pt.credibom.piscapiscaapp`); paginação profunda (≥198 págs) | 🔴 Por fazer (risco anti-bot) |
| [VPAuto](https://www.vpauto.pt) | Leilão B2B (frota/empresa) | ~50k/ano | Só profissionais/frota | Inventário pesquisável por marca (ex. 570 Peugeot); + transporte integrado p/ PT | 🔴 Por fazer |
| [Manheim Portugal](https://www.manheim.pt) | Leilão B2B (Cox Automotive) | dinâmico (não legível estático) | Só profissionais | ⚫ **Login-gated**; SPA Angular; não scrapável sem credenciais de dealer | ⚫ Fora de âmbito |
| [Autorola.pt](https://www.autorola.pt) | Leilão B2B (remarketing) | lotes (5–130/leilão; ~7 ativos) | Profissionais/frotistas | ⚫ **Login** para ver listagens | ⚫ Fora de âmbito |
| [BCA Portugal](https://www.bca.com/pt-PT/) | Leilão B2B/remarketing (desde 1997) | milhares (dinâmico) | Só profissionais | 3 centros PT (Lisboa/Porto/Pombal); e-commerce de leilões segmentados (2×/sem); filtro país `salecountry_exact:PT` em `bca-europe.com` | ⚫ Fora de âmbito |

> **Notas de prioridade:** os alvos limpos e de arranque fácil são **CustoJusto** (SSR/`__NEXT_DATA__`),
> **Auto.pt** e **Santogal** (SSR sem anti-bot), e o **OParking** (já coberto pelo coletor theparking).
> **StandVirtual/OLX** são os de maior valor (líderes de volume) mas exigem lidar com SPA/API + anti-bot
> (perfil da secção 3). **PiscaPisca** tem Cloudflare ativo (403). Os leilões B2B (Manheim/Autorola/BCA)
> são login-gated → fora de âmbito para recolha aberta, registados para eventual via API/parceria.

---

## Como atualizar

- Ao construir/testar um coletor: mudar **Estado** (🔴→🟡→🟢), preencher **Coletor** com o caminho do script (ex. `tools/collector/theparking.mjs`), e atualizar o "Progresso: X/N" da secção.
- Novos bloqueios descobertos em runtime → mover o site para a secção 4 com a nota do anti-bot.
- Mudanças de acesso/estrutura de um site → nota na linha respetiva.

## Changelog

- **2026-07-13** — **Agregadores PT (secção 5b): AutoUncle.pt + encontracarros.pt 🟢 a recolher; OParking ⚫ bloqueado (7/16).** Três subagentes Opus 4.8 em paralelo. **AutoUncle.pt** (~99k): SSR Next.js junta JSON-LD (`ItemList` 25/pág) + payload RSC (`__next_f`) pelo carId (molde theparking); `source`=site de origem, extras AutoScore/preço-justo/dias-em-stock; Cloudflare passivo, HTTP puro; robots proíbe filtros por query `s[...]=` → `--full` por facetas de path (config API robots-permitida). **encontracarros.pt** (~50k): `/pesquisa` é client-side → recolha por `sitemap.xml` (lastmod) + detalhe SSR (JSON-LD `Vehicle` + `carListing` RSC), 1 req/anúncio; **`source_url`** do anúncio original → dedupe cross-coletor; recência REAL via `lastmod`. **OParking** ⚫: investigado e **NÃO construído** — Cloudflare *managed challenge* ativo (403 em todos os pedidos, incl. `/robots.txt`, não intermitente); corrige a nota "sem Cloudflare" (era da pesquisa, errada). O mesmo motor (theparking.eu) passa a 200 → política de CF por zona. **Caminho para o inventário PT do OParking: fatia `portugal` do coletor theparking** (`/used-cars/portugal.html`, `nb_results=128 281`). Os 2 funcionais verificados ponta-a-ponta + smoke-test central ao vivo (25/30 anúncios, `source`=origem real). Investigações: [`autouncle`](autouncle-investigacao.md) · [`encontracarros`](encontracarros-investigacao.md) · [`oparking`](oparking-investigacao.md).
- **2026-07-13** — **StandVirtual + OLX.pt + CustoJusto + Auto.pt + Auto SAPO 🟢 a recolher (5/16 — secção 5a PT completa).** Cinco coletores dos marketplaces primários portugueses, construídos em paralelo (um subagente Opus 4.8 por site, cada um a planear+implementar+verificar), reutilizando o `lib/` genérico. **Todos passaram com HTTP puro, sem evasão** — incl. os candidatos a bloqueio: **StandVirtual** (~42,3k; DataDome **passivo**; SSR `__NEXT_DATA__`→urqlState, API GraphQL `/api/` descartada por robots; **sem cap de paginação**) e **OLX.pt** (~50,8k; SSR `__PRERENDERED_STATE__`, API `/api/v1/offers` descartada por `Disallow: /api/`). **CustoJusto** (~26,4k; `__NEXT_DATA__`; paginação `?o=N` robots-proibida → facetas marca×distrito como o Flexicar). **Auto.pt** (~16,2k; SSR Symfony, card+JSON-LD juntos por id). **Auto SAPO** (~24,4k; SSR ASP.NET — a pista de SPA/API era falsa; recência via ObjectId). Todos distinguem stand/particular e têm recência (4/5 REAL, Auto.pt por proxy). Verificados ponta-a-ponta pelos subagentes + smoke-test central ao vivo (32/52/40/20/20 anúncios, campos-chave preenchidos). Padrão comum destas fontes PT: o SSR embute o estado (Next/urql/PRERENDERED_STATE/ASP.NET) e a **API interna está robots-proibida** → usa-se sempre o SSR permitido. Investigações: [`standvirtual`](standvirtual-investigacao.md) · [`olxpt`](olxpt-investigacao.md) · [`custojusto`](custojusto-investigacao.md) · [`autopt`](autopt-investigacao.md) · [`autosapo`](autosapo-investigacao.md).
- **2026-07-12** — **Nova secção 5: Portugal — mercado nacional (16 fontes).** Adicionada por pesquisa profunda (fan-out de buscas + fetch + verificação adversarial de 75 factos, só 4 refutados) para cobrir o **lado PT** da comparação de preço, até agora ausente do tracker. 5 marketplaces primários (StandVirtual ~42–50k, OLX ~50k, CustoJusto ~26–30k, Auto.pt ~16k, Auto SAPO), 3 agregadores (OParking ~128k — família theparking já coberta, AutoUncle.pt ~99k, encontracarros.pt), 3 redes de stands (Santogal ~3,8k, Carplus ~1k, Caetano/Baviera) e 5 híbrido/leilão B2B (PiscaPisca >58k, VPAuto, Manheim, Autorola, BCA). Correções da verificação face à intuição: **CustoJusto é SSR** (`__NEXT_DATA__`, recolha fácil — não SPA), **PiscaPisca é misto** stands+particulares e tem **Cloudflare 403**, o "93 sites" do AutoUncle é total global (~9 fontes PT). Arranque fácil: CustoJusto/Auto.pt/Santogal (SSR sem anti-bot) + OParking (coletor theparking existente). Todos 🔴 por investigar; leilões login-gated ⚫ fora de âmbito.
- **2026-07-11** — **Trovit + MeinAuto + Quoka + Ooyyo + Autoline + Autohero 🟢 a recolher (13/13 — secção 2 completa).** Seis coletores construídos em paralelo (um subagente Opus 4.8 por site, cada um a planear+implementar+verificar), reutilizando o `lib/` genérico. **Trovit** (ES, agregador Lifull): JSON-LD `SearchResultsPage.about[]` + card; recência real (`order_by=source_date`); ⚠️ origem escondida atrás de redirecionador robots-`Disallow` (`source`=null) e o robots bloqueia bots nomeados mas permite o grupo `*`. **MeinAuto** (DE, ~9,1k usados): Nuxt 3 `__NUXT_DATA__` devalue re-hidratado (sem `node:vm`); filtro `PRE_OWNED`; recência real; preço `float`→`Math.round`. **Quoka** (DE, P2P): card HTML primário + JSON-LD (cilindrada); `source='particular'`, marca via slug; recência real. **Ooyyo** (BE, agregador ~72k): seed via API interna `qselements` + SRP server-rendered, paginação por "Next"; `source`=site de origem via URL da imagem; `Crawl-delay: 30` honrado. **Autoline/Via-Mobilis** (BE): card primário + JSON-LD; `--full` por país; ⚠️ sobretudo comerciais/leilão — fatia de ligeiros BE (~590) quase toda de leilão; recência real via `id`-timestamp. **Autohero** (DE, AUTO1 ~7,4k): SPA Apollo → **API GraphQL interna no mesmo host** (robots-permitida, sem auth, query extraída do bundle), cobertura completa por `limit`/`offset`; recência real. Todos HTTP puro sem evasão, robots respeitado (incl. Crawl-delay). Verificados ponta-a-ponta pelos subagentes + smoke-test central ao vivo (23/47/21/15/25/100 anúncios). Investigações: [`trovit`](trovit-investigacao.md) · [`meinauto`](meinauto-investigacao.md) · [`quoka`](quoka-investigacao.md) · [`ooyyo`](ooyyo-investigacao.md) · [`autoline`](autoline-investigacao.md) · [`autohero`](autohero-investigacao.md).
- **2026-07-11** — **OcasionPlus + Flexicar + Aramisauto 🟢 a recolher (7/13).** Três coletores construídos em paralelo (um subagente Opus 4.8 por site, cada um a planear+implementar+verificar), mesma lógica dos anteriores, reutilizando o `lib/` genérico. **OcasionPlus** (ES, ~13,7k, stock próprio): molde autocasion (JSON-LD `ItemList`+`Vehicle` + card juntos por token do slug); `--full` por marca via path; filtros por query proibidos pelo robots. **Flexicar** (ES, ~22,5k, rede própria): molde autoboerse (`__NEXT_DATA__` SSR); achado-chave — o SSR não pagina e a API de paginação (`services.flexicar.es`) tem robots `Disallow: /` → cobertura via facet-slicing do `sitemap.xml` (~9.684 facetas). **Aramisauto** (FR, ~2,9k, stock próprio): molde autotrader mas app Nuxt → estado `__NUXT__` (IIFE) avaliado em sandbox `node:vm`; `--full` por categoria; Crawl-delay 5s honrado. Todos sem anti-bot ativo, robots-clean, recência-proxy como o AutoTrader. Verificados ponta-a-ponta com dados reais (batch/resume/fatia/watch) + smoke-test central ao vivo (20/12/24 anúncios). Investigações: [`ocasionplus-investigacao.md`](ocasionplus-investigacao.md), [`flexicar-investigacao.md`](flexicar-investigacao.md), [`aramisauto-investigacao.md`](aramisauto-investigacao.md).
- **2026-07-11** — **Autocasión 🟢 a recolher (4/13).** Coletor batch + contínuo (mesma lógica dos anteriores) via **molde theparking** (JSON-LD `Product`+`Car` + extras do card, juntos por `identifier`), reutilizando o `lib/` genérico. ~122k anúncios ES (grupo Sumauto), Cloudflare passivo, robots-clean. `fuel`/região/dealer vêm do card; extras `power_hp`/`dealer_rating`/`certified`/`condition`. `--full` fatia por marca (SEO `/coches-segunda-mano/{marca}-ocasion`, ~115 slugs). Recência-proxy como o AutoTrader (sem sort por data; watch loga `max(identifier)`). Verificado: amostra 76 anúncios/5s (fuel/região/dealer 76/76), `--resume` p/ 4 págs (101) sem duplicar, `--brand audi` = 50 só AUDI, watch 2 ciclos (26 novos → 0), guarda robots bloqueia os disallow. Investigação: [`autocasion-investigacao.md`](autocasion-investigacao.md).
- **2026-07-11** — **autoboerse.de 🟢 a recolher (3/13).** Coletor batch + contínuo (mesma lógica do theparking/autotrader) via `__NEXT_DATA__` SSR, reutilizando o `lib/` genérico. ~263k anúncios DE, Incapsula passivo, robots-clean. `--full` fatia por marca (`brands[]` → `/fahrzeugsuche/{marca}`). Vantagem: **recência real** (`?orderBy=date` default + `createdAt` por anúncio) → watch fiável. Verificado: amostra 54 anúncios/8s com campos ricos preenchidos, `--resume` p/ 5 págs (88) sem duplicar, watch 2 ciclos (só novos reais), guarda robots bloqueia os 4 paths disallow, imagem CDN 200. Investigação: [`autoboerse-investigacao.md`](autoboerse-investigacao.md).
- **2026-07-10** — **AutoTrader.nl 🟢 a recolher (2/13).** Coletor batch + contínuo (mesma lógica do theparking) sobre a stack Scout24, via `__NEXT_DATA__` SSR. Extraído código genérico para `tools/collector/lib/` (http, normalize, sink) — reutilizado por ambos; theparking refatorado e re-verificado. Verificado: amostra 56 anúncios/5s, watch dedup OK, resume OK, guarda robots bloqueia `/api/`.
- **2026-07-10** — **Recolha contínua theparking.eu.** Adicionado modo `watch` (poll de 1min à página de recentes) que deteta anúncios novos + mudanças de preço e emite eventos; estado persistido (`id→linha`). Tudo pronto exceto o upsert na DB, isolado em `theparking/sink.mjs`. Verificado: 3 ciclos, dedup contínuo OK.
- **2026-07-10** — **theparking.eu 🟢 a recolher.** Coletor construído (`tools/collector/`, HTTP puro sem deps) e verificado ponta-a-ponta: amostra Bélgica/BMW = 66 anúncios em 4s, 20 campos por registo (incl. país/região/CP e fonte original), dedupe+resume validados, multi-país OK. Traz stock de fontes que nos bloqueiam diretamente (gocar.be, marktplaats.nl, autowereld.nl). Secção 2: 1/13.
- **2026-07-10** — Doc inicial. Tracker das 4 categorias em foco; tudo 🔴/⏸️/⚫ (nenhum coletor estrangeiro construído ainda).

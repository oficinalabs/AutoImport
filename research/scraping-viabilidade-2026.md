# Viabilidade de scraping das fontes de anúncios (2026)

> Análise técnica de **quais dos 192 sites** de [`sites-stands-por-pais-2026.md`](sites-stands-por-pais-2026.md) são úteis e viáveis para **recolher dados de anúncios** (preço, marca, modelo, ano, km, combustível, localização) para a AutoImport comparar PT vs. estrangeiro.
>
> **Método:** 6 subagentes (5 países + transversais) sondaram tecnicamente cada site com `curl`/UA de browser — status HTTP, anti-bot (Cloudflare/DataDome/Akamai/Incapsula), dados estruturados (`ld+json` `Vehicle`/`Offer`, `__NEXT_DATA__`, `__NUXT__`), robots.txt e volume. Data: 2026-07-10.
>
> **Âmbito ético/técnico:** priorizamos sites acessíveis como cliente normal que **publicam dados estruturados** (JSON-LD/SSR — pensado para máquinas). Sites com anti-bot ativo (DataDome/Akamai/Incapsula) exigiriam browser stealth + proxies residenciais (evasão) — **fora de âmbito**. Leilões B2B fechados a login não são scrapáveis abertamente. Onde o robots.txt desautoriza, é assinalado como **decisão de política** a tomar.

---

## 1. Resumo executivo

- **~30 sites** têm dados de anúncios realmente scrapáveis; o resto são fóruns, serviços, verificadores VIN, gestorias, diretórios ou leilões B2B fechados.
- **Alavanca nº1 — AutoScout24 (pan-europeu):** o **mesmo motor** (`/lst` + `__NEXT_DATA__`/JSON-LD) cobre **DE, FR, BE, NL, ES** de uma vez, com filtro por país. Um único scraper resolve grande parte da cobertura estrangeira. ⚠️ **Mas** o robots.txt bloqueia `/lst` e explicitamente `ClaudeBot`/`GPTBot` → decisão de política antes de avançar.
- **Ganhos fáceis limpos (JSON-LD/SSR, sem anti-bot, robots tolerante):** Trovit, Autocasión, OcasionPlus, Flexicar, Aramisauto, AutoTrader.nl, theparking.eu, Ooyyo, autoboerse.de, Quoka.de, Autoline.pt, Autohero, MeinAuto.de.
- **Maior volume mas com risco DataDome à escala:** Marktplaats.nl, 2dehands.be, Wallapop, Coches.net.
- **Bloqueados (precisariam de evasão — não fazer):** mobile.de, Leboncoin, La Centrale, Le Parking, Spoticar, Copart, Bid.Cars, AutoUncle, Gocar.be, AutoWereld.nl, Gaspedaal/AutoTrack (WAF DPG Media), Zoomcar, Ouest-France Auto.
- **B2B fechados (registo profissional, não scraping):** AUTO1, BCA, OPENLANE, Autorola, CarNext, Ayvens, eCarsTrade, CarsOnTheWeb, Manheim, Autobid, AlphaAuktion, BVA, Autoveiling.
- **Sites obsoletos/falsos detetados** (corrigir o ficheiro-fonte): ver [§5](#5-correções-ao-ficheiro-fonte).

---

## 2. Shortlist priorizada (por onde começar)

Ranking por **valor de dados × facilidade × postura robots/ToS**:

| # | Alvo | País(es) | Método | Dados | robots/ToS | Dificuldade |
|---|---|---|---|---|---|---|
| 1 | **AutoScout24** (`/lst`) | DE·FR·BE·NL·ES (1 scraper) | `__NEXT_DATA__` + JSON-LD | preço, marca, modelo, ano, km, combustível, localização | ⚠️ **bloqueia /lst e ClaudeBot** | fácil técnico / decisão política |
| 2 | **theparking.eu** | BE (+ multi-país) | JSON-LD `Vehicle` (27/página, com CP) | completíssimo, incl. morada | Cloudflare passivo | **easy** |
| 3 | **Trovit** (autos/voiture/coches) | DE·FR·ES | JSON-LD `Car`+`Offer` | preço, specs (25/página) | ⚠️ robots bloqueia ClaudeBot (ES) | **easy** |
| 4 | **Marktplaats.nl** | NL | JSON-LD `Vehicle` rico | preço, km, ano, combustível (267k) | risco DataDome à escala | easy→medium |
| 5 | **AutoTrader.nl** | NL | JSON-LD (stack Scout24) | completo (~210k) | sem anti-bot | **easy** |
| 6 | **Autocasión** | ES | JSON-LD `Car`+`EngineSpecification` | completíssimo (~60k) | sem fricção | **easy** |
| 7 | **OcasionPlus / Flexicar** | ES | JSON-LD `Vehicle` (o mais rico) | completo | sem fricção | **easy** |
| 8 | **Aramisauto** | FR | JSON-LD `Car`/`Offer` | stock próprio limpo | robots permite (crawl-delay 5) | **easy** |
| 9 | **autoboerse.de / MeinAuto.de** | DE | `__NEXT_DATA__` / `__NUXT__` | preço, km (~264k / seminovos) | sem anti-bot | **easy** |
| 10 | **Ooyyo (BE)** | BE | JSON-LD `Car` | ~72k, agrega sites difíceis | Cloudflare passivo | **easy** |
| 11 | **Autoline.pt / Via-Mobilis** | BE (secções PT) | JSON-LD `ItemList`+`Product` | preço/marca/ano/km na listagem | sem anti-bot | **easy** |
| 12 | **Quoka.de** | DE | JSON-LD `Vehicle` (20/página) | completo | Cloudflare passivo | **easy** |
| 13 | **Autohero** | DE·FR·ES·… | JSON-LD `Vehicle` + sitemaps/país | stock próprio (~7,4k/DE) | sem anti-bot | **easy** |
| 14 | **2dehands.be** | BE | JSON-LD + attrs embebidos | maior volume BE (~102k) | risco DataDome à escala | easy→medium |
| 15 | **Coches.net** | ES | sitemap + API interna | maior volume ES (~251k) | cards via API (mais esforço) | medium |
| 16 | **viaBOVAG.nl** | NL | `__NEXT_DATA__` | dealers BOVAG (~100-130k) | sem anti-bot | easy-medium |

**Insight de cobertura:** #1 (AutoScout24 pan-EU) + #4/#5 (NL) + #6/#7 (ES) + #2/#3 (agregadores) cobrem a **maioria do stock dos 5 países** com pouca sobreposição. Muitos sites "difíceis" (Autolive.be, etc.) já aparecem **agregados** dentro de theparking.eu/Ooyyo/Trovit → scrapar o agregador evita o site-fonte protegido.

---

## 3. Padrões técnicos transversais

- **JSON-LD `schema.org/Vehicle`/`Car`/`Offer`:** o padrão dominante e mais robusto (imune a mudanças de CSS). Presente em AutoScout24, Trovit, theparking.eu, Ooyyo, Autocasión, OcasionPlus, Flexicar, Aramisauto, Quoka, Marktplaats, AutoTrader.nl, Autohero, Autoline.pt. **Gotcha recorrente:** alguns têm quebras de linha literais dentro das strings → sanitizar (`replace(/[\n\r\t]+/g,' ')`) antes do `JSON.parse` (já visto no OParking).
- **Estado SSR embebido (`__NEXT_DATA__` / `__NUXT__` / `window.__NUXT__`):** AutoScout24, autoboerse, MeinAuto, viaBOVAG, Carvago, Wallapop, 2dehands. Extrair o JSON do `<script>` — não precisa de browser.
- **AutoScout24 = infra partilhada:** `.de/.fr/.be/.nl/.es/.com` correm o mesmo motor; **AutoTrader.nl** e **AutoBild.de** são white-labels da AutoScout24 (dados redundantes — não scrapar em separado).
- **Anti-bot por fornecedor:** DataDome (mobile.de, Leboncoin, La Centrale, e à escala em Marktplaats/2dehands/Wallapop/Coches.net) · Akamai (mobile.de, Spoticar, Kleinanzeigen ativo mas passou 1º pedido) · Incapsula/Imperva (Copart, Zoomcar, Ouest-France, Coches.com passivo) · Cloudflare-challenge (AutoUncle, Le Parking, Gocar.be, Bid.Cars) · **WAF DPG Media (Akamai)** partilhado por Gaspedaal/AutoTrack/AutoWeek/AutoWereld/Bynco.
- **robots.txt anti-IA:** AutoScout24 (todas as filiais) e Trovit bloqueiam `ClaudeBot`/`GPTBot`/`CCBot` por nome → **decisão de política**: scrapar exige infra própria não-identificável como agente de IA e assumir a divergência do robots.

---

## 4. Tabelas por país (condensado)

### Alemanha
- **Scrapáveis:** AutoScout24.de (⚠️robots), Kleinanzeigen.de (Akamai, passou), Trovit Autos, Quoka.de, 12Gebrauchtwagen.de, autoboerse.de, MeinAuto.de, Carvago, Automarkt.de (espelho de mobile.de), Autohero.
- **Bloqueados:** mobile.de (Akamai/DataDome), AutoUncle (CF challenge), Copart (Incapsula), sites de marca .de (fingerprint TLS), Car-Exporter (521).
- **B2B-gated:** Autorola, Manheim, AlphaAuktion, Autobid.
- **Lixo/obsoleto:** Heycar.de (encerrado — "heycar sagt Tschüss"), **autos.com.de (SPA falsa gerada no Lovable.dev, sem stock real)**.

### França
- **Scrapáveis:** AutoScout24.fr, Aramisauto, Trovit Voiture; a investigar (API/HTML): Heycar.fr (API `api.fr.prod.group-mobility-trader.com/i15/search`), ParuVendu, Autosphere.
- **Bloqueados:** Leboncoin (DataDome + robots proíbe), La Centrale (DataDome), Le Parking (CF challenge), Spoticar (Akamai), Zoomcar & Ouest-France Auto (Incapsula), Qarson (CF), Autoreflex (503/DNS).
- **B2B/serviços/NONE:** Autorola, Starterre, mandatários (Auto-IES, Elite Auto…), Histovec, fóruns.
- **Gated (parceria, não scraping):** CarHunt (login/SaaS, 3M+ agregados — candidato a **API comercial/parceria**).

### Bélgica
- **Scrapáveis:** theparking.eu, AutoScout24.be, Ooyyo, 2dehands.be (risco DataDome), Europa Camiões/Via-Mobilis (627, duplicados), Autolive.be.
- **Bloqueados/duvidosos:** Gocar.be (CF 403), Moniteur/AutoGids (AJAX), Carnet.be (SPA vazia), Vroom/Youcar (endpoint por achar).
- **B2B-gated:** CarsOnTheWeb, eLeasingCar (403).
- **Obsoleto/morto:** **Autoccasion.be → virou site de casino ("StarCasino")**, A12 Auto (DNS morto), J'annonce.be (timeout).

### Holanda
- **Scrapáveis:** AutoScout24.nl (⚠️robots) & AutoTrader.nl (mesma stack), Marktplaats.nl (maior volume/dados ricos, risco DataDome), viaBOVAG.nl.
- **Bloqueados (WAF DPG Media):** Gaspedaal, AutoTrack, AutoWeek, AutoWereld, Bynco. Carvendo (SPA).
- **B2B-gated:** Autorola.nl, BVA Auctions, Autoveiling, Automotive Trade Center.
- **NONE:** AutoDNA (VIN), Autotelex (VMS), guias/mentores, serviços de exportação.
- **Nota:** ANWB/AutoWeek replicam inventário do AutoTrack → prioridade baixa.

### Espanha
- **Scrapáveis:** AutoScout24.es, Autocasión, OcasionPlus, Flexicar, Coches.com (Incapsula passivo), Wallapop (`__NEXT_DATA__`, risco DataDome), Trovit Coches (⚠️robots), Coches.net (~251k, cards via API), Clicars, Motor.es.
- **Bloqueados:** Copart.es & Bid.Cars (Incapsula/CF), Spoticar.es (Akamai).
- **B2B-gated:** Autorola.es, Spoticar Trade.
- **Morto/dúvida:** CarsBarter (DNS não resolve), Mitula (→ absorvido pelo Trovit).
- **NONE:** fóruns (Forocoches…), Empresite, gestorias.

### Transversais
- **Scrapáveis:** Autoline.pt (secção BE — JSON-LD `ItemList` limpo), Autohero.
- **Bloqueado:** mobile.de (Akamai, 403 na homepage), Facebook Marketplace (400 + robots proíbe + risco de ban).
- **B2B-gated:** AUTO1, BCA, Ayvens, CarNext, eCarsTrade, OPENLANE.
- **NONE:** serviços chave-na-mão (AutoGo, ImportHub, Importrust, Marlog, Easy Import), Europages, fóruns/guias PT.

---

## 5. Correções ao ficheiro-fonte

Sinalizados pelos agentes — atualizar [`sites-stands-por-pais-2026.md`](sites-stands-por-pais-2026.md):

| Site | Estado real (2026-07-10) |
|---|---|
| **Autoccasion.be** | Já **não é site de carros** — domínio redirecionado para casino online "StarCasino". Remover/assinalar obsoleto. |
| **autos.com.de** | SPA vazia gerada no **Lovable.dev**, sem inventário real apesar de alegar "1,5M veículos". Tratar como não-fiável/fake. |
| **Heycar.de** | **Encerrado** (confirma nota do ficheiro): título "heycar sagt Tschüss". |
| **Mitula Coches** | Absorvido pelo **Trovit** (redirect `mitula.es`→`coches.trovit.es`) — já não é site independente. |
| **A12 Auto (BE)** | Domínio **não resolve** (morto ou URL errado). |
| **CarsBarter (ES)** | DNS **não resolve** — confirmar se está inativo. |
| **Autoreflex (FR)** | **503**/DNS instável — site aparentemente fora do ar. |

---

## 6. Próximos passos recomendados

1. **Decisão de política** sobre robots.txt/ToS da AutoScout24 (bloqueia ClaudeBot/`/lst`). É a fonte de maior alavancagem (5 países num scraper) — decidir se avançamos com infra própria e a que ritmo, ou se começamos pelos alvos de robots tolerante.
2. **PoC do coletor** (reutilizar o padrão JSON-LD já validado no OParking) nos 3 alvos mais limpos e de maior valor: **theparking.eu** (BE + multi-país, morada/CP), **AutoTrader.nl** (NL), **Autocasión + OcasionPlus** (ES). Zero anti-bot, JSON-LD rico, robots tolerante.
3. **Normalização comum:** definir o schema-alvo único (make, model, variant, year, km, fuel, gearbox, power, price, currency, country, region, source, url) para onde todos os coletores mapeiam — essencial para comparar PT vs. estrangeiro.
4. **Camada de agregadores** (theparking.eu, Ooyyo, Trovit) para apanhar de graça o stock de sites-fonte protegidos, evitando scrapar cada um.
5. **Deixar de fora** (por agora) tudo o que precisa de evasão de anti-bot (mobile.de, Leboncoin, La Centrale, Gaspedaal…) e os B2B-gated — reavaliar via parceria/API oficial ou registo B2B se o negócio o justificar.

## Changelog

- **2026-07-10** — Doc inicial. Consolidação da sondagem de 6 subagentes sobre os 192 sites; shortlist priorizada, padrões técnicos, correções ao ficheiro-fonte.

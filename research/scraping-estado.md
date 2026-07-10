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

**Progresso:** 0/13 a recolher.

| Site | País | Método | Estado | Coletor | Notas |
|---|---|---|---|---|---|
| theparking.eu | BE + multi-país | JSON-LD `Vehicle` (27/página) | 🔴 Por fazer | — | O mais completo: inclui morada/CP; Cloudflare passivo |
| AutoTrader.nl | Holanda | JSON-LD (stack Scout24) | 🔴 Por fazer | — | ~210k; sem anti-bot |
| Autocasión | Espanha | JSON-LD `Car`+`EngineSpecification` | 🔴 Por fazer | — | ~60k; zero fricção |
| OcasionPlus | Espanha | JSON-LD `Vehicle` (o mais rico) | 🔴 Por fazer | — | ~20k stock próprio |
| Flexicar | Espanha | JSON-LD `Vehicle` | 🔴 Por fazer | — | rede de concessionários |
| Aramisauto | França | JSON-LD `Car`/`Offer` | 🔴 Por fazer | — | robots permite (crawl-delay 5) |
| Trovit (autos/voiture/coches) | DE·FR·ES | JSON-LD `Car`+`Offer` (25/página) | 🔴 Por fazer | — | ⚠️ robots bloqueia ClaudeBot; agrega vários portais |
| autoboerse.de | Alemanha | `__NEXT_DATA__` | 🔴 Por fazer | — | ~264k |
| MeinAuto.de | Alemanha | `__NUXT__` | 🔴 Por fazer | — | seminovos/leasing |
| Quoka.de | Alemanha | JSON-LD `Vehicle` (20/página) | 🔴 Por fazer | — | Cloudflare passivo |
| Ooyyo (BE) | Bélgica | JSON-LD `Car` | 🔴 Por fazer | — | ~72k; agrega sites difíceis (ex. Autolive.be) |
| Autoline.pt / Via-Mobilis (BE) | Bélgica | JSON-LD `ItemList`+`Product` | 🔴 Por fazer | — | dados na própria listagem; ~627 |
| Autohero | DE·FR·ES·… | JSON-LD `Vehicle` + sitemaps/país | 🔴 Por fazer | — | stock próprio (~7,4k/DE) |

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

## Como atualizar

- Ao construir/testar um coletor: mudar **Estado** (🔴→🟡→🟢), preencher **Coletor** com o caminho do script (ex. `tools/collector/theparking.mjs`), e atualizar o "Progresso: X/N" da secção.
- Novos bloqueios descobertos em runtime → mover o site para a secção 4 com a nota do anti-bot.
- Mudanças de acesso/estrutura de um site → nota na linha respetiva.

## Changelog

- **2026-07-10** — Doc inicial. Tracker das 4 categorias em foco; tudo 🔴/⏸️/⚫ (nenhum coletor estrangeiro construído ainda).

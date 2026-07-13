# oparking.pt — investigação técnica (spec do coletor)

> Avaliação do oparking.pt (agregador/meta-motor português da família **leparking / theparking-cars / ads4all.fr**, front PT) como alvo de recolha por HTTP puro, no molde do coletor `theparking`.
> Data: 2026-07-13. Método: reconhecimento estático (`curl` com UA de browser + cabeçalhos completos), comparação direta com o theparking.eu (mesmo motor).

## TL;DR — resultado: **BLOQUEADO (não recolhível por HTTP puro)**

- **Cloudflare "managed challenge" ATIVO.** Todos os pedidos ao oparking.pt devolvem **HTTP 403**
  com `cf-mitigated: challenge` e o corpo é a página *"Just a moment…" / "Enable JavaScript and
  cookies to continue"* (desafio JS). Testado em `/`, `/robots.txt`, `/carros-usados/portugal.html`,
  `/carros-usados.html` e `/sitemap.xml` — **403 em todos**.
- **Não é intermitente.** 5 tentativas seguidas à homepage → 403, 403, 403, 403, 403. Ao contrário
  do theparking.eu (rate-limit *intermitente* que passa com retry), aqui o bloqueio é **constante**.
- **Não há cookie de clearance sem JS.** O 403 **não** emite `Set-Cookie`/`cf_clearance` → não é
  possível "aquecer" a sessão e reutilizar cookies (warm-up); o desafio exige execução de JavaScript
  num browser real. HTTP/2 e HTTP/1.1 forçado → ambos 403. Cabeçalhos `sec-ch-ua`, `Sec-Fetch-*`,
  `Accept-Language: pt-PT`, UI-A completos → na mesma 403.
- **Conclusão:** o molde `theparking` (fetch/undici + UA de browser, "HTTP puro rápido") **não
  funciona** para o oparking.pt. Recolher exigiria um **browser headless** (Playwright/stealth a
  resolver o challenge) ou um cliente com **impersonação de fingerprint TLS/JA3** (curl-impersonate /
  curl_cffi) — o que quebra a arquitetura leve dos coletores existentes e não está no âmbito.
- **Por isso NÃO foi criado o coletor** `tools/collector/oparking/` (regra de ouro: "não inventes um
  coletor que não funciona"). Entrega-se este documento com as evidências.
- **✅ Alternativa já viável:** o **mesmo inventário PT** desta família está **acessível por HTTP
  puro (200)** através do coletor **theparking** já existente — `/used-cars/portugal.html` serve os
  anúncios PT em JSON-LD `Vehicle` (**nb_results = 128 281**, bate certo com o ~128k esperado). Ver §6.

---

## 1. Contexto e relação de família

- O oparking.pt é o **front português** da rede **leparking.fr / theparking.eu / dasparking.de**
  (ads4all.fr). Confirmado a partir do próprio HTML do theparking.eu, que referencia `oparking.pt`
  (mesma CSP `pro.oparking.pt` documentada na investigação do theparking). Ou seja: **mesmo motor,
  mesma estrutura de página** (JSON-LD `Vehicle` + cards com fonte-por-anúncio).
- A hipótese de partida ("é o mesmo motor → a estrutura de página é idêntica → basta adaptar o
  coletor theparking") **é provavelmente correta a nível de conteúdo**, mas é **irrelevante na
  prática**: a camada de acesso (Cloudflare) do oparking.pt está configurada em modo **muito mais
  agressivo** que a do theparking.eu, e nunca chegamos ao HTML dos anúncios.

## 2. Evidência de acesso (probes reais, 2026-07-13)

| Pedido | Resultado |
|---|---|
| `GET https://www.oparking.pt/` (UA browser) | **403** · `cf-mitigated: challenge` · corpo = *Just a moment…* |
| `GET https://www.oparking.pt/` (UA + `sec-ch-ua`, `Sec-Fetch-*`, `Accept-Language: pt-PT`, HTTP/2) | **403** |
| `GET https://www.oparking.pt/` (HTTP/1.1 forçado) | **403** |
| `GET https://oparking.pt/` (sem `www`) | **403** |
| `GET /robots.txt` | **403** (nem o robots é servido) |
| `GET /carros-usados/portugal.html` | **403** |
| `GET /carros-usados.html` | **403** |
| `GET /sitemap.xml` | **403** |
| Homepage × 5 (intervalo 3s) | **403 × 5** (não intermitente) |
| Reutilização de cookie jar do 1º pedido (warm-up) | **403** (nenhum `cf_clearance` foi emitido) |

Cabeçalhos-chave do 403 (constantes): `server: cloudflare`, `cf-mitigated: challenge`,
`cf-ray: …-LIS`, `content-type: text/html`, `content-length` ~5,6 KB, e a `content-security-policy`
típica da página de desafio (`script-src … https://challenges.cloudflare.com`, nonce por resposta).
O corpo carrega `/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1` — um **managed challenge**
que só resolve com JS a correr num browser real.

### Comparação com o theparking.eu (mesma família, mesmo dia/UA)

| Alvo | `/robots.txt` | Listagem |
|---|---|---|
| **theparking.eu** | **200** (579 B) | `/used-cars/belgium.html` → **200** (434 KB, 27 `Vehicle`) |
| **oparking.pt** | **403** (challenge) | `/carros-usados/portugal.html` → **403** (challenge) |

→ A diferença **não é o motor** (é o mesmo) — é a **política de Cloudflare por zona**: a zona
`www.oparking.pt` está em *managed challenge*; a `www.theparking.eu` em modo passivo.

## 3. robots.txt

**Não determinável** — o próprio `/robots.txt` devolve 403 (página de challenge, não o ficheiro).
Por analogia com o theparking.eu esperar-se-ia `Disallow: /tools/ /extlink/ /tag/`, mas **não é
possível confirmar** enquanto o acesso estiver bloqueado. (Um coletor futuro, se viesse a existir,
deveria replicar essa guarda `robotsDisallow` e reconfirmar o robots real assim que o acesso passe.)

## 4. Anti-bot

- **Cloudflare Managed Challenge (ativo, por zona).** Requer execução de JS + (potencialmente)
  fingerprint TLS/JA3 e sinais de browser. Um cliente HTTP simples (fetch/undici/curl) **não passa**,
  independentemente de UA/headers.
- Sem `Set-Cookie` de clearance no 403 → **sem caminho de warm-up** por cookies.
- Estratégias que *poderiam* funcionar (fora do âmbito e da arquitetura atual):
  1. **Browser headless** (Playwright + patches stealth) a resolver o challenge e a exportar o
     `cf_clearance` para pedidos subsequentes — pesado, frágil, lento (≠ "HTTP puro rápido").
  2. **Cliente com impersonação TLS** (curl-impersonate / curl_cffi / `tls-client`) — pode passar
     *challenges passivos*, mas um **managed challenge** costuma exigir JS na mesma.
  3. **Proxy residencial + resolvedor de challenge** — custo e complexidade elevados.
- Nenhuma destas encaixa nos coletores leves do repo (`lib/http.mjs` é fetch puro). Não implementado.

## 5. Modelo de dados (esperado, por analogia — NÃO verificado no oparking.pt)

Se o acesso passasse, o mapeamento seria **idêntico ao do theparking** (`schema.mjs`): 1 bloco
`<script type="application/ld+json">` `schema.org/Vehicle` por anúncio (com control chars literais a
sanitizar antes do `JSON.parse`) + a **fonte original** extraída do card, juntos pelo **ID do URL de
detalhe** (chave de dedupe). Campos: `make, model, variant, year, km, fuel, gearbox, engine, color,
doors, category, price, currency, country='PORTUGAL', region, postalCode, source (site de origem),
detail_url, image, collected_at`. Rotas PT esperadas: `/carros-usados/{path}.html` + paginação
`/{N}.html`; recência = página 1 (ordenação por data), como no theparking. **Tudo isto fica por
confirmar** enquanto o Cloudflare bloquear.

## 6. ✅ Caminho recomendado: fatia **Portugal** via coletor **theparking** (já existente)

O inventário que o oparking.pt agrega **é o mesmo** da rede leparking e **já está acessível por HTTP
puro (200)** através do theparking.eu. Evidência (probe real, 2026-07-13):

- `GET https://www.theparking.eu/used-cars/portugal.html` → **200**, 434 KB, **27 blocos JSON-LD
  `Vehicle`**, **`nb_results = 128 281`** (≈ o ~128k PT esperado para o oparking.pt).
- Distribuição de país nessa página (JSON-LD): **25/27 = PORTUGAL** (2 fronteiriços FRANCE).
- **Fontes reais por card** (sites de origem PT): `custojusto.pt`, `standvirtual.com`, `olx.pt`,
  `autohero.com`, … — exatamente o stock que o oparking.pt exporia.

→ **Recomendação:** para obter o inventário PT desta família, usar o coletor **theparking** com a
fatia `portugal` (o `run-theparking.mjs` já suporta `--country`, mas o mapa `PAISES` atual não inclui
`portugal`; bastaria acrescentar `portugal: 'portugal'` a esse mapa — **alteração ao theparking, não
feita aqui** por respeitar a regra de não tocar em coletores existentes; fica como sugestão ao dono
do repo). Recolha por HTTP puro, mesmo schema JSON-LD, `country='PORTUGAL'`, fonte por card.

## 7. Verificação (o que foi testado)

1. **Acesso oparking.pt:** 403 (managed challenge) em `/`, `/robots.txt`, `/carros-usados/portugal.html`,
   `/carros-usados.html`, `/sitemap.xml`; HTTP/2 e HTTP/1.1; com e sem `www`; 5× seguidas.
2. **Warm-up:** nenhum `cf_clearance` no 403 → reutilização de cookies → na mesma 403.
3. **Comparação theparking.eu:** 200 em robots e listagem (mesmo UA, mesmo dia).
4. **Alternativa PT:** theparking `/used-cars/portugal.html` → 200, 27 `Vehicle`, nb_results 128 281,
   25/27 PORTUGAL, fontes `custojusto.pt`/`standvirtual.com`/`olx.pt`/`autohero.com`.

## 8. Ficheiros

- **Coletor: NÃO criado** (bloqueio ativo — não se cria um coletor que devolve 403 em todos os
  pedidos). `tools/collector/oparking/` não existe.
- Esta investigação: `research/oparking-investigacao.md`.

## Próximo passo

- **Reavaliar periodicamente** o acesso ao oparking.pt (as políticas de Cloudflare por zona mudam);
  se algum dia passar a 200 com HTTP puro, o coletor é trivial (clone do `theparking` com baseUrl
  `https://www.oparking.pt`, rotas `/carros-usados/`, `country='PORTUGAL'`, pt-PT).
- **Entretanto**, cobrir o inventário PT desta família pela fatia `portugal` do coletor **theparking**
  (ver §6), e pelos coletores PT diretos já existentes das próprias fontes (`custojusto`, `standvirtual`,
  `olxpt`, `autohero`).

## Changelog

- **2026-07-13** — Investigação inicial. **Resultado: BLOQUEADO** por Cloudflare managed challenge
  (403 constante, sem clearance sem JS) — não recolhível por HTTP puro. Documentada a relação de
  família com o theparking.eu e a alternativa viável (fatia `portugal` do theparking, nb_results 128 281).

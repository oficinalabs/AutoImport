# 🔧 O derivado estava a engolir a geração

> **Estado: OPÇÃO A IMPLEMENTADA; B TESTADA E FALSIFICADA** (07/ago/2026). O
> diagnóstico abaixo mantém-se como registo. A opção A resolve as marcas de família
> numérica, não a classe do problema — mas já não há "correção certa a prazo" à
> espera: as três alternativas gerais candidatas foram testadas contra o catálogo
> real e **as três caíram** (ver as secções próprias). A allowlist é a melhor opção
> conhecida. Números medidos no armazém local (664 264 anúncios, 6 330 mids).
>
> **O que mudou:** `NUMERIC_CHASSIS_MAKES` em `lib/engine/us-catalog.ts` (hoje só
> `porsche`) + `series` tratado como filler do nome, ambos no `isNoiseToken`, que
> passou a receber contexto de marca/família. Efeito medido: **123 dos 6 330 mids**
> mudaram de derivado — Porsche 911 (28) e Boxster (3), e de lado
> **BMW série 3/5/7 (70)**, onde o sedan tinha derivado `"series"` em vez de `""`
> e portanto a família não tinha modelo BASE para o guard recolher.
> As gerações de `porsche|911` passaram de **29 abertas em 29** para **5 em 28** —
> a guarda de janela deixou de ser inerte na marca.
>
> Validado: golden de 273 casos com 0 violações, property test sobre 655 286
> anúncios, orçamento de exceções de mids intacto, e 4 testes de regressão novos
> (`tests/engine/match-version.test.ts`) + 4 ao `isNoiseToken`
> (`tests/engine/us-catalog.test.ts`) — incluindo o contra-exemplo que proíbe a
> regra genérica (`Defender 110`, `Land Cruiser 200`, `Alfa 1600`, `Lada 2107`).

## O sintoma

Um **Porsche 911 Carrera GTS** (992, 480 cv) fica casado, em tier `exato`, com a
versão **`911 Dakar 3.0 PDK`** — um todo-o-terreno de série limitada. Não é um
caso isolado nem um empate infeliz: acontece a **todos** os 992 de 480 cv, dos
dois lados da fronteira.

```
DE "992 (911) 4 GTS*PASM*ESG*PDLS*CHRONO*"  480cv 2022 → exato → 911 Dakar 3.0 PDK
DE "992 GTS Approved bis 05/2027"           480cv 2022 → exato → 911 Dakar 3.0 PDK
DE "992"                                    480cv 2022 → exato → 911 Dakar 3.0 PDK
PT "Carrera 4 GTS PDK"                      480cv 2022 → exato → 911 Dakar 3.0 PDK
PT "Carrera Cabrio GTS PDK"                 480cv 2024 → exato → 911 Dakar 3.0 PDK
PT "Carrera S"                              480cv 2026 → exato → 911 Dakar 3.0 PDK
```

A evidência gravada diz `hardSignals=2 candidatos=1 derivadoAmbiguo=false` — o
resolver acredita que só existe **um** candidato possível. Existem 16.

## A causa, em cadeia

**1. O `isNoiseToken` não conhece códigos de chassis puramente numéricos.**

`lib/engine/us-catalog.ts` filtra o ruído dos slugs dos mids antes de comparar
derivados. Apanha chassis **com letra** — `e210`, `g20`, `l663`, `8v` — mas não
apanha os da Porsche, que são só dígitos:

```
M10225 (Carrera GTS coupé)  slug = ["911","coupe","9921","series"]
M10633 (Carrera GTS cabrio) slug = ["911","cabriolet","9921","series"]
M10907 (Targa 4 GTS)        slug = ["911","targa","9921","series"]
M13765 (911 Dakar)          slug = ["911","dakar","992","series"]
```

**2. Por isso o código de geração entra no DERIVADO canónico.**

| mid | `midInfo.derivative` hoje | devia ser |
|---|---|---|
| M10225 | `coupe-9921-series` | `coupe` |
| M14162 | `coupe-9922` | `coupe` |
| M10633 | `cabriolet-9921-series` | `cabriolet` |
| M13765 | `dakar-992-series` | `dakar` |

Compare-se com o Defender, onde o mesmo mecanismo funciona bem porque `l663` tem
letra e é filtrado: `derivative = "90"` / `"110"` / `"130"` — limpo e correto.

**3. E o `992` do anúncio decide o derivado.**

O `derivativeGuard` calcula tokens distintivos por diferença de slugs. Fica com
`{coupe, 9921}` para o GTS e `{dakar, 992}` para o Dakar. O anúncio diz **"992"**
— o código de chassis que todo o vendedor de Porsche escreve. Então:

- `named = true` (o anúncio nomeia `992`);
- nenhum mid tem o conjunto distintivo **inteiro** no anúncio (ninguém escreve
  "dakar 992"), logo cai no critério largo `some`;
- só o Dakar bate, via `992` → **sobra um mid** → `distinctVersions = 1` → `exato`.

O anúncio não nomeou carroçaria nenhuma, e o resolver decidiu a carroçaria com
base num código de geração.

## Duas consequências que não se vêem no sintoma

**A guarda de janela de geração é inerte na Porsche.** As gerações são agrupadas
*dentro* da linha de derivado (`${fk}|${derivative||"base"}#i`). Se o derivado já
contém a geração, cada geração fica sozinha na sua linha → uma só `genKey` por
linha → o `clusterGenerations` nunca encontra uma geração seguinte que feche a
janela. Medido: as **29 gerações de `porsche|911` têm todas `yearEnd = null`**. A
guarda que existe precisamente para impedir que a mediana PT de um 992 seja
contaminada por um 991 não faz nada.

**O `excludeMidsForDerivative` trata gerações como derivados.** No
`compute-costs.ts`, um coupé 992.1 (`coupe-9921-series`) considera um coupé 992.2
(`coupe-9922`) um derivado **diferente** e exclui-o da amostra PT — quando é a
mesma carroçaria noutra geração, que é trabalho da janela, não do derivado.

Juntas, explicam a amostra PT suja do 911 que aparece em
`lib/engine/pt-market.ts` (`MAX_IQR_SPREAD`): n=29 misturando Carrera S (450 cv),
GTS (480), GT3 (510) e GT3 RS (525).

## Porque não há regra ao nível do token

A tentação é declarar "números puros são ruído". **Não são.** Medido no catálogo,
os tokens numéricos puros que são derivados a sério:

| família | tokens | o que são |
|---|---|---|
| `land-rover\|defender` | `90` `110` `130` | comprimento da carroçaria |
| `toyota\|land-cruiser` | `100` `120` `200` | série do modelo |
| `alfa-romeo\|giulia` | `1300` `1600` | cilindrada no nome |
| `vaz\|lada` | `1200` `2107` | nome do modelo |

E não há regra de número de dígitos que separe `9921` (geração) de `1600`
(modelo): ambos têm 4 dígitos. `110` (derivado) e `992` (geração) têm ambos 3.

**A regra tem de vir de contexto que o token não tem.** Alcance: 163 dos 6 330
mids (2,6 %) têm um numérico puro no derivado — mas parte desses 163 está
**correta** (Defender, Land Cruiser), o que é exatamente a prova de que o token
sozinho não decide.

## Opções

### A — Allowlist por marca (precedente existente)
Threading do `makeSlug` para a decisão de ruído: numa marca cujos nomes de
família são numéricos (Porsche: 356, 911, 912, 718, 924, 928, 944, 968), um token
numérico puro **diferente do slug da família** é chassis. Já existe precedente no
ficheiro — `CHASSIS_MAKES = new Set(["bmw", "mercedes"])`.

- **Prós:** cirúrgico e verificável; não pode tocar Defender/Land Cruiser/Alfa/Lada.
- **Contras:** é uma lista para manter; resolve a Porsche, não a classe do problema.

### B — Disjunção temporal (geral, sem allowlist)
Um token é **geração** se os mids que o contêm têm janelas de ano **disjuntas**
das dos mids com o token numérico irmão; é **derivado** se coexistem no tempo.
Semanticamente é o que distingue os dois conceitos: gerações sucedem-se,
derivados coexistem. Defender 90/110/130 coexistem em `l663`; 9921 (2018+) e 9922
(2023+) não.

- **Prós:** ataca a classe do problema, sem listas.
- **Contras:** camada de inferência nova no build, a calibrar sobre 6 330 mids;
  degrada em famílias com anos esparsos. É trabalho de desenho, não um patch.

### C — Não mexer no catálogo; endurecer só o `derivativeGuard`
Deixar o derivado como está e exigir que o critério largo `some` só decida quando
o token batido for de **carroçaria**; caso contrário → `derivadoAmbiguo`.

- **Prós:** mais contido; mata o `exato` errado (passa a `provavel`, que a montra
  não publica).
- **Contras:** não corrige as duas consequências acima — a janela de geração
  continua inerte na Porsche e o `excludeMids` continua a confundir geração com
  derivado.

## Recomendação

**A** para desbloquear já (é a que tem precedente e blast radius provável zero
fora da Porsche), com **B** registada como a correção certa quando houver tempo
para a calibrar. **C** sozinha não chega: trata o sintoma e deixa as duas causas.

## Como validar, seja qual for a opção

Nenhuma destas muda uma linha sem isto — são 192 671 anúncios ativos com versão
casada:

1. `tests/engine/match-version.test.ts` — golden de **273 casos** (5 Porsche:
   Boxster, Cayenne, Panamera ×2, 928; **nenhum 911** — acrescentar os casos
   acima), com precisão de `exato`/`designacao` exigida a 100 %.
2. `pnpm exec tsx scripts/eval/run-eval.ts --out scripts/eval/baselines/07-*.json`
   e comparar com `06-designacao.json`.
3. `match-models --rematch` (reescreve `us_version_id`/`match_confidence`).
4. `compute-costs --all` — o rematch dentro do tier `exato` **não** muda o
   `matchKind`, e um derivado novo só dispara recomputação no ramo `designacao`
   (ver a condição `recompute`), portanto as estimativas `exato` ficariam presas
   com a amostra velha.

## Decisão tomada

**A**, implementada e validada (ver o cabeçalho). Os casos 911 entraram como
testes de unidade sobre o catálogo sintético, não no golden: o golden é de
anúncios REAIS rotulados à mão e não se rotula a si próprio.

## Auditoria da lista por marca (07/ago, depois de A)

A pergunta óbvia: falta alguma marca no `NUMERIC_CHASSIS_MAKES`? Auditadas **todas**
as famílias de nome numérico com outros numéricos nos slugs. Ficam 8 com derivado
ainda "sujo", e a resposta é **não acrescentar nenhuma**:

| família | numéricos | o que são | anúncios |
|---|---|---|---|
| `volvo\|240` | 244, 245 | **designações** (244 sedan, 245 break) | 4 |
| `volvo\|850` | 855 | **designação** (855 break) | 13 |
| `lada\|1200` | 2101, 2102 | **designações** (VAZ-2101/2102) | 2 |
| `audi\|200` | 43, 44 | chassis (Typ 43/44) | 8 |
| `alfa-romeo\|2000` | 102 | chassis (Tipo 102) | 24 |
| `paige\|6`, `abbott\|6`, `abbott-detroit\|8` | — | pré-guerra | 0 |

Acrescentar `volvo` ou `vaz` **destruía** designações reais. E `alfa-romeo` é o caso
que fecha a discussão: na MESMA família convivem os dois tipos —

```
M8372  ["giulia","gt","1300","junior"]   ← 1300 é DESIGNAÇÃO
M8380  ["giulia","gt","1600","junior"]   ← 1600 é DESIGNAÇÃO
M8833  ["giulia","952"]                  ← 952 é CHASSIS
```

— logo nem uma regra por marca serve para a Alfa. Residual não corrigido: 32
anúncios ativos (Audi 200 e Alfa 2000, ambos clássicos) mais `giulia|952` e
`alfa-romeo|spider` (`type-916`/`type-939`, 371 anúncios).

**Segunda regra geral testada e também falsificada.** O chassis aparece por vezes
precedido de `type`/`tipo` no slug (`["200","type","44"]`, `["2000","tipo","102"]`),
o que sugeria uma regra estrutural sem listas. Mas `bugatti|type` tem `type 35` /
`type 49` / `type 57` e `volkswagen|type` tem `Type 1/2/3` — aí o número **é** o
modelo. Mesmo contraexemplo do `Defender 90/110`, noutra roupagem.

São **duas** regras gerais candidatas testadas contra o catálogo (contagem de
dígitos, marcador estrutural) e **duas** falsificadas com contraexemplos concretos.
Restava a opção B — ver a secção seguinte, onde também cai.

## Opção B (disjunção temporal) — FALSIFICADA (07/ago)

A hipótese: gerações **sucedem-se** no tempo, derivados **coexistem** — logo
compara-se a janela de anos dos mids que diferem por um token numérico. Testadas 9
formulações (estrita com tolerâncias 0/2/5, branda, cadeia de família, estrutural,
e conjunções) contra uma tabela de 50 verdictos rotulados em 16 famílias. A melhor
acerta **41 de 50**. Não é implementável, por três razões independentes:

**1. Prova de impossibilidade: 68 % das famílias não têm irmã com que comparar.**
Medido: 88 famílias têm um token numérico não-família; **60 delas têm só UM**
(128 mids, 872 anúncios ativos). A regra não tem input — e os verdictos exigidos
são **opostos com evidência estruturalmente idêntica**:

| família | token | ano | veredito exigido |
|---|---|---|---|
| `alfa-romeo\|2000` | 102 | 1958 | **chassis** (Tipo 102) |
| `volvo\|850` | 855 | 1996 | **designação** (855 break) |
| `honda\|civic` | 10 | 2017–20 | **chassis** (10.ª geração) |
| `buick\|electra` | 225 | 1958–78 | **designação** (Electra 225) |

Qualquer default erra metade. Só isto fecha a opção B como está formulada.

**2. Falsificada nos DOIS sentidos, onde há irmã.**
*Sobrepõem-se mas SÃO chassis:* `porsche|911` 991 [2012‑16] ∩ 9912 [2015‑18] = 2
anos; 993 ∩ 996 = 2; `porsche|boxster` 986 ∩ 987 = 1. As gerações Porsche não se
sucedem no dado — o ultimatespecs dá um ano por versão e a 991.1 vendeu‑se ao lado
da 991.2.
*São disjuntas mas SÃO designações:* `alfa-romeo|giulia` 1300 [1966‑68] vs 1600
[1972]; `bugatti|type` 35/46/49/57; `cadillac|series` 70 vs 62; e — descoberto pela
medição, não estava previsto — **`bmw|serie-3` pré‑guerra 303/309/315/319/320/321/
326/327/329/335**, onze modelos distintos com janelas de um ano cada, numa família
com ~1 800 anúncios ativos.

**3. A tolerância que "funciona" tem uma banda de 2 valores.** Só `tol ∈ {2,3}`:
com `tol ≤ 1` o `porsche|911` volta a ser classificado designação (a falha original
regressa); com `tol ≥ 4` o `toyota|land-cruiser` 90/100/120/200 passa a chassis.
Calibrada em 8 famílias — é overfitting, não uma regra.

**A raiz:** o dado de ano é esparso e sujo exactamente nas famílias que decidem.
Dos 261 mids com token numérico, 36 % têm ≤1 versão datada e 38 % têm janela de um
ano. O Giulia GT 1300 Junior e o GT 1600 Junior **coexistiram** (1972‑75), mas o
catálogo tem uma versão datada de cada (1966 e 1972) — a coexistência é invisível.

Se implementada (a melhor variante), mudaria 144 mids em 37 famílias e tocaria 331
anúncios: ganhava `honda|civic` "10" (118 anúncios) e `alfa-romeo|spider` 916/939
(58), e em troca fundia o Giulia GT 1300 com o GT 1600, apagava o Electra 225 (60
mids) e colapsava os onze BMW pré‑guerra na linha base.

**Conclusão: são três regras gerais testadas e três falsificadas** (contagem de
dígitos, marcador `type`/`tipo`, disjunção temporal). A allowlist
`NUMERIC_CHASSIS_MAKES` continua a ser a melhor opção conhecida, e o residual fica
como está. Quem voltar a este problema poupa três tentativas.

### Achado colateral: `us_models.model_year` com cilindradas

Medido ao investigar B: **13 mids** têm `model_year` fora de [1880, 2100], e em 8
deles o valor é a **cilindrada** — `6C-1750` → 1750, `6C-2500` → 2500, `Lada-1200`
→ 1200, `Lada-2107` → 2107, `OT-1000` → 1000. Consequência real: a geração
`alfa-romeo|6c 1750#0` fica com `yearStart` **1749**, quando as versões dizem
1929‑1931.

Alcance: **8 janelas de geração** de 5 476, em 4 famílias (`alfa-romeo|6c`,
`vaz|lada`, `abarth|ot`, `abarth|otr`), **2 anúncios ativos**. Não corrigido de
propósito: falha ABERTO (a janela fica permissiva, não exclusiva — o lado seguro do
erro) e o custo de mexer não se justifica com 2 anúncios. Se algum dia justificar,
a correção é rejeitar no `buildIndex` um `model_year` fora de [1880, 2100] — um ano
assim não é um ano — e deixar o arranque vir das `us_versions.year`, que estão
certas.

## Sinónimos de carroçaria — CORRIGIDO (07/ago)

A sequela que este trabalho tornou visível: um anúncio que diz "CABRIOLET" não
confirmava o mid cujo slug diz "cabrio" (o `derivativeGuard` compara por igualdade
exata). Resolvido com `canonBody` em `lib/engine/us-catalog.ts` — `cabrio`,
`cabriolet` e `convertible` para a mesma forma, mais `coup`→`coupe` e
`spyder`→`spider` — aplicado **dos dois lados** da comparação, dentro do guard (não
mexe no `midInfo.derivative` nem no encadeamento de gerações).

Apanhou um bug REAL que estava no golden e ninguém tinha visto: um
`SERIE 8 CABRIOLET M8 COMPETITION 625` resolvia `exato` na versão **Gran Coupe** M8
Competition. O golden não podia apanhá-lo — valida família, combustível, potência e
cilindrada, **idênticas** nos três corpos, e estas entradas não tinham
`midEsperado`. Agora dá `designacao` com `derivative="cabrio"` (G14 e G14-LCI têm
625 cv indistinguíveis), o que é o honesto e faz o `excludeMidsForDerivative`
confinar a amostra PT a cabrios. Efeito no golden: `exato` 90→88, `designacao`
72→74, violações 0 — as duas que "perdeu" eram as duas que estavam na carroçaria
errada.

**FORA do mapa de propósito:** os nomes de break (`touring`, `avant`, `variant`,
`sw`, `kombi`, `estate`). São a mesma carroçaria mas cada marca usa o seu, e dentro
de uma família só aparece um — canonizá-los não resolve nada e abria a porta a
fundir corpos entre marcas.

# 🔧 O derivado estava a engolir a geração

> **Estado: OPÇÃO A IMPLEMENTADA** (07/ago/2026). O diagnóstico abaixo mantém-se
> como registo; a opção **B continua em aberto** e é a correção certa a prazo — o
> que está feito resolve as marcas de família numérica, não a classe do problema.
> Números medidos no armazém local (664 264 anúncios, catálogo de 6 330 mids).
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

**Fica em aberto:** a opção **B** (disjunção temporal), que dispensa a lista por
marca. O `NUMERIC_CHASSIS_MAKES` tem hoje uma entrada e vai precisar de outra à
primeira marca de família numérica que apareça no catálogo — é o custo conhecido
de A, e o sinal de que B vale a pena quando houver tempo de a calibrar.

**Sequela conhecida, não corrigida:** um anúncio que diz "Carrera **Cabrio** GTS"
não confirma o derivado `cabriolet` — o `derivativeGuard` compara tokens exatos e
`cabrio` ≠ `cabriolet`. Já era assim antes desta alteração (o T-Roc funciona porque
o mid do catálogo diz mesmo "Cabrio"); agora fica mais visível, porque estes
anúncios caem em `provavel` em vez de casarem a versão errada. Um mapa de
sinónimos de carroçaria resolve-o, e não foi feito aqui para manter a alteração no
que estava provado.

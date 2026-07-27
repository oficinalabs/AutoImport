# 🔔 Alertas — como o disparo funciona

> **Estado: implementado e testado ponta-a-ponta** (23 jul). O stand cria um
> alerta a partir de um anúncio; quando aparece um carro que encaixa, recebe uma
> notificação no sino da topbar **e** um email — ambos com link direto para o
> anúncio.

## A cadeia completa

| Peça | Onde |
|---|---|
| Criar o alerta (marca/modelo fixos, slider de preço, países) | `components/listing-actions.tsx` → `createAlert` |
| Guardar | `alerts` — `countries` (text[]) + `criteria` (jsonb: `{summary, maxPrice?, make?, model?}`) |
| **Disparar** | `scripts/pipeline/match-alerts.ts` — passo 10/10 do `run-daily` |
| Notificação no sino | `alert_events` → `notificationsQuery` → `components/notifications-menu.tsx` |
| Email | `emails/alert-match.tsx` via `lib/email.ts` (Resend) |

## O job (`match-alerts.ts`)

Corre **depois do `flag-opportunities`** e parte da tabela `opportunities` — que
já garante veredito `compensa`, confiança `normal` na estimativa PT e dedupe por
carro físico. **Não repetimos esses filtros**: se a regra do que "compensa"
mudar, muda num sítio só e o alerta acompanha.

O match exige, além disso:
- `lower(make_raw) = lower(criteria->>'make')` **e** o mesmo para `model_raw` —
  o `make`/`model` vêm do catálogo do anúncio de origem (exatos, não texto livre);
- `country = any(alert.countries)` — os mercados que o stand escolheu;
- se houver `maxPrice`, `total_pt <= maxPrice`.

**Idempotente:** `alert_events` tem `unique(alert_id, listing_id)` e inserimos
com `on conflict do nothing`. O `returning` só devolve as linhas realmente
inseridas — é sobre essas, e só essas, que se envia email. Correr o pipeline
duas vezes no mesmo dia não duplica nada.

**Um email que falhe não trava o resto**: o erro é apanhado por evento, contado
e registado. O evento no sino já foi criado na primeira fase, portanto a
notificação nunca se perde por causa do email.

## ⚠️ JSX nos scripts do pipeline — a armadilha

Este é o **único** passo do pipeline que renderiza JSX (o email). O
`tsconfig.json` principal usa `"jsx": "preserve"` porque o bundler do Next trata
disso — mas o `tsx`/esbuild que corre os scripts **não**, e o React fica fora de
escopo dentro dos componentes de email.

O sintoma é traiçoeiro: **o matching funciona, o evento é criado, e só o email
falha** — em runtime, com `ReferenceError: React is not defined`. Não aparece no
typecheck nem no build.

Por isso existe o **`tsconfig.scripts.json`** (`jsx: "react-jsx"`), e os scripts
do `package.json` passam `TSX_TSCONFIG_PATH=tsconfig.scripts.json`:

```bash
pnpm pipeline:alerts   # só o matching de alertas
pnpm pipeline:daily    # o pipeline completo (inclui o matching)
```

**Nunca correr `tsx scripts/pipeline/match-alerts.ts` à seca** — o matching
funciona, mas os emails falham em silêncio. (Não dá para forçar a variável de
dentro do ficheiro: o tsx lê-a no arranque, antes do código correr.)

## Testado (23 jul, contra a base real)

Com um alerta de teste (BMW iX · ES · até 70 000 €) e 174 oportunidades reais:

| | |
|---|---|
| Match encontrado | 1 — BMW iX (ES) |
| Evento no sino | 1, com link `/anuncio/<id>` |
| Email | 1 enviado |
| 2.ª corrida (idempotência) | **0 matches** — não duplicou |

Dados de teste removidos no fim (`alerts`=0, `alert_events`=0).

## Decisões tomadas (e o que ainda é discutível)

- **Só notifica o que compensa.** Vem de graça por partir das `opportunities`.
  Se um dia quiseres avisar de qualquer carro que encaixe (mesmo sem compensar),
  a query tem de deixar de partir dessa tabela.
- **Notifica também anúncios que já cá estavam** quando o alerta foi criado —
  não só os que aparecem depois. É o comportamento útil (crias um alerta e vês
  logo o que há), mas se preferires só os novos: `and l.first_seen_at > a.created_at`.
- **Avisa só o dono do stand** (`member.role = 'owner'`). Com equipas, decidir se
  todos recebem.

## Retenção

O `alert_events` cresce com o tempo — entra na conversa do
[`docs/08`](08-RETENCAO-DE-DADOS.md). Eventos com meses já foram vistos e podem
ser limpos; não há query que leia mais do que os últimos.

# 🔔 Alertas — o job de matching (para o motor)

> **Divisão:** o frontend do alerta está feito (formulário em
> `components/listing-actions.tsx`, o sino em `components/notifications-menu.tsx`,
> o email em `emails/alert-match.tsx`). **Falta o passo do motor** que liga tudo:
> quando entra um anúncio novo que encaixa num alerta ativo, criar o evento
> (alimenta o sino) e enviar o email. Isto corre no pipeline diário — território
> do motor, por isso fica aqui especificado em vez de implementado à mão.

## O que já existe (não precisas de fazer)

- **O alerta guarda tudo o que precisas para o match.** A tabela `alerts` tem
  `countries` (text[]) e `criteria` (jsonb). O formulário grava em `criteria`:
  `{ summary, maxPrice?, make?, model? }`. O `make`/`model` vêm do anúncio de
  origem (exatos, do catálogo — não texto livre do utilizador), por isso dá para
  comparar com confiança.
- **O sino já lê os eventos.** `notificationsQuery` (em `lib/queries.ts`) faz
  `alert_events ⋈ alerts ⋈ listings` e a UI liga cada notificação a
  `/anuncio/<listingId>`. **Basta criar linhas em `alert_events`** e aparecem no
  sino, com o clique a levar ao anúncio.
- **O email está pronto.** `emails/alert-match.tsx` (`AlertMatchEmail`) — o botão
  "Ver anúncio" leva ao mesmo `/anuncio/<id>`. Enviar via `sendEmail` (`lib/email.ts`),
  como os outros.
- **A idempotência já está no schema.** `alert_events` tem
  `unique(alert_id, listing_id)` — inserir com `on conflict do nothing` garante
  que o mesmo anúncio nunca notifica duas vezes o mesmo alerta.

## O que falta — o passo do matching

Correr no `scripts/pipeline/run-daily.ts`, **depois do `flag-opportunities`**
(precisa dos custos/veredito já calculados). Duas fases: inserir eventos, depois
enviar email dos eventos novos.

### 1. Inserir os eventos novos (uma query)

```sql
insert into alert_events (alert_id, listing_id)
select a.id, l.id
from alerts a
join listings l
  on l.country = any(a.countries)
 and l.deleted_at is null
 and l.match_confidence = 'exato'            -- só matches de catálogo certos (regra da montra)
 and lower(l.make_raw)  = lower(a.criteria->>'make')
 and lower(l.model_raw) = lower(a.criteria->>'model')
join import_cost_estimates e
  on e.listing_id = l.id
 and e.verdict = 'compensa'                  -- só o que compensa (não enches de ruído)
 and e.pt_confidence = 'normal'
 and (a.criteria->>'maxPrice' is null
      or e.total_pt <= (a.criteria->>'maxPrice')::int)
where a.active = true
on conflict (alert_id, listing_id) do nothing
returning id, alert_id, listing_id;
```

O `returning` dá-te **exatamente os eventos novos** (o `on conflict do nothing`
não devolve os que já existiam) — é sobre esses que envias email.

⚠️ **Decisões de produto a confirmar com o Rui:**
- **Restringir a `match_confidence = 'exato'` + `verdict = 'compensa'`?** Alinha
  com a montra (só mostramos matches certos que compensam) e evita spam. Mas um
  alerta com `maxPrice` alto e sem compensar também pode interessar — se sim,
  tira o filtro do veredito.
- **Só anúncios novos, ou também os que já existiam quando o alerta foi criado?**
  A query acima apanha **todos** os que encaixam e ainda não foram notificados —
  incluindo os que já cá estavam. Se só quiseres avisar de anúncios que
  aparecem *depois* de o alerta ser criado, junta `and l.first_seen_at > a.created_at`.

### 2. Enviar o email de cada evento novo

Para cada linha do `returning`, com os dados do anúncio + do dono do stand:

```ts
import { AlertMatchEmail } from "@/emails/alert-match";
import { sendEmail } from "@/lib/email";
import { formatEuro } from "@/lib/format";

// … para cada evento novo, já com o listing (title, country, totalPt, savings),
//    o alertName e o email do dono do stand:
await sendEmail({
  to: ownerEmail,
  subject: `Apareceu um ${listingTitle} que encaixa no teu alerta`,
  react: AlertMatchEmail({
    name: ownerName,
    alertName,
    listingTitle,
    country: countryName,           // "Alemanha", não "DE"
    totalPt: formatEuro(totalPt),
    savings: formatEuro(savings),
    listingUrl: `${process.env.BETTER_AUTH_URL}/anuncio/${listingId}`,
  }),
  text: `O teu alerta "${alertName}" encontrou: ${listingTitle} (${countryName}). `
      + `Custo final ~${formatEuro(totalPt)}, poupa ~${formatEuro(savings)}. `
      + `Ver: ${process.env.BETTER_AUTH_URL}/anuncio/${listingId}`,
});
```

- O **destinatário** é o dono do stand: `member` (role owner) → `user.email` da
  organização do alerta (`alerts.stand_id`).
- Se o stand tiver equipa, decidir se avisa só o owner ou todos — por agora,
  owner chega.
- ⚠️ **Não rebentar o run se um email falhar** — apanha o erro por evento e
  continua (como o resto do pipeline). O evento no sino já foi criado na fase 1,
  portanto a notificação não se perde mesmo que o email falhe.

### 3. Egress / retenção

Cada corrida insere no máximo `(nº alertas ativos × nº anúncios novos que
encaixam)` linhas — pequeno. Mas o `alert_events` cresce; entra na conversa da
retenção (`docs/08`): eventos com mais de X meses podem ser limpos, já foram
vistos.

## Como testar

1. Criar um alerta a partir de um anúncio (ex.: BMW iX, DE/NL, até 70 000 €).
2. Correr o passo de matching (ou o `run-daily` completo).
3. Confirmar: aparece no sino (com link para o anúncio) **e** chega o email (com
   o botão para o mesmo anúncio).
4. Correr outra vez → **não** duplica (o `on conflict` trava).

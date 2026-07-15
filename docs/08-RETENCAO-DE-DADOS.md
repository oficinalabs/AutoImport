# 📉 Proposta: retenção de dados

> **Estado: PROPOSTA — nada decidido, nada implementado.** Escrita para o dono da
> engine rever. As decisões no fim são dele; o que está aqui é a análise e as
> opções, com os números medidos em 15/jul/2026.

## O pedido, em duas linhas

A `pt_price_observations` cresce **1 linha por anúncio PT por dia, para sempre**, e o
`daily-batch` corre às 03:00 todos os dias. Hoje a tabela tem **0 linhas** — por isso
esta conversa custa zero. Daqui a três meses custa um fim de semana.

**Decisão pedida:** qual das opções (A/B/C) seguimos, e com que prazos.

## O que já está certo (e serviu de base a esta proposta)

O `listing_price_history` **já está resolvido**. O `db-sink.ts` só grava quando o preço
muda, com a primeira observação incluída:

```sql
-- tools/collector/lib/db-sink.ts:200
insert into listing_price_history (listing_id, price, observed_at)
select $1, $2, $3
where coalesce(
  (select price from listing_price_history
    where listing_id = $1 order by observed_at desc limit 1), -1
) <> $2
```

Isto é exatamente o padrão certo: ~3 linhas por anúncio **na vida toda** em vez de uma
por dia. O `onDelete: cascade` no `listing_id` fecha o ciclo — apagar o anúncio limpa o
histórico dele. **Nada a fazer aqui.** A proposta é só sobre a outra tabela.

O `enrich-es.ts:68` também está bem: insere sem comparar com o histórico, mas corre uma
vez por anúncio (trava no `precio_contado_checked`), portanto no máximo 1 linha cada.

## O problema: `pt_price_observations`

```sql
-- scripts/pipeline/pt-market.ts:27 — o snapshot diário
and not exists (
  select 1 from pt_price_observations o
  where o.listing_id = l.id and o.observed_at::date = current_date
)
```

Um anúncio PT que esteja 90 dias no mercado sem mexer no preço deixa **90 linhas
idênticas**. Multiplicado pelo cron diário e por nada que apague, é crescimento linear
sem teto.

### Quanto tempo temos

Estado real medido hoje: **43 MB de 500 MB**, `listings`/`listing_price_history`/
`pt_price_observations` **todas a 0**. Os 43 MB são a `us_versions` (15 520 linhas,
31 MB) — dados de catálogo, estáticos.

Estimativa de **~200 bytes/linha** para esta tabela (8 colunas estreitas + 2 índices;
é estimativa estrutural, não medida — a tabela está vazia. Confirma-se com uma semana
de dados reais).

Com **457 MB livres**:

| Anúncios PT ativos | Crescimento | Bate nos 500 MB em |
|---|---|---|
| 5 000 | 1 MB/dia | ~15 meses |
| 10 000 | 2 MB/dia | **~7 meses** |
| 20 000 | 4 MB/dia | **~4 meses** |
| 50 000 | 10 MB/dia | **~6 semanas** |
| 100 000 | 20 MB/dia | **~3 semanas** |

**A pergunta que decide a urgência: quantos anúncios PT vais manter ativos?** Abaixo de
~5 000 isto é teórico e a Opção A chega. Acima de ~20 000 é um problema deste trimestre.
Aos 500 MB a base **recusa escritas** e a engine começa a falhar inserts.

## Porque é que a solução óbvia está errada

A primeira ideia — *"faz como no `db-sink`, grava só mudanças"* — **parte o produto**.
Verifiquei antes de a propor. Há duas leituras a depender da densidade diária:

**1. `estimatePtPrice` (`lib/engine/pt-market.ts:62`)** — janela de 60 dias sobre
`observed_at`:

```sql
where o.model_id = $1 ... and o.observed_at > now() - make_interval(days => 60)
order by identity, observed_at desc   -- distinct on = a mais recente por carro
```

Um anúncio com preço **estável** há 60 dias teria a última observação fora da janela e
**sairia da amostra**. E os anúncios de preço estável são os mais representativos do
mercado — a mediana passaria a ser calculada só sobre carros que mexeram no preço, ou
seja, os que não vendem. **A estimativa PT ficaria enviesada para baixo**, e a poupança
que mostramos ao stand com ela.

**2. `ptPriceHistory` (`lib/engine/pt-market.ts:120`)** — médias mensais para o gráfico:

```sql
select date_trunc('month', observed_at), avg(price)
from pt_price_observations
where model_id = $1 and observed_at > now() - interval '6 months'
```

É uma média ponderada pelo tempo que cada carro esteve no mercado. Com só-mudanças, cada
carro passaria a pesar pelo número de vezes que mudou de preço. Média diferente,
silenciosamente.

**Conclusão: o `not exists ... current_date` não é descuido — é o que a janela de 60 dias
exige.** Qualquer proposta tem de mexer nas leituras primeiro, ou não mexer em nada.

### O facto que abre a porta

**Nenhuma query lê observações com mais de 6 meses.** O `sample()` para nos 60 dias, o
`ptPriceHistory` nos 6 meses. Tudo o que passe disso é peso morto garantido — não é uma
opinião sobre o que é útil, é o que o código faz.

## As opções

> **Nota de revisão (16 jul).** A Opção A estava escrita como um bloco só, com dois
> `delete` diferentes lá dentro. **São coisas diferentes e não têm o mesmo risco** — a
> revisão apanhou isso e a secção passou a separá-los. Ver A1 e A2.

### A1 — Apagar observações com mais de 6 meses (o passo barato)

Job semanal:

```sql
delete from pt_price_observations where observed_at < now() - interval '6 months';
```

- ✅ Uma linha. Nenhuma leitura muda, porque **nenhuma query lê estas linhas** — é lixo
  por construção, não é uma escolha sobre o que é útil.
- ✅ Não depende de decidir mais nada. Pode ir hoje.
- ⚠️ **Não chega acima de ~10k anúncios**: o teto em regime é `N × 180 dias × 200 B` —
  10k → 360 MB, 20k → **720 MB**. Rebenta na mesma, só mais devagar.

⚠️ **É a única coisa que apaga as observações.** Ao contrário do `listing_price_history`,
o `pt_price_observations.listing_id` é `onDelete: set null` (`db/schema.ts:345`) — apagar
o anúncio deixa a observação órfã, não a apaga. Isso é deliberado e correto (o
`ptPriceHistory` não faz join, portanto continua a contá-las no gráfico), mas quer dizer
que sem A1 acumulam-se para sempre — e o `sample()` nem as vê, porque faz inner join.

### A2 — Apagar anúncios inativos há mais de 90 dias (não é barato)

```sql
delete from listings
 where last_seen_at < now() - interval '90 days' and deleted_at is not null;
```

**Isto não é o mesmo tipo de operação que A1, e não deve ir no mesmo job.** Cinco tabelas
cascateiam de `listings`:

| Tabela | `onDelete` | O que se perde |
|---|---|---|
| `listing_price_history` | cascade | histórico de preço do anúncio — ok, morre com ele |
| `import_cost_estimates` | cascade | o cálculo — recomputável |
| `opportunities` | cascade | oportunidades passadas do stand |
| `alert_events` | cascade | o registo de que já notificámos este anúncio |
| **`favorites`** | **cascade** | **o favorito de um cliente, sem aviso** |

O `favorites` é o que incomoda: um stand marca um carro como favorito, o anúncio fica 90
dias sem ser visto, e o favorito **desaparece do painel dele sem explicação**. Não é
espaço poupado que justifique isso — a `favorites` é minúscula.

**A2 depende da decisão 3** (lá em baixo) e não deve ir junto com A1. Opções, quando se
lá chegar: apagar só anúncios sem favoritos/oportunidades associados; ou manter a listing
e apagar só as tabelas pesadas; ou mostrar o favorito como "anúncio já não disponível"
em vez de o apagar.

### B — A1 + rollup mensal

Nova tabela `pt_price_monthly (model_id, month, avg_price, n_obs)`, escrita pelo batch
diário (upsert). O `ptPriceHistory` passa a ler de lá e deixa de precisar de observações
antigas → a retenção de `pt_price_observations` pode encurtar para **60 dias** (só o que
o `sample()` usa).

- ✅ Teto passa a `N × 60 × 200 B` → 20k = 240 MB, 50k = 600 MB
- ✅ O gráfico fica mais rápido (lê linhas agregadas, não faz `avg` sobre milhares)
- ⚠️ Ainda cresce com o número de anúncios; 50k continua a não caber

### C — B + janela sobre `last_seen_at` (a que quebra a ligação tempo↔espaço)

Muda a janela do `sample()`:

```sql
-- de:
and o.observed_at > now() - make_interval(days => 60)
-- para:
and l.last_seen_at > now() - make_interval(days => 60)
```

A semântica passa a ser *"carros vistos no mercado nos últimos 60 dias, ao seu preço mais
recente"* — que é o que o comentário do ficheiro já diz querer. O
`distinct on (identity) order by observed_at desc` continua a pegar a observação mais
recente, e o `identity` usa `l.price`/`l.vin`, não `o.observed_at`, portanto não se
altera.

⚠️ **Não é só uma linha — e a revisão apanhou porquê.** O `sample()` também filtra por
`o.year` e `o.km_band`, que são **colunas da observação**:

```sql
and o.year     between ${year - spread}   and ${year + spread}
and o.km_band  between ${kmBand - spread} and ${kmBand + spread}
```

Hoje o snapshot diário reescreve `floor(l.km / 25000)` **todos os dias**, portanto o
`km_band` acompanha o anúncio. Com inserts só-em-mudança, o `km_band` e o `year` ficam
**congelados no momento da última mudança de preço** — e o filtro passa a comparar contra
um valor velho.

Na prática o efeito é pequeno (um carro à venda quase não acumula quilómetros), mas é
silencioso, que é o pior tipo de erro. **Se a C avançar, o `sample()` deve passar a ler
`l.km`/`l.year` diretamente da `listings`** (`floor(l.km / 25000)` no filtro) em vez das
cópias na observação. Isso converge com a pergunta 4 lá em baixo: se o `sample()` ler o
`price` da listing e o `km`/`year` da listing, o que é que ainda vai buscar à
`pt_price_observations`?

Com a janela na *listing* e não na *observação*, gravar só mudanças deixa de partir a
amostra — e o insert do `pt-market.ts` passa a ser o mesmo padrão do `db-sink.ts`:

```sql
and coalesce(
  (select o.price from pt_price_observations o
    where o.listing_id = l.id order by o.observed_at desc limit 1), -1
) <> l.price
```

- ✅ Teto passa a `N × ~3 mudanças × 200 B` → **50k anúncios = ~30 MB**, e **deixa de
  crescer com o tempo** (só com o nº de anúncios)
- ✅ Enquanto houver snapshot diário, é **semanticamente equivalente** à query atual —
  dá para mudar a leitura primeiro e o insert só depois, sem big bang
- ⚠️ Mexe na engine: precisa dos testes de `estimatePtPrice` a passar antes e depois
- ⚠️ Depende de o `last_seen_at` ser fiável (o `db-sink` faz
  `greatest(listings.last_seen_at, excluded.last_seen_at)` — pelos vistos sim)

## Recomendação

**A1 agora; A2, B e C só depois de decidido o que está em aberto.** Razões:

1. A **A1** é uma linha e não depende de acordo nenhum — as observações com mais de 6
   meses são lixo por construção. Faz-se hoje e compra meses.
2. A **A2** parece do mesmo tamanho mas não é: apaga favoritos de clientes em cascata.
   Precisa da decisão 3 primeiro.
3. A **C** é a única que quebra a ligação entre *tempo* e *espaço*, mas mexe na lógica de
   estimativa, que é o coração do produto. Não vale a pena fazê-la à pressa com a tabela
   a 0 e nenhum stand a pagar.
4. A **B** só faz sentido como degrau para a C, ou se o gráfico ficar lento.

**Ordem sugerida:** A1 (job semanal) → medir 1 semana com dados reais para confirmar os
200 B/linha → decidir entre B e C com números em vez de estimativas.

## Decisões que são tuas (não minhas)

1. **Quantos anúncios PT ativos vais manter?** É o número que decide se isto é urgente ou
   teórico. Tudo acima depende dele.
2. **Quanto tempo interessa o histórico de preço PT?** Hoje o código diz 6 meses
   (`ptPriceHistory`). É requisito ou foi um default?
3. **Apagar anúncios inativos (A2): quando, e o que fazer aos favoritos?** Cinco tabelas
   cascateiam de `listings`, e uma delas é a `favorites` — apagar o anúncio faz o favorito
   de um stand desaparecer do painel sem explicação. A pergunta não é só "90 dias chega?",
   é **o que acontece ao que o cliente vê**. A minha sugestão: não apagar anúncios com
   favoritos ou oportunidades associadas, ou mostrá-los como "já não disponível" — mas é
   decisão de produto, não minha.
4. **Pergunta em aberto:** com a janela sobre `last_seen_at`, a
   `pt_price_observations` ainda precisa de existir para o `sample()`? Os dados que ele
   lê (`price`, `year`, `km_band`) estão todos na `listings`, e o `km_band` é
   `floor(km/25000)`. A tabela passaria a servir só o gráfico — que a `pt_price_monthly`
   já cobriria. Pode ser que a resposta seja "sim, precisamos do passado ao dia para X" —
   mas se não for, há aqui uma tabela inteira a menos para manter.

## Contexto

- Limites do plano, medições e alternativas ao Supabase: [`04-BASE-DE-DADOS.md`](04-BASE-DE-DADOS.md)
- Regra de ouro sobre migrations e deploy: [`../CLAUDE.md`](../CLAUDE.md)
- Vigiar o tamanho: `select pg_size_pretty(pg_database_size(current_database()))` — acima
  de **400 MB** é decisão forçada (limpar ou passar a Pro, $25/mês → 8 GB).

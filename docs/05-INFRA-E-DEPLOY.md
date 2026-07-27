# 🚀 Infra & Deploy

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Hosting
- ☑️ **App:**
  - [x] Vercel (default — arrancar rápido, preview deploys) _— app Next.js, **em produção** (jul 2026)_
  - [ ] Coolify + Hetzner (portfólio, custo fixo)
  - [ ] Railway (meio-termo gerido)
  - _A **engine de dados (Python)** não corre na Vercel — corre em **GitHub Actions** (cron diário) e escreve na BD. Ver [Backend](03-BACKEND.md)._
- ✏️ **Base de dados alojada em:** Supabase — região **UE (Frankfurt)** (ver [Base de Dados](04-BASE-DE-DADOS.md)).
- ✏️ **Domínio & DNS:** produção em **`autoimport.arestadigital.pt`** (ligado à Vercel). DNS no **Cloudflare**: registo `CNAME` `autoimport` → alvo indicado pela Vercel (`…vercel-dns-017.com`), com **proxy desligado (DNS only / nuvem cinzenta)**. SSL 🔒 automático pela Vercel.
- ✏️ **Fluxo de deploy:** `git push` para `main` → a **Vercel** faz build + deploy de produção automaticamente; o domínio serve sempre a última versão. O **Cloudflare é só DNS** e não entra por deploy. Branches/PRs geram **preview URLs** isolados; um build que falhe **não** é publicado (mantém a versão anterior).

## CI/CD (fixo)
- 🔒 **GitHub Actions** em cada PR: `lint` → `typecheck` → `test` → `build`.
- 🔒 **Ambientes:** preview por PR · (staging) · produção.
- 🔒 **Deploy:** só a partir de `main` verde.

### Migrations no deploy 🔒
O deploy publica **código**; a base de dados **não muda sozinha**. Para não voltar a
acontecer o que aconteceu (código a ler `listings` sem a tabela existir em produção),
o `vercel.json` corre as migrations **antes** do build:

```
buildCommand: pnpm db:migrate:deploy && next build
```

`scripts/db/migrate-deploy.ts` tem duas guardas:
- **Só aplica com `VERCEL_ENV=production`.** Previews de PR **não** tocam na base de
  dados — Preview e Production partilham a mesma `DATABASE_URL`, e sem isto um PR
  por rever alterava a produção.
- **Sem `DATABASE_URL` não faz nada** (build sobre mocks).

Se uma migration falhar, **o build falha e nada é publicado** — é intencional: mais vale
não publicar do que publicar código que a base de dados não suporta. Nesse caso, corrige
a migration e volta a fazer deploy (a Vercel mantém a versão anterior no ar).

> **Nota histórica:** a Supabase foi criada com `db:push` antes de existirem migrations,
> por isso a `0000` foi marcada como aplicada (baseline) — o estado da base de dados foi
> verificado coluna a coluna contra ela antes disso. Daqui para a frente é só `db:generate`
> + deploy.
- _Workflows extra deste projeto: **cron diário da engine** (ingestão/recálculo) como Action separada, com o seu próprio conjunto de segredos._

### Duas bases de dados: warehouse local vs. base da app
O corpus deixou de caber na Supabase (500 MB, ~150 000 anúncios — ver
[Base de Dados](04-BASE-DE-DADOS.md)), por isso passou a haver **duas**:

| | `WAREHOUSE_URL` | `DATABASE_URL` |
|---|---|---|
| **O quê** | o corpus completo (todos os anúncios recolhidos) | montra publicada + dados de utilizador (auth, stands, favoritos, alertas) |
| **Onde** | Postgres **local** (máquina de recolha) | Supabase — é a que a app na Vercel usa |
| **Quem escreve** | coletores e pipeline | a app, e o passo de publicação do pipeline |

`lib/db-url.ts` faz a resolução e as guardas:

- **`WAREHOUSE_URL` tem de ser local.** Definida e a apontar para fora de
  `localhost`/`127.0.0.1` ⇒ lança e não liga (falha fechada). O corpus na Supabase enche
  o disco e a base começa a recusar escritas.
- **Default invertido.** Com `WAREHOUSE_URL` definida, é ela que o `db/index.ts` usa; sem
  ela cai na `DATABASE_URL`. Na **Vercel** e no **CI** não existe `WAREHOUSE_URL` — logo o
  comportamento aí é exatamente o de antes.
- **Escrever fora da máquina exige confirmação.** Um script de CLI que escreva numa base
  não-local é recusado com uma mensagem que diz o que fazer; para o forçar,
  `DB_TARGET=prod pnpm <comando>`. A guarda não se aplica na Vercel (`process.env.VERCEL`),
  onde escrever na base da app é o esperado. As mensagens nunca imprimem a connection string.
- **Credenciais de produção fora do carregamento automático:** vivem no
  `.env.production.local`; o `.env.local` aponta para o warehouse.

## Variáveis & segredos
- 🔒 Nunca em commit. Geridos no painel do host + `.env.example` no repo.
- ✏️ **Onde estão os segredos de produção:**
  - App → **Vercel** (env vars por ambiente).
  - Engine → **GitHub Actions secrets**.
  - BD/serviços → painel do **Supabase**.
  - _Chave de escrita da engine na BD é separada da app (menor privilégio)._

## Observabilidade
- 🔒 **Erros:** Sentry.
- ☑️ **Analytics de produto:** [ ] Nenhum · [x] PostHog · [ ] Plausible _— funil trial → pago, uso das pesquisas/alertas (precisa de consentimento de cookies)_
- ✏️ **Alertas / uptime:** uptime da app via Better Stack/UptimeRobot; **alerta crítico se a run diária da engine falhar** (dados desatualizados = produto sem valor) — notificação imediata ao email/Slack interno.
- ✏️ **Estratégia de rollback:** app → **rollback instantâneo** para o deployment anterior na Vercel; BD → migrations forward-only, testadas em staging; se uma run da engine correr mal, os dados anteriores mantêm-se (escrita idempotente, não destrutiva).

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
- _Workflows extra deste projeto: **cron diário da engine** (ingestão/recálculo) como Action separada, com o seu próprio conjunto de segredos._

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

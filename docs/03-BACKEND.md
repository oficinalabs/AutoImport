# ⚙️ Backend

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## API
- 🔒 **Runtime:** Next.js server (Node).
- ☑️ **Estilo de API:**
  - [x] Server Actions (default) _— fluxos da app (pesquisa, alertas, conta, membros)_
  - [x] Route Handlers (REST / webhooks) _— webhooks do Polar (faturação) e um endpoint protegido de ingestão/health da engine_
  - [ ] tRPC
- 🔒 **Validação:** Zod em **todas as fronteiras** (input nunca é de confiança).

## Autenticação & autorização
- ☑️ **Auth:**
  - [x] Better Auth (default — dono dos users, dados na UE, sem custo/MAU)
  - [ ] Supabase Auth (RLS)
  - [ ] Clerk (SSO / SAML enterprise)
  - [ ] Nenhuma (site público)
- ✏️ **Métodos de login:** email + password (verificação por email). Google opcional numa fase seguinte. _Magic link é possível, mas password funciona melhor para donos de stand a partilhar acesso._
- ☑️ **Multi-tenant (equipas / workspaces):** [ ] Não · [x] Sim
  - _Cada **stand** é um tenant. Um stand pode ter vários utilizadores (dono + comprador/vendedores). Todos os dados de negócio (alertas, pesquisas guardadas, faturação) pertencem ao stand, não ao utilizador._
- ✏️ **Papéis / permissões:**
  - `owner` — dono do stand: faturação, gerir membros.
  - `member` — colaborador do stand: usar a ferramenta, criar alertas.
  - `admin` — interno (oficinalabs): suporte, gestão de fontes/tabelas de ISV. Fora do modelo de tenant.

## Trabalho assíncrono
- ☑️ **Jobs & cron:**
  - [ ] Inngest (default — event-driven, sem workers) _— opcional numa 2ª fase para eventos da app (ex.: «novo negócio compensatório» → email)_
  - [ ] Trigger.dev (long-running / AI)
  - [x] GitHub Actions (batch de dados)
  - [ ] Nenhum
  - _Desvio ao default: o coração do produto é um **batch diário de dados** (ingestão + recálculo). GitHub Actions (cron) encaixa no padrão «engine de dados em Python» e é barato/simples. Inngest entra depois, só se precisarmos de reações event-driven finas._
- ✏️ **Jobs previstos:**
  - **Diário:** ingerir/atualizar anúncios das fontes europeias (mobile.de, AutoScout24 e restantes — ver [research/sites](../research/sites-stands-por-pais-2026.md)); normalizar para modelo canónico; recalcular preço-mercado PT; recalcular ISV + custo final por anúncio; marcar oportunidades (poupança acima de X).
  - **Event/agendado:** alerta por email quando surge um negócio que bate os critérios de um stand; resumo semanal; emails transacionais.
  - **Semanal/mensal:** atualizar tabelas de ISV/IUC quando mudam (raro, mas versionado).

## Serviços de backend
- 🔒 **Email transacional:** Resend + React Email.
  - ✏️ **Emails previstos:** verificação/boas-vindas, reset de password, convite de membro para o stand, **alerta de novo negócio compensatório**, resumo semanal de oportunidades, avisos de faturação (fim de trial, falha de pagamento — a maioria vinda do Polar).
- ☑️ **IA / LLM:** [ ] Não · [x] Claude API (Anthropic SDK)
  - ✏️ **Modelo default:** `claude-haiku-4-5` para o trabalho em massa (normalizar/emparelhar anúncios de línguas e sites diferentes ao modelo/versão canónicos; extrair cilindrada/CO₂/potência de texto livre). `claude-sonnet-5` só para casos ambíguos/difíceis. _Ver budget em [Serviços Externos](06-SERVICOS-EXTERNOS.md)._
- ☑️ **Storage de ficheiros:** [x] Nenhum · [ ] Supabase Storage · [ ] S3 / R2
  - _MVP não guarda imagens (referenciamos o anúncio na fonte). Passar a **R2** se um dia cachar imagens ou gerar PDFs de comparação._

## Regras fixas
- 🔒 **Segredos:** só em variáveis de ambiente; `.env.example` sempre atualizado.
- 🔒 **Webhooks:** verificar assinatura, responder rápido, processar em job.
- ✏️ **Rate limiting:**
  - Login/auth — proteger contra brute-force (por IP + por conta).
  - Pesquisa/API por conta — a agregação de preços é o nosso ativo; travar exportação em massa/scraping por concorrentes.
  - **A engine** deve respeitar os limites e ToS das fontes (backoff, cadência humana) — ver risco em [Serviços Externos](06-SERVICOS-EXTERNOS.md).

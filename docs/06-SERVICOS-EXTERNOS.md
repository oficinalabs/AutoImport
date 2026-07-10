# 🔌 Serviços Externos & Integrações

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Pagamentos
- ☑️ **Provedor:**
  - [ ] Nenhum (grátis)
  - [x] Polar (default — Merchant of Record, trata do IVA da UE)
  - [ ] Lemon Squeezy (MoR)
  - [ ] Stripe (quando tens de ser o comerciante)
  - _MoR trata IVA/faturas e reverse-charge B2B (os stands têm NIF) — tira-nos a papelada fiscal de cima._
- ✏️ **Modelo:** subscrição mensal por stand, com **1.º mês grátis** (trial).
- ✏️ **Planos & preços:** plano único ~**100€/mês** por stand no arranque. _(Anual com desconto e escalões por nº de utilizadores ficam para validar depois.)_
- ✏️ **Moeda:** EUR.
- 🔒 Se MoR: IVA, faturas e reverse-charge B2B tratados pelo provedor.

## Comunicação
- 🔒 **Email transacional:** Resend (ver [Backend](03-BACKEND.md)).
- ☑️ **Email marketing / newsletter:** [x] Não · [ ] Resend Broadcasts · [ ] Outro: `________`
  - _Go-to-market é presencial (visita a stands). Sem newsletter no MVP; reavaliar se houver base para atualizações de produto._

## IA
- ☑️ **LLM:** [ ] Não · [x] Anthropic Claude
  - ✏️ **Modelo:** `claude-haiku-4-5` (workhorse: normalização/emparelhamento de anúncios, extração de cilindrada/CO₂), `claude-sonnet-5` para casos difíceis  ·  **Budget mensal:** ~50–100€ no arranque _(a confirmar com o volume real de anúncios/dia)_.

## Outras integrações
- ✏️ **OAuth / login social:** Google (opcional, fase 2).
- ✏️ **APIs externas:**
  - **Fontes de anúncios** (o input central): mobile.de e AutoScout24 têm **APIs/feeds de concessionário** (via aprovação/parceria) — preferir sempre isto; as restantes fontes (ver [research/sites](../research/sites-stands-por-pais-2026.md)) são maioritariamente por scraping.
  - **Histórico de viatura / anti-fraude de km** (opcional): carVertical / autoDNA por VIN.
  - **Referência de ISV** (validação): simulador/tabelas oficiais (Autoridade Tributária) e fontes cruzadas do [relatório de viabilidade](../research/paises-viaveis-importacao-2026.md).
- ✏️ **Quotas / rate limits a vigiar (o que pode partir no dia 1):**
  - ⚠️ **Risco #1 — legalidade e anti-bot das fontes:** scraping do mobile.de/AutoScout24 e afins pode violar os **Termos de Serviço** e ser bloqueado por proteção anti-bot. É o equivalente ao bloqueador regulatório de outros projetos: **validar antes de construir** (feeds oficiais de concessionário, parcerias, ou fontes que permitam agregação). Ver nota abaixo.
  - Aprovação/limites de acesso às APIs oficiais (mobile.de, AutoScout24).
  - Limites da Claude API (throughput na normalização em massa).
  - Polar (webhooks/faturação).

## Conformidade (checklist)
- [ ] Política de privacidade + termos
- [ ] Banner de cookies (PostHog → precisa de consentimento)
- [ ] Processamento de dados / RGPD mapeado (PII do stand; ver [Base de Dados](04-BASE-DE-DADOS.md))
- [ ] Páginas legais ligadas no footer
- [ ] **Parecer sobre agregação/scraping** das fontes de anúncios (ToS + direito da UE sobre bases de dados) — **bloqueador a resolver antes do build da engine**

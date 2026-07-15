# Política de Privacidade — AutoImport

> **Nota antes de publicar:** este documento tem placeholders (`[…]`) para dados de identificação da empresa que ainda não foram fornecidos (denominação social, NIPC, morada, contacto). Preenchê-los é **obrigatório por lei** (RGPD art. 13º/1/a; DL 7/2004) — a política não pode ir para produção sem isso.

---

## 0. Quem somos (Responsável pelo Tratamento)

**Obrigatório por lei** (RGPD art. 13º/1/a) identificar claramente o responsável pelo tratamento.

O AutoImport é operado por **[Denominação Social], NIPC [XXXXXXXXX], com sede em [morada]**, doravante "AutoImport" ou "nós".

Para questões sobre esta política ou sobre os seus dados pessoais: **[email dedicado, ex. privacidade@autoimport.pt]**.

*Fonte do requisito: RGPD art. 13º; padrão confirmado em todas as políticas de privacidade analisadas (OLX, StandVirtual, InvoiceXpress, Vendus, carVertical) que abrem sempre com identificação do responsável.*

---

## 1. Que dados tratamos, para quê e com que fundamento

Esta é a secção central. Por cada categoria de dado: o que é, para que serve, e **qual o artigo do RGPD que autoriza o tratamento** — sem fundamento de licitude não há tratamento válido (RGPD art. 6º).

| Dado | Origem | Finalidade | Fundamento de licitude | Obrigatório citar? |
|---|---|---|---|---|
| Nome e email do utilizador | Registo na plataforma | Criar e gerir a conta, autenticação, comunicações de serviço | **Execução de contrato** — art. 6º/1/b RGPD (o tratamento é necessário para prestar o serviço que o utilizador pediu) | Sim |
| Nome comercial, NIF, morada e telefone do stand | Registo/onboarding do stand cliente | Formalizar a relação contratual, faturação, contacto comercial | **Execução de contrato** (art. 6º/1/b) para a relação comercial; **cumprimento de obrigação legal** (art. 6º/1/c) para os dados que têm de constar em fatura (Código do IVA) | Sim |
| Cookie de sessão (Better Auth) | Automático, ao iniciar sessão | Manter o utilizador autenticado entre pedidos | **Não carece de consentimento** — isento nos termos do art. 5º/2 da Lei 41/2004 (cookie estritamente necessário para prestar um serviço explicitamente pedido pelo utilizador). Ainda assim, tem de ser **divulgado** (dever de transparência não se confunde com dever de consentimento) | Sim — divulgação obrigatória mesmo isento de consentimento |

**Nota importante sobre o NIF/morada do stand:** se o stand for um empresário em nome individual (ENI) ou se o contacto associado for uma pessoa física identificável (não uma sociedade anónima com gerência rotativa), estes dados **são dados pessoais na aceção do RGPD**, não apenas "dados B2B fora do âmbito". Tratar como dados pessoais é a opção mais segura por defeito.

*Fonte: material de investigação sobre CNPD/enquadramento aplicado especificamente ao AutoImport ("AutoImport trata NIF, morada e telefone de pessoas de contacto em stands... dados pessoais na aceção do RGPD").*

> **⚠️ Precisa de validação por advogado:** a qualificação exata de "stand" como pessoa coletiva pura vs. dados de pessoa física dentro de uma pessoa coletiva deve ser confirmada caso a caso — a política pode (e deve) ser escrita de forma cautelar, mas a due diligence de cada tipo de cliente é jurídica, não editorial.

---

## 2. Prazos de conservação

**Obrigatório por lei** informar os prazos de conservação ou, quando não for possível fixar um prazo exato, os critérios usados para o determinar (RGPD art. 13º/2/a).

| Categoria | Prazo | Base |
|---|---|---|
| Dados de faturação/fiscais (associados a NIF) | **10 anos** | Código do IVA — prazo de referência confirmado no material de investigação para dados fiscais em Portugal |
| Dados de conta (nome, email) enquanto a conta está ativa | Duração da relação contratual | A definir e documentar internamente |
| Dados de conta após cessação/cancelamento | **Não coberto pela investigação com precisão** — precisa de decisão própria do AutoImport (ex.: X meses após inatividade, para permitir reativação) | — |
| Cookie de sessão | Duração da sessão / expiração técnica do token | Configuração do Better Auth |

> **⚠️ Precisa de decisão + validação jurídica:** o material de investigação (CNPD) sublinha que **a ausência de prazos de conservação definidos e justificados por categoria de dado é uma das não-conformidades mais comuns fiscalizadas pela CNPD** — não é aceitável deixar isto como "enquanto for necessário" sem mais. O AutoImport tem de fixar prazos concretos antes de publicar.

---

## 3. Com quem partilhamos os dados (subcontratantes)

**Obrigatório por lei** identificar destinatários ou categorias de destinatários (RGPD art. 13º/1/e). **Boa prática** (não estritamente obrigatória na política pública, mas recomendada e confirmada como padrão de mercado no material — OLX, StandVirtual, InvoiceXpress nomeiam fornecedores concretos em vez de "parceiros" genéricos) nomear os subcontratados reais em vez de falar em termos vagos.

| Subcontratado | Função | Dados que vê | Localização |
|---|---|---|---|
| **Supabase** | Base de dados | Todos os dados de conta e do stand | UE (Frankfurt) |
| **Vercel** | Alojamento da aplicação | Dados em trânsito, logs técnicos | EUA (empresa sediada nos EUA) |
| **Resend** | Envio de emails transacionais | Nome e email do utilizador (destinatário) | Não coberto pela investigação — confirmar sede e localização do fornecedor |
| **Polar** | Processamento de pagamentos (Merchant of Record) | Dados de faturação do stand, dados de pagamento (a Polar é quem trata cartão/pagamento, não o AutoImport) | EUA (Polar Software Inc.) |
| **GitHub Actions** | Motor de cálculo (engine que corre o processamento) | A confirmar internamente — se só processa dados fiscais/públicos (ISV/IUC), pode não tocar em dados pessoais | EUA (Microsoft/GitHub) |

**Obrigatório por lei — nota interna, não necessariamente pública:** com cada um destes subcontratados tem de existir um **contrato de subcontratação nos termos do art. 28º do RGPD** (DPA — Data Processing Agreement). Isto não tem de estar detalhado na política pública, mas tem de existir e estar assinado. Supabase, Vercel e Polar disponibilizam DPAs próprios (confirmado no material para Polar, que tem página dedicada de subprocessadores e DPA; padrão comum também em Supabase e Vercel).

> **⚠️ Precisa de validação:**
> - Confirmar se a Resend está sediada na UE ou fora — isto determina se há transferência internacional a declarar.
> - Confirmar se o GitHub Actions, tal como usado pelo AutoImport, chega a processar dados pessoais (de utilizadores/stands) ou apenas dados fiscais/públicos agregados. Se for só o segundo caso, a exposição é menor e pode não exigir DPA — mas isto é uma decisão técnica que precisa de confirmação, não de suposição.
> - Assinar os DPAs com cada subcontratado antes de tratar dados em produção — não é uma opção, é uma obrigação do art. 28º RGPD.

---

## 4. Transferências internacionais de dados

**Obrigatório por lei** identificar transferências para fora da UE/EEE e o mecanismo legal que as autoriza (RGPD art. 13º/1/f, Capítulo V do RGPD).

| Fornecedor | Fora da UE? | Mecanismo (a confirmar/aplicar) |
|---|---|---|
| Supabase | **Não** — dados alojados em Frankfurt (UE) | Sem transferência internacional |
| Vercel | Sim — EUA | Data Privacy Framework (DPF) e/ou Cláusulas Contratuais-Tipo (CCT), conforme o que a Vercel tiver certificado à data — **a confirmar diretamente com a Vercel** |
| Resend | Não coberto pela investigação | A confirmar |
| Polar | Sim — EUA | A Polar disponibiliza DPA e página de subprocessadores próprios; mecanismo concreto (DPF/CCT) a confirmar no contrato com a Polar |
| GitHub Actions | Sim — infraestrutura Microsoft/EUA | A confirmar, dependente da conclusão da secção 3 sobre se há dados pessoais envolvidos |

> **⚠️ Precisa de validação por advogado:** desde o acórdão *Schrems II* do TJUE, transferências para os EUA só são válidas com um mecanismo legal ativo e verificado (DPF, CCT, ou decisão de adequação). Não basta assumir que "a empresa é grande, deve estar coberta" — isto tem de ser confirmado fornecedor a fornecedor e documentado.

---

## 5. Direitos do titular dos dados

**Obrigatório por lei** informar os direitos e como exercê-los (RGPD art. 13º/2/b, arts. 15º a 22º).

Qualquer pessoa cujos dados tratamos tem direito a:

- **Acesso** — saber que dados temos sobre si
- **Retificação** — corrigir dados incorretos ou incompletos
- **Apagamento** ("direito ao esquecimento") — pedir a eliminação dos dados, quando aplicável
- **Limitação do tratamento** — restringir o uso dos dados em certas circunstâncias
- **Portabilidade** — receber os seus dados num formato estruturado e transferível
- **Oposição** — opor-se a determinados tratamentos (ex. marketing direto)

**Como exercer:** através do canal dedicado **[email de privacidade]**.

**Prazo de resposta:** um mês a contar da receção do pedido, prorrogável por mais dois meses em casos de necessidade justificada (comunicada ao titular).

*Fonte: CNPD (cnpd.pt/cidadaos/direitos/) — a CNPD indica explicitamente que o canal de exercício de direitos deve estar identificado na própria política e que o prazo padrão é de um mês, prorrogável.*

**Boa prática, não obrigatória:** um canal dedicado (`privacidade@` ou `rgpd@`) em vez do email geral de suporte — confirmado como padrão em várias políticas analisadas (InvoiceXpress, carVertical, JATO).

---

## 6. Direito de reclamação à CNPD

**Obrigatório por lei** (RGPD art. 13º/2/d) — e o material de investigação sublinha que esta é **uma das omissões mais comuns e mais facilmente fiscalizáveis** em políticas de privacidade portuguesas.

Sem prejuízo de qualquer outra via de recurso, tem o direito de apresentar reclamação junto da:

**Comissão Nacional de Proteção de Dados (CNPD)**
www.cnpd.pt

---

## 7. Encarregado de Proteção de Dados (EPD/DPO)

A designação de um Encarregado de Proteção de Dados só é **legalmente obrigatória** para entidades públicas, ou para entidades privadas que tratem categorias especiais de dados em larga escala, ou que façam controlo regular e sistemático de titulares em larga escala.

Com base no perfil descrito (SaaS B2B para stands automóveis, sem tratamento de categorias especiais de dados nem monitorização sistemática em larga escala), o AutoImport **não parece estar obrigado** a nomear um EPD.

> **⚠️ Precisa de validação por advogado:** esta é uma avaliação, não uma certeza — o princípio de responsabilização (*accountability*) do RGPD exige que esta conclusão seja **documentada internamente**, mesmo que a política pública não mencione um EPD. Não fazer essa avaliação por escrito é, em si, uma falha de conformidade.

*Fonte: CNPD (cnpd.pt/organizacoes/outras-obrigacoes/encarregado-de-protecao-de-dados/).*

---

## 8. Segurança dos dados

**Obrigatório por lei** (RGPD art. 32º) implementar medidas técnicas e organizativas adequadas ao risco. O material de investigação não cobre especificações técnicas próprias do AutoImport — não vou inventar uma lista de medidas de segurança concretas.

O que é seguro afirmar de forma genérica: o AutoImport aplica medidas técnicas e organizativas adequadas para proteger os dados contra acesso não autorizado, perda ou alteração.

**Em caso de violação de dados pessoais com risco para os titulares**, a lei obriga a notificar a CNPD no prazo de **72 horas** após ter conhecimento do incidente (RGPD art. 33º).

*Fonte: CNPD; confirmado como prazo standard em vários exemplos do material (Polar, InvoiceXpress).*

---

## 9. Alterações a esta política

Esta política pode ser atualizada. A data da última atualização é indicada no topo do documento. Alterações significativas serão comunicadas de forma adequada aos utilizadores.

*(Boa prática, confirmada em quase todos os exemplos do material: manter a data de "última atualização" visível e, idealmente, um histórico de versões anteriores acessível.)*

---

## 10. Cookies — a política do AutoImport tem de ter banner?

**Resposta direta: não, para já.**

O único cookie usado é o **cookie de sessão do Better Auth**, necessário para manter o utilizador autenticado. Este cookie cai, com alta probabilidade, na exceção do **art. 5º/2 da Lei 41/2004**: cookie estritamente necessário para prestar um serviço explicitamente pedido pelo utilizador (login). Cookies nesta categoria **não exigem consentimento prévio nem banner**.

Duas condições, no entanto:

1. **Mesmo isento de consentimento, o cookie tem de ser divulgado numa política de cookies** (nome, finalidade, duração) — a isenção cobre o *consentimento prévio*, não o *dever de transparência*. Não ter nenhuma página sobre cookies é, por si só, um risco de queixa à CNPD.
2. **Isto deixa de ser verdade no dia em que se adicionar qualquer cookie não essencial** — analytics (mesmo "anónimo", tipo Vercel Analytics em certos modos), pixels de marketing, chat de terceiros, mapas embutidos. Nesse momento passa a ser **obrigatório** um banner com consentimento prévio, granular, com botão "Rejeitar" tão visível como "Aceitar", sem caixas pré-marcadas e sem *cookie walls*.

*Fonte: material de investigação sobre CNPD e Lei 41/2004 aplicado especificamente a este cenário (Better Auth + AutoImport), incluindo a checklist de kukie.io e weblegal.ai sobre requisitos de banner e sanções (coimas de €5.000 a €5 milhões sob a Lei 41/2004; até €20 milhões ou 4% do volume de negócios sob o RGPD via Lei 58/2019).*

**Recomendação prática:** publicar já uma página curta de "Política de Cookies" (pode ser uma secção desta política ou um documento à parte) a listar o único cookie existente e a isenção aplicável. Isto é barato de fazer agora e evita ter de reconstruir tudo mais tarde quando se adicionar analytics.

---

## Resumo — o que é obrigatório por lei vs. boa prática

### Obrigatório por lei (não publicar sem isto)

- Identificação do responsável pelo tratamento (nome, NIPC, contacto) — RGPD art. 13º/1/a
- Finalidade e fundamento de licitude para cada tratamento — RGPD art. 6º e 13º/1/c
- Prazos de conservação ou critérios para os determinar — RGPD art. 13º/2/a
- Identificação de destinatários/subcontratados — RGPD art. 13º/1/e
- Transferências internacionais e mecanismo legal — RGPD art. 13º/1/f
- Direitos do titular e como exercê-los — RGPD art. 13º/2/b
- Direito de reclamação à CNPD — RGPD art. 13º/2/d
- Contratos de subcontratação (art. 28º) com Supabase, Vercel, Resend, Polar e GitHub Actions (internos, não públicos)
- Notificação de violações à CNPD em 72h — RGPD art. 33º
- Divulgação do cookie de sessão, mesmo isento de consentimento — Lei 41/2004
- Banner de consentimento **assim que** existir qualquer cookie não essencial

### Boa prática (recomendado, não obrigatório)

- Canal de privacidade dedicado (`privacidade@`) em vez do email geral
- Tabela de prazos de retenção por categoria de dado, em vez de fórmula vaga
- Nomear subcontratados pelo nome (Supabase, Vercel, etc.) em vez de "parceiros"
- Índice clicável no topo do documento
- Data de "última atualização" + histórico de versões anteriores
- Documentar internamente a avaliação de não-obrigatoriedade de EPD
- Registo de Atividades de Tratamento (RAT) interno, mesmo sendo pequena empresa

---

## O que precisa de validação por advogado antes de publicar

1. Qualificação exata dos dados do stand (NIF/morada/telefone) como dados pessoais em cada cenário (ENI vs. sociedade).
2. Prazos de conservação concretos para dados de conta (fora do prazo fiscal de 10 anos, que está bem fundamentado).
3. Confirmação da sede e mecanismo de transferência internacional da Resend.
4. Confirmação de se o GitHub Actions, no uso concreto do AutoImport, processa dados pessoais ou só dados fiscais/públicos.
5. Confirmação do mecanismo de transferência (DPF/CCT) aplicável com a Vercel e com a Polar.
6. Confirmação formal (documentada) de que o AutoImport não está obrigado a designar EPD.
7. Assinatura efetiva dos DPAs (art. 28º) com todos os subcontratados antes de tratar dados em produção.

---

*Documento preparado com base em investigação de mercado (políticas de concorrentes/referências do setor) e nas fontes legais citadas (RGPD, Lei 58/2019, Lei 41/2004, orientações da CNPD). Não substitui aconselhamento jurídico — os pontos assinalados com ⚠️ precisam de confirmação por advogado antes de publicação.*
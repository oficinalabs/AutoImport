# Plano de Entrega — Páginas Legais e de Suporte do AutoImport

---

## 1. Páginas a construir

Mínimo necessário — nada a mais. Segue a arquitetura já recomendada na spec de UX (route group `(legal)` + `/ajuda` fora dele).

| # | Rota | Título | Para que serve |
|---|---|---|---|
| 1 | `/legal/termos` | Termos de Serviço | Contrato principal: objeto, conta, obrigações, preço (remete para `/legal/subscricao`), rescisão, responsabilidade. É o documento que qualquer stand aceita no registo. |
| 2 | `/legal/uso-aceitavel` | Uso Aceitável | Regras de conduta (anti-scraping do próprio AutoImport, proibição de partilha de conta, uso apenas profissional). Separado dos Termos porque muda com mais frequência e é o espelho da secção 8 dos Termos. |
| 3 | `/legal/privacidade` | Política de Privacidade | RGPD — identificação do responsável, dados tratados, prazos, subcontratados, transferências, direitos. |
| 4 | `/legal/cookies` | Política de Cookies | Regime próprio (Lei 41/2004). Hoje é uma página curta: só o cookie de sessão do Better Auth. |
| 5 | `/legal/subscricao` | Subscrição e Reembolsos | Preço, ciclo de faturação, cancelamento self-service, política de reembolso. Separado porque é a secção com mais probabilidade de mudar (preço, garantia comercial) sem reabrir o contrato inteiro. |
| 6 | `/legal/termos/historico`, `/legal/privacidade/historico`, etc. | Histórico de alterações | Um por documento. Pode começar como lista vazia ("Versão 1 — 15 jul 2026") — o que importa é a rota existir desde o dia 1. |
| 7 | `/ajuda` | Perguntas Frequentes | Suporte, não contrato — fora do route group `(legal)`. Conteúdo no ponto 3 abaixo. |

Não construo: Termos B2C separados (produto é declaradamente B2B — ver decisão #1 na secção 6), página de "Sobre nós"/confiança dedicada (o material não dá conteúdo verificável para isso agora — seria promessa vazia), Livro de Reclamações Eletrónico embutido (é decisão pendente, ver secção 4).

---

## 2. Conteúdo de cada uma

### `/legal/termos`
Estrutura decidida (17 secções da síntese, sem alterar a ordem — é a sequência lógica padrão de mercado):

0. Identificação da Entidade e Data de Vigência — **placeholder** até dados legais reais
1. Objeto e Definições
2. Aceitação dos Termos
3. Natureza B2B do Serviço e Elegibilidade
4. Conta, Stand e Utilizadores Autorizados
5. Subscrição, Preço e Faturação *(remete em detalhe para `/legal/subscricao`)*
6. Renovação, Cancelamento e Reembolsos *(idem)*
7. Natureza dos Dados e das Estimativas — **secção com callout `<Disclaimer variant="estimativa">` dedicado**, não texto corrido
8. Uso Aceitável *(remete para `/legal/uso-aceitavel`)*
9. Propriedade Intelectual
10. Proteção de Dados Pessoais *(remete para `/legal/privacidade`)*
11. Limitação de Responsabilidade
12. Indemnização
13. Suspensão e Rescisão
14. Alterações aos Termos
15. Comunicações
16. Lei Aplicável, Foro e Resolução de Litígios
17. Disposições Finais

Justificação em 1 linha: esta ordem replica o padrão consistente dos concorrentes B2B analisados (Indicata, Autobiz, JATO) — definições e elegibilidade primeiro, dados/disclaimers a meio como secção-âncora, responsabilidade e foro no fim.

### `/legal/uso-aceitavel`
- O que é permitido (uso interno da atividade profissional do Stand)
- O que é proibido: scraping/crawling da plataforma, engenharia inversa, criação de bases derivadas, redistribuição comercial, partilha de credenciais fora do Stand
- Consequência do incumprimento: remete para secção 13 dos Termos (suspensão/rescisão)

Justificação: isolar isto permite atualizar regras de conduta técnica sem reabrir o contrato principal — é o padrão Apify/Vercel/Oxylabs citado na spec.

### `/legal/privacidade`
Estrutura decidida (segue a síntese RGPD tal como está, é a mais completa das cinco):

0. Quem somos — **placeholder** NIPC/morada
1. Que dados tratamos, para quê e com que fundamento (tabela: nome/email, dados do stand, cookie de sessão)
2. Prazos de conservação (tabela: 10 anos dados fiscais; resto por definir — ver decisão #4)
3. Com quem partilhamos os dados (Supabase, Vercel, Resend, Polar, GitHub Actions — nomeados, não "parceiros")
4. Transferências internacionais
5. Direitos do titular
6. Direito de reclamação à CNPD
7. Encarregado de Proteção de Dados (nota de não-obrigatoriedade)
8. Segurança dos dados
9. Alterações a esta política

Justificação: nomear subcontratados pelo nome (em vez de "parceiros") é boa prática confirmada em StandVirtual/OLX/InvoiceXpress e reduz risco de queixa CNPD por falta de transparência.

### `/legal/cookies`
Página curta, 4 blocos:
1. Que cookies usamos hoje (só sessão Better Auth)
2. Porque não pedimos consentimento para este cookie (isenção art. 5º/2 Lei 41/2004 — cookie estritamente necessário)
3. O que muda no dia em que adicionarmos analytics/marketing (banner obrigatório nessa altura)
4. Contacto

Justificação: é honesto e evita reconstruir tudo mais tarde — a própria síntese recomenda publicar isto já, é barato.

### `/legal/subscricao`
1. Preço (100€/mês + IVA)
2. Trial (primeiro mês, sem cartão de crédito no registo)
3. Faturação (mensal antecipada a partir do 2º mês, fatura com NIF do Stand)
4. Alteração de preço (aviso prévio — prazo a confirmar, ver decisão #3)
5. Cancelamento (self-service, um clique, sem contacto por email obrigatório)
6. Efeito do cancelamento (acesso até fim do período pago)
7. Reembolsos (política a decidir — ver decisão #2)
8. Suspensão por incumprimento de pagamento (suspende, não elimina de imediato)

Justificação: separar preço/cancelamento do contrato principal porque é o bloco que mais vai mudar operacionalmente (ex. mudar preço ou trial) — não vale a pena reabrir os Termos inteiros para isso.

### `/legal/*/historico`
Lista simples `{date, summary, url}` por documento, começa com a entrada da v1.

---

## 3. FAQ redigido (`/ajuda`)

Organizado por categoria, `<details>` nativo, uma pergunta = uma âncora. Perguntas com 🔒 têm texto provisório e **não podem ir para produção tal como está** sem revisão — estão marcadas para o ficares a saber, mas o texto abaixo é a versão a publicar já (evita frases de risco), não a versão final de cláusula jurídica.

### Como calculamos os valores

**De onde vêm os dados usados no cálculo?**
Cruzamos tabelas fiscais oficiais (ISV e IUC, tal como publicadas pela Autoridade Tributária) com referências de preços de mercado recolhidas de fontes públicas. Não replicamos anúncios completos de nenhuma plataforma concreta — o que entregamos é uma estimativa de custo, não uma cópia de um anúncio.

**O valor de ISV que me mostram é o valor oficial?**
Não. É a nossa melhor estimativa com base na lei em vigor no momento do cálculo. Não substitui a liquidação feita pela Alfândega/Autoridade Tributária no ato de matrícula. Confirme sempre o valor final antes de fechar negócio ou assumir compromissos com um cliente.

**Os preços de referência que mostram são garantidos?**
Não. São estimativas indicativas, tal como acontece com qualquer fornecedor sério de dados de mercado automóvel. Não garantimos que o preço apresentado é o preço que vai encontrar quando for negociar.

**E se o carro que aparece já tiver sido vendido?**
Pode acontecer — os nossos dados de mercado não são garantidamente em tempo real. O AutoImport serve para decidir se compensa procurar aquele tipo de carro naquele mercado, não é uma montra de stock disponível agora. Confirme sempre a disponibilidade diretamente com o vendedor antes de viajar ou adiantar dinheiro.

**Se eu importar um carro com base numa estimativa errada, a responsabilidade é do AutoImport?**
O AutoImport é uma ferramenta de apoio à decisão, não um serviço de aconselhamento fiscal vinculativo — a decisão final de importar é sempre do Stand. As condições exatas de responsabilidade estão descritas nos [Termos de Serviço](/legal/termos).

### Planos, preços e faturação

**Quanto custa usar o AutoImport?**
100€/mês + IVA. Detalhes completos em [Subscrição e Reembolsos](/legal/subscricao).

**Preciso de cartão de crédito para começar a experimentar?**
Não. O primeiro mês é gratuito e não pede cartão de crédito no registo — não há cobrança automática sem uma ação explícita sua para continuar.

**Há fidelização ou período mínimo de contrato?**
Não. É uma subscrição mensal, sem compromisso mínimo. Pode cancelar a qualquer momento.

**E se eu cancelar a meio do período pago?**
Mantém acesso até ao fim do período já pago; não há novas cobranças depois disso. Consulte a política de reembolso completa em [Subscrição e Reembolsos](/legal/subscricao).

### Conta e stands

**O AutoImport é só para stands ou também dá para uso pessoal?**
É feito para profissionais do setor automóvel (stands com atividade aberta), não para consumidores finais. Esta distinção está explícita nos [Termos de Serviço](/legal/termos), secção 3.

**Posso adicionar a minha equipa à conta?**
Ainda estamos a definir os detalhes exatos desta funcionalidade (quantos utilizadores, como gerir acessos). Se precisar disto já, contacte-nos.

**Quem vê os meus dados e os dos meus clientes?**
Só a equipa do AutoImport e os subcontratados estritamente necessários para o serviço funcionar (alojamento, faturação) — nunca vendemos nem partilhamos dados com concorrentes. Lista completa em [Política de Privacidade](/legal/privacidade).

**Posso apagar a minha conta e os meus dados?**
Sim — é um direito garantido pelo RGPD. Contacte-nos através do canal indicado na [Política de Privacidade](/legal/privacidade); respondemos até um mês.

### Garantia, responsabilidade e legalização

**Que garantia dão sobre os valores calculados?**
Nenhuma garantia de exatidão absoluta — é uma estimativa informativa, não aconselhamento fiscal vinculativo. É o mesmo princípio seguido pelos principais fornecedores de dados do setor automóvel: ferramenta de apoio à decisão, nunca substituto da confirmação oficial.

**Quem trata da legalização, homologação e registo no IMT?**
Isso não é feito pelo AutoImport. O Stand continua responsável por toda a legalização, homologação e registo do veículo junto do IMT/Alfândega — o AutoImport só calcula o custo estimado antes dessa decisão.

**E se a lei do ISV/IUC mudar depois de eu ter consultado o AutoImport?**
O valor pode deixar de ser válido. Atualizamos as tabelas fiscais assim que há alteração legislativa, mas pode existir desfasamento entre a mudança entrar em vigor e ser refletida na plataforma — confirme sempre antes de formalizar a importação.

---

**Perguntas que fico de fora do FAQ público por agora** (não há resposta honesta ainda, e uma resposta vaga é pior do que não ter a pergunta):
- "Funciona para carros comerciais/ligeiros de mercadorias?" — cobertura fiscal não confirmada.
- "De que países é possível importar?" — mercados de origem cobertos pelo motor de cálculo não confirmados.
- "Um carro importado tem a mesma garantia legal que um carro comprado em Portugal?" — envolve garantia de terceiro (vendedor final), risco de mal-entendido se publicado sem contexto.

Adicionar estas três só quando o produto/negócio tiver resposta concreta.

---

## 4. ⚠️ O que NÃO pode ir para o ar sem advogado

Sê direto: isto não é burocracia opcional, são as áreas com exposição financeira e legal real.

1. **Origem dos dados de mercado — o risco mais sério de todos.** Se o motor de cálculo recolhe preços de anúncios de marketplaces (AutoScout24, mobile.de, StandVirtual, etc.) por scraping direto, isso colide com jurisprudência europeia recente e desfavorável **especificamente no setor de anúncios automóveis** — La Centrale (100.000€, 2025), leboncoin/Entreparticuliers (70.000€ total), Innoweb/AutoTrack (TJUE). Ser pago e B2B **agrava** a exposição, não protege. Antes de publicar qualquer coisa que sugira ou descreva a metodologia de recolha, e antes de escalar a recolha de dados, isto precisa de parecer jurídico dedicado — é uma decisão de arquitetura de negócio (scraping vs. licenciamento vs. dados first-party dos stands), não uma questão de redação de página legal. Entretanto, o texto público mantém-se propositadamente genérico ("fontes públicas e de mercado") — nunca nomear as plataformas-fonte nem descrever o método técnico.
2. **Identificação legal da entidade** (denominação social, NIPC, sede) — falta em todo o lado (Termos secção 0, Privacidade secção 0, rodapé). É obrigação legal autónoma (DL 7/2004), não só boa prática.
3. **Se a declaração B2B basta para afastar retratação de 14 dias e Livro de Reclamações Eletrónico** quando o cliente é sócio-gerente em nome individual — o material é explicitamente ambíguo aqui.
4. **Texto final do disclaimer de estimativa (secção 7 dos Termos)** — é a cláusula com maior exposição financeira direta (decisões de compra de milhares de euros); exclusões de responsabilidade copiadas de direito estrangeiro não são automaticamente válidas em Portugal (Código Civil + DL 446/85).
5. **Teto de limitação de responsabilidade** (proposta: 12 meses de valor pago) e a ressalva obrigatória de dolo/negligência grosseira.
6. **Cláusula de indemnização unilateral** (Stand indemniza AutoImport) — avaliar se precisa de alguma reciprocidade em contexto de PME sem departamento jurídico.
7. **Redação da política de reembolso voluntária** (secção 6/`subscricao`) — tem de ser idêntica em Termos, página de subscrição e qualquer FAQ/site. Uma divergência aqui é o erro concreto identificado noutro SaaS PT (Termos dizem "sem reembolso", FAQ promete reembolso) — não replicar.
8. **Prazos de conservação de dados de conta** (fora do prazo fiscal de 10 anos, que está bem fundamentado) e confirmação de mecanismo de transferência internacional (DPF/CCT) com Vercel e Polar, e sede da Resend.
9. **Comarca/foro exato** consoante a sede formal real da entidade.
10. **Assinatura efetiva dos DPAs (art. 28º RGPD)** com Supabase, Vercel, Resend, Polar, GitHub Actions — obrigação, não opção, antes de tratar dados em produção.

---

## 5. O que falta ao produto para as páginas serem verdade

Se a página promete algo que o código não faz, é pior do que não ter a página.

| A página vai dizer | O código já faz isto? | O que falta |
|---|---|---|
| "Pode apagar a sua conta e os seus dados" (Privacidade, FAQ) | Não confirmado | Fluxo de eliminação de conta + processo real de apagar dados nos subcontratados (Supabase, Resend, etc.), não só desativar login |
| "Cancelamento self-service, um clique, sem contacto por email" (Subscrição secção 6) | Não confirmado | Botão de cancelamento na conta ligado ao Polar (billing), sem exigir email ao suporte |
| "Sem cobrança automática no fim do trial sem ação do cliente" (Subscrição secção 2) | Não confirmado | Confirmar que o Polar não ativa cobrança sem o cliente introduzir cartão + confirmar explicitamente |
| "Conta suspensa (não eliminada) em caso de incumprimento de pagamento, com janela para regularizar" (Termos secção 6/13) | Não confirmado | Estado "suspenso" distinto de "eliminado" no modelo de dados da conta, com lógica de grace period |
| "Pode adicionar utilizadores à sua equipa" — **NÃO vai à página ainda** | Não existe | Ficar de fora do FAQ/Termos até existir (já refletido no FAQ acima como "ainda a definir") |
| "Direito de acesso/portabilidade em até um mês" (Privacidade secção 5) | Não confirmado | Processo interno (mesmo manual) para responder a pedidos RGPD dentro do prazo |
| "Histórico de versões dos documentos legais acessível" | Não existe | Rota `/legal/*/historico` com pelo menos a entrada da v1 — é trivial, fazer já |
| "Notificação de alterações de preço/Termos com aviso prévio" | Não confirmado | Mecanismo de email para clientes ativos quando o preço ou Termos mudarem materialmente |
| "Fatura emitida com NIF do Stand" (Subscrição secção 3) | Depende da integração Polar/faturação | Confirmar que o Polar (ou sistema de faturação) captura e emite com NIF português corretamente |

---

## 6. Decisões que o dono tem de tomar

1. **Um único conjunto de Termos B2B, ou também cobrir o caso do sócio-gerente em nome individual como pessoa física?**
   *Recomendação:* manter um único documento B2B com cláusula de elegibilidade explícita (secção 3), mas validar com advogado se isto basta para afastar retratação/RAL quando o titular da conta é ENI — não inventar uma segunda via de Termos sem essa confirmação.

2. **Existe garantia de reembolso voluntária, e com que prazo (7, 15, 30 dias)?**
   *Recomendação:* 14 dias, alinhado ao período de retratação de consumidor (embora não obrigatório em B2B, é um número que qualquer cliente reconhece e que evita a acusação de estar a jogar contra a expectativa do cliente). Tem de ficar idêntico em Termos, `/legal/subscricao` e qualquer copy de marketing.

3. **Qual o prazo de pré-aviso para alterações de preço e de Termos — 15 ou 30 dias?**
   *Recomendação:* 30 dias, com direito de cancelamento sem penalização durante essa janela. É o padrão mais defensável dos exemplos analisados (InvoiceXpress, Carvago) e para uma base de clientes pequena o custo operacional de dar mais aviso é baixo.

4. **Prazo de conservação dos dados de conta após cancelamento — quanto tempo ficam guardados antes de eliminação definitiva?**
   *Recomendação:* 90 dias após o fim da subscrição (permite reativação fácil sem reter dados indefinidamente); a CNPD penaliza especificamente a ausência de um número concreto aqui, por isso não deixar como "enquanto for necessário".

5. **Livro de Reclamações Eletrónico — incluir no rodapé por precaução, apesar do modelo ser B2B?**
   *Recomendação:* incluir. O custo de ter é baixo (um link/selo no rodapé), o risco de não ter é uma ambiguidade legal não resolvida (a lei não distingue claramente B2B/B2C aqui). Não vale a pena arriscar por um selo no rodapé.

6. **Origem dos dados de mercado — scraping direto, dados first-party dos stands, ou licenciamento?**
   *Recomendação:* não é uma decisão para decidir em paralelo com as páginas legais — é anterior a elas. Enquanto não houver decisão de arquitetura de dados com apoio jurídico dedicado, as páginas públicas mantêm-se deliberadamente genéricas ("fontes públicas e de mercado") e o produto não deve escalar para recolha sistemática de nenhum marketplace concreto.

7. **Canal de contacto legal — `legal@autoimport.pt` genérico, ou separar `privacidade@` de `legal@`?**
   *Recomendação:* separar. `privacidade@` para pedidos RGPD (é o padrão de mercado e simplifica o SLA de resposta a 1 mês), `legal@` para o resto (Termos, dúvidas contratuais).

8. **Teto de limitação de responsabilidade — 12 meses de valor pago, ou outro número?**
   *Recomendação:* 12 meses, é o valor mais recorrente e mais fácil de justificar nos exemplos analisados — mas a redação final da ressalva de dolo/negligência grosseira precisa mesmo de advogado antes de publicar.
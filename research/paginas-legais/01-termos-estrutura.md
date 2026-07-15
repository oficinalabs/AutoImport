# Termos e Condições — AutoImport

*Estrutura de secções, com o que cada uma deve conter (não é texto legal redigido — são instruções de conteúdo para depois serem juridicamente redigidas).*

**Nota de leitura sobre este documento:** cada secção indica (a) o que deve dizer, (b) em que padrão do dossier de investigação se baseia, e (c) se precisa de validação por advogado antes de publicar ou se é seguro escrever com base no material. Onde a investigação não cobre algo, digo-o explicitamente em vez de inventar.

---

## Índice (recomendado incluir no topo do documento)

Prática recomendada por vários concorrentes (mobile.de, leboncoin, StandVirtual, Marktplaats) é ter um índice clicável no topo — a maioria dos sites analisados falha nisto e o próprio dossier assinala isso como má prática a evitar. Com 17 secções, o AutoImport deve ter índice com âncoras.

---

## 0. Identificação da Entidade e Data de Vigência

**Conteúdo:**
- Denominação social completa, NIF, sede e contactos do prestador do serviço (AutoImport / entidade Aresta).
- Data de entrada em vigor e nº de versão do documento.
- Link para versões anteriores (boa prática identificada em mobile.de e leboncoin — mantêm histórico de versões acessível publicamente).

**⚠️ Precisa de validação/preenchimento:** a identificação legal exata (denominação social, NIF, sede) não consta da investigação — tem de vir do registo comercial real da entidade. Isto é também obrigação legal autónoma (DL 7/2004, comércio eletrónico) independentemente do conteúdo dos Termos em si.

---

## 1. Objeto e Definições

**Conteúdo:**
- O que é o AutoImport: ferramenta de informação/apoio à decisão que calcula estimativas de custo real de importação de veículos (ISV, IUC e custos associados) para stands automóveis em Portugal.
- Definir os termos usados ao longo do documento: "Serviço", "Conta", "Stand"/"Cliente", "Utilizador", "Subscrição", "Estimativa", "Conteúdo".
- Deixar claro desde já que o AutoImport **não é** parte na compra/venda ou importação do veículo — é apenas uma ferramenta de informação usada pelo stand para decidir.

**Fonte:** padrão de bloco de definições no arranque do contrato, usado por praticamente todos os SaaS B2B analisados (Indicata, JATO, Autobiz, AUTO1, Jasmin/Primavera). A separação "prestador de ferramenta de informação" vs. "parte na transação" replica Carwow ("Carwow as a marketplace: general terms" — não é parte na transação) e StandVirtual (desresponsabilização como intermediário técnico).

**✅ Seguro escrever já.**

---

## 2. Aceitação dos Termos

**Conteúdo:**
- O uso da plataforma implica aceitação integral destes Termos.
- Aceitação explícita (clique/checkbox) no momento do registo, não apenas "acesso implícito" — mais defensável juridicamente do que termos meramente disponíveis no rodapé.
- Referência a documentos incorporados por remissão: Política de Privacidade, Política de Cookies (documentos separados, não redigidos aqui).

**Fonte:** exigência de aceitação explícita (checkbox) no ponto de conversão é uma prática destacada da La Centrale/leboncoin; a validade de cláusulas anti-scraping/vinculação contratual depender de um mecanismo real de aceitação (não bastar estar "disponível no site") é referida a propósito da jurisprudência holandesa Ryanair citada no dossier Marktplaats/AutoTrack.

**✅ Seguro escrever já.**

---

## 3. Natureza B2B do Serviço e Elegibilidade

**Conteúdo:**
- Declaração explícita: o AutoImport é um serviço **exclusivamente B2B**, destinado a profissionais do setor automóvel (stands com atividade aberta, NIPC válido) a agir no âmbito da sua atividade profissional — não a consumidores finais.
- O cliente declara e garante, no registo, que atua como profissional (não como particular).
- A empresa reserva-se o direito de recusar ou cancelar registos que não cumpram este critério, sem necessidade de justificação detalhada.
- Pedir NIF/comprovativo de atividade no registo como mecanismo de verificação.

**Por que isto muda as obrigações (nota B2B explícita a incluir no documento):**
- **Direito de retratação de 14 dias (DL 24/2014):** aplica-se apenas a consumidores em contratos à distância. Ao declarar-se expressamente B2B e ao confirmar que o cliente contrata no âmbito da sua atividade profissional, este direito não se aplica por lei — mas **não impede** o AutoImport de oferecer uma política de reembolso voluntária (ver secção 6).
- **Cláusulas de limitação de responsabilidade** têm mais liberdade contratual em B2B do que em B2C, mas **não ficam totalmente livres**: o regime das cláusulas contratuais gerais (DL 446/85) continua a aplicar-se sempre que o contrato não é negociado individualmente cláusula a cláusula (contrato de adesão) — e a maioria dos SaaS por subscrição são exactamente isso, mesmo entre empresas.
- **Livro de Reclamações Eletrónico e entidades RAL:** a obrigatoriedade não é claramente afastada só por o cliente ser uma empresa — a lei fala em "contacto com o público", não distingue claramente B2B/B2C. Recomenda-se manter por precaução.

**Fonte:** padrão de gate B2B explícito no registo replicado de OPENLANE ("registration restricted to professionals and recognized car dealers, right to refuse registration"), AUTO1 ("profissionais registados e validados"), Autobiz, Eurotax B2B contract ("§13 BGB — exclusão explícita de consumidores"). A distinção de obrigações legais B2B vs B2C (retratação, RAL) está descrita transversalmente no dossier (StandVirtual, CustoJusto, Carvago, ComparaJá, e nota dedicada sobre DL 7/2004 / DL 156/2005 e Livro de Reclamações).

**⚠️ Precisa de validação por advogado:**
- Confirmar se a natureza B2B basta para afastar a obrigatoriedade do Livro de Reclamações Eletrónico, ou se deve manter-se por precaução (o próprio dossier admite ambiguidade legal aqui).
- Confirmar até que ponto o DL 446/85 (cláusulas contratuais gerais) limita cláusulas de limitação de responsabilidade e de alteração unilateral nestes Termos, dado que é um contrato de adesão a múltiplos stands.

---

## 4. Conta, Stand e Utilizadores Autorizados (Multi-Tenant)

**Conteúdo:**
- Cada Conta está associada a um Stand (pessoa coletiva/NIPC), não a um indivíduo.
- O Stand designa um utilizador administrador responsável pela conta; pode (dependendo do plano) adicionar utilizadores adicionais associados ao mesmo Stand.
- O Stand é responsável por toda a atividade realizada através da sua Conta, incluindo por utilizadores que autorizou.
- Obrigação de manter credenciais seguras e notificar imediatamente qualquer uso não autorizado.
- Proibição de partilhar uma única conta entre várias empresas/stands distintos (uma conta = um NIPC).
- O AutoImport pode pedir prova de titularidade/atividade do Stand a qualquer momento.

**Fonte:** o conceito de "restrições de uso ligadas a utilizadores autorizados, apenas para fins internos do negócio do cliente" está em vAuto e JATO; a separação Conta pessoal vs. Conta organizacional com admin responsável está descrita a propósito do Notion (Personal Workspace vs Organizational Workspace) como referência estrutural, não como cópia direta.

**Não coberto pela investigação:** a mecânica exata de gestão de assentos/seats (quantos utilizadores por plano, remoção de acesso ao sair um funcionário) não aparece detalhada em nenhuma fonte do dossier de forma replicável — é uma decisão de produto do AutoImport, não um padrão de mercado identificado.

**✅ Seguro escrever já** (na parte de responsabilização do Stand pela conta); **decisão de produto em aberto** na parte de gestão de assentos.

---

## 5. Subscrição, Preço e Faturação

**Conteúdo:**
- Preço: 100€/mês + IVA à taxa legal em vigor.
- Primeiro mês gratuito, sem necessidade de cartão de crédito no registo — deixar explícito que não há cobrança automática no fim do trial sem ação do cliente (isto é uma decisão de produto que **reduz** risco legal de "subscription trap", tema sinalizado como problema noutros SaaS PT analisados).
- Faturação mensal antecipada a partir do 2º mês, para quem decidir continuar.
- Emissão de fatura com NIF do Stand, nos termos da legislação fiscal portuguesa em vigor.
- Direito de a empresa alterar o preço no futuro, com aviso prévio ao cliente (definir prazo, ex. 30 dias) antes de a alteração ser aplicada — o cliente pode cancelar sem penalização se não aceitar a subida.

**Fonte:** o padrão "trial sem cartão de crédito + subscrição só ativada após decisão explícita do cliente" é a antítese do problema identificado em InvoiceXpress (assinar é fácil online, mas desligar a renovação automática só por email — apontado no dossier como risco de prática comercial desleal). O aviso prévio de alteração de preço com direito de saída está em Marktplaats, Moloni (implícito) e Autobiz. Faturação com NIF é prática transversal (Moloni, Vendus, InvoiceXpress).

**Não coberto pela investigação:** regras de proration em caso de upgrade/downgrade a meio de ciclo — nenhuma fonte do dossier detalha isto de forma aplicável ao modelo simples de plano único do AutoImport; decisão de produto.

**✅ Seguro escrever já.**

---

## 6. Renovação, Cancelamento e Reembolsos

**Conteúdo:**
- Renovação automática mensal, salvo cancelamento pelo cliente antes da data de renovação.
- Cancelamento **self-service, online, a qualquer momento, com um clique** — sem obrigar a contacto por email. Isto é uma decisão deliberada de UX/legal: o dossier assinala repetidamente (InvoiceXpress) que assimetria entre "assinar fácil online" e "cancelar só por email ao suporte" é vista como prática comercial desleal potencialmente sinalizável.
- Efeito do cancelamento: acesso mantido até ao fim do período já pago; sem novas cobranças depois disso.
- Sem período de fidelização — mensal, sem compromisso mínimo (alinhado com o mercado SaaS PT B2B analisado).
- Política de reembolso: como o AutoImport é B2B, **não existe direito legal de retratação de 14 dias** (secção 3) — mas decidir se o AutoImport oferece uma garantia comercial voluntária (ex. reembolso dentro de X dias após primeira cobrança, seguindo modelo CARFAX "30 day money back" ou Vendus) é uma decisão de negócio, não uma obrigação legal.
- Suspensão por incumprimento de pagamento: **suspender o acesso, não eliminar a conta/dados de imediato** — dar uma janela para regularizar e/ou exportar dados antes de qualquer eliminação definitiva.

**Fonte:** cancelamento self-service simétrico é lição extraída diretamente da falha identificada na InvoiceXpress. Suspensão-antes-de-eliminação é o modelo Moloni (conta suspensa fica em modo consulta/exportação, não é eliminada). Ausência de fidelização como argumento comercial está em Vendus e InvoiceXpress ("sem fidelização" como diferenciador).

**⚠️ Precisa de validação por advogado:** confirmar que a cláusula "sem reembolso, salvo garantia comercial X dias" não colide com nenhuma norma de proteção adicional aplicável (mesmo em B2B) e que o texto da garantia voluntária, se existir, é redigido de forma vinculativa e sem contradizer o que for comunicado no site/FAQ — o dossier assinala como erro concreto (InvoiceXpress) a divergência entre "Termos dizem sem reembolsos" e "FAQ promete reembolso" — **não replicar essa inconsistência**.

---

## 7. Natureza dos Dados e das Estimativas — Avisos Importantes

*(Secção central do documento — é a que mais protege o negócio.)*

**Conteúdo, em blocos separados e visíveis (não escondidos a meio de texto genérico):**

**7.1. As estimativas são estimativas, não valores garantidos.**
- Os valores de ISV, IUC e custo total de importação apresentados são **cálculos estimativos** com base em fórmulas fiscais e dados públicos disponíveis no momento do cálculo.
- O AutoImport não garante que o valor final liquidado pela Autoridade Tributária corresponde ao valor estimado.
- Recomenda-se sempre confirmação junto da Autoridade Tributária/entidade competente antes de formalizar qualquer decisão de importação com base na estimativa.

**7.2. As tabelas e fórmulas fiscais podem mudar.**
- A legislação de ISV/IUC está sujeita a alteração (Orçamento de Estado, portarias, atualizações administrativas).
- O AutoImport atualiza as suas fórmulas com base em fontes oficiais publicadas, mas pode existir desfasamento temporal entre uma alteração legislativa entrar em vigor e ser refletida na plataforma.

**7.3. Os dados de mercado (preços de referência) são indicativos.**
- Os preços de mercado apresentados resultam de agregação de dados públicos disponíveis, e podem estar desatualizados, incorretos, ou já não corresponder a um veículo que entretanto foi vendido.
- O AutoImport não verifica individualmente cada anúncio/preço de origem nem garante a sua exatidão, disponibilidade ou atualidade.

**7.4. Não é aconselhamento fiscal, jurídico ou de investimento.**
- A informação fornecida é de carácter geral e não substitui aconselhamento fiscal, jurídico ou financeiro personalizado por um profissional habilitado.
- A decisão de compra/importação de um veículo é sempre do Stand, tomada sob sua exclusiva responsabilidade.

**7.5. O AutoImport não é parte na transação de compra/importação.**
- O AutoImport não intervém, não garante e não é responsável pela transação de compra do veículo, pelo seu estado, pela sua legalidade de importação, nem pelo cumprimento de prazos administrativos/aduaneiros pelo Stand.

**Fonte (este é o bloco mais bem coberto pelo dossier — múltiplas fontes convergentes):**
- "Guiding indications only" — modelo direto de Eurotax/Autovista para avaliações automóveis.
- Disclaimer de dados de terceiros e "risco do investimento" transferido para o cliente — Autobiz, JATO ("Third Party Data" não verificado/moderado), Indicata ("compiled from third-party sources... does not moderate or verify"), Cap HPI/HPI.
- "Ferramenta adicional de informação, não deve ser base única de decisão" — carVertical, secção 5 dos seus Termos.
- Gap temporal entre evento real e atualização de dados — CARFAX ("data may not reflect the most recent legislation/events").
- Disclaimer explícito de que a ferramenta não é serviço de referência/aconselhamento e não recomenda nem endossa transações — vAuto, secção "Disclaimer" (secção 19).
- Não substitui aconselhamento personalizado, consultar profissional — padrão do doutorfinancas.pt embutido junto ao próprio conteúdo/ferramenta, não apenas na página legal.
- Não ser parte na transação — Carwow ("Carwow as a marketplace: general terms" / "Do not rely on information on these sites"), StandVirtual (desresponsabilização como intermediário técnico).

**✅ Seguro escrever já** com base neste padrão de mercado consistente — mas **⚠️ recomenda-se revisão final por advogado** porque é a cláusula com maior exposição financeira real (decisões de compra de milhares de euros), e o dossier nota explicitamente (a propósito da Eurotax) que exclusões de responsabilidade "as-is" copiadas de direito estrangeiro (alemão/UK) não são automaticamente válidas em Portugal — precisam de ser redigidas à luz do Código Civil e do DL 446/85.

---

## 8. Uso Aceitável e Obrigações do Cliente

**Conteúdo:**
- O Stand compromete-se a usar a plataforma apenas para fins internos da sua atividade profissional (não para revenda de acesso, não para prestar o mesmo serviço a terceiros).
- Proibição expressa de: extração automatizada (scraping, bots, crawlers) da plataforma ou dos seus resultados; engenharia inversa; criação de bases de dados derivadas a partir dos cálculos/dados do AutoImport; redistribuição comercial dos relatórios/estimativas a terceiros sem autorização.
- Proibição de partilhar credenciais fora da própria empresa/Stand.
- O AutoImport pode monitorizar uso para deteção de abuso (sem necessidade de o descrever em detalhe técnico no documento legal).

**Fonte:** cláusula anti-scraping/anti-redistribuição dos próprios dados do fornecedor é praticamente universal em SaaS de dados B2B analisados — Indicata ("no data mining, no scraping"), JATO ("No data mining" + reserva de direitos ao abrigo da Diretiva 2019/790), Autobiz, Eurotax ("Prohibited use" — proíbe criar bases de dados derivadas). Dado que o valor central do AutoImport é precisamente a agregação de dados calculados, esta cláusula é diretamente relevante e replica a lição do próprio dossier: "o AutoImport deve proteger os seus próprios dados agregados tal como as suas fontes protegem os deles."

**✅ Seguro escrever já.**

---

## 9. Propriedade Intelectual

**Conteúdo:**
- Todo o software, marca, design, metodologia de cálculo e dados agregados/tratados pertencem ao AutoImport.
- O Stand recebe apenas uma licença de uso, não exclusiva, intransmissível, limitada à duração da subscrição e ao uso previsto nestes Termos — não adquire propriedade sobre a plataforma nem sobre os dados agregados.
- Conteúdo que o próprio Stand insira na plataforma (se aplicável — ex. dados do seu inventário) permanece propriedade do Stand, mas este concede ao AutoImport uma licença para o processar na medida necessária à prestação do serviço.
- Feedback dado pelo Stand pode ser usado livremente pelo AutoImport para melhorar o serviço (cláusula comum, mas marcar como devendo ser proporcional — não uma cessão total gratuita e irrevogável sem qualquer limite, para não ser vista como cláusula-surpresa desproporcionada).

**Fonte:** modelo "licença de uso, não propriedade" replicado de Indicata, Autobiz, Eurotax; cláusula de feedback está em Notion (embora ali seja mais agressiva — cessão total sem compensação — o dossier recomenda moderar isto).

**✅ Seguro escrever já.**

---

## 10. Proteção de Dados Pessoais

**Conteúdo:**
- Remissão para a Política de Privacidade (documento separado, fora do âmbito desta tarefa).
- Nota de que o AutoImport atua como responsável pelo tratamento dos dados de conta/contacto do Stand, e eventualmente como subcontratante relativamente a dados que o Stand insira sobre os seus próprios clientes finais (se aplicável ao modelo de produto).
- Referência à CNPD como autoridade de controlo competente em Portugal.

**Fonte:** distinção responsável/subcontratante replicada de InvoiceXpress e Indicata; CNPD como autoridade de controlo referida transversalmente (CNPD, StandVirtual, olx.pt).

**Não coberto por esta tarefa:** o conteúdo integral da Política de Privacidade está fora do âmbito ("O teu tema: Termos e Condições") — aqui só entra a remissão.

**✅ Seguro escrever já** (a remissão); a política em si é tema à parte.

---

## 11. Limitação de Responsabilidade

**Conteúdo:**
- Exclusão de responsabilidade por danos indiretos, lucros cessantes, perda de negócio ou de oportunidade decorrentes do uso da plataforma ou de decisões de compra/importação tomadas com base nas estimativas.
- Teto de responsabilidade: limitar o valor total de qualquer indemnização ao montante pago pelo Stand nos últimos 12 meses de subscrição.
- Ressalva obrigatória por lei portuguesa: a limitação **não se aplica** em caso de dolo ou negligência grosseira do AutoImport, nem nos casos em que a lei não permite exclusão de responsabilidade (ex. danos pessoais).
- Cláusula específica: o AutoImport não garante a exatidão de dados de origem externa (tabelas fiscais oficiais, preços de mercado agregados de terceiros) — remete para a secção 7.

**Fonte:** teto de 12 meses de valor pago é o padrão mais comum e mais defensável entre os concorrentes analisados (CARFAX, Autobiz, Indicata, vAuto, JATO — nalguns casos 6 meses/50%, mas 12 meses é o valor mais recorrente e mais fácil de justificar). A ressalva de dolo/negligência grosseira como limite obrigatório está assinalada expressamente a propósito de InvoiceXpress e Primavera/Jasmin, que usam a fórmula "exceto em caso de dolo ou culpa grave" por ser a única forma válida em direito português de ter uma exclusão ampla.

**⚠️ Precisa de validação por advogado:** o valor exato do teto (12 meses vs. outro valor) e a redação da ressalva de dolo/negligência grosseira devem ser confirmados à luz do Código Civil português e do DL 446/85 — o dossier alerta repetidamente que cláusulas de limitação copiadas de direito estrangeiro (alemão, inglês, americano) não são automaticamente válidas em Portugal.

---

## 12. Indemnização

**Conteúdo:**
- O Stand compromete-se a indemnizar o AutoImport por reclamações de terceiros resultantes de: uso indevido da plataforma, violação destes Termos, ou decisões de negócio tomadas pelo Stand com base nas estimativas fornecidas.

**Fonte:** cláusula de indemnização unilateral (cliente indemniza o fornecedor, não o inverso) é padrão comum em SaaS B2B — Apify, ScrapingBee, Oxylabs, SerpApi, Octoparse (todos no contexto de ferramentas que processam/entregam dados de terceiros).

**⚠️ Precisa de validação por advogado:** o dossier nota (a propósito da Vercel) que cláusulas de indemnização puramente unilaterais podem ser vistas como desequilibradas em contexto B2B PME português — avaliar se compensa alguma reciprocidade parcial.

---

## 13. Suspensão e Rescisão

**Conteúdo:**
- O AutoImport pode suspender ou terminar o acesso do Stand em caso de: incumprimento destes Termos, incumprimento de pagamento, suspeita razoável de uso fraudulento/abusivo (incluindo scraping ou partilha de conta fora do permitido), ou por exigência legal.
- Suspensão por falta de pagamento: acesso suspenso (não eliminado) com janela para regularização.
- Rescisão pelo Stand: a qualquer momento, através do mecanismo de cancelamento self-service (secção 6).
- Rescisão pelo AutoImport sem justa causa: com aviso prévio (definir prazo razoável, ex. 30 dias).
- Efeitos da cessação: acesso à conta cessa; possibilidade de exportar dados próprios do Stand durante um período limitado após a cessação, antes de eliminação definitiva.

**Fonte:** modelo de suspensão gradual antes de eliminação, com janela de exportação de dados, replicado de Moloni e Primavera/Jasmin (acesso temporário gratuito só para exportar dados antes de perder acesso).

**✅ Seguro escrever já.**

---

## 14. Alterações aos Termos

**Conteúdo:**
- O AutoImport pode alterar estes Termos a qualquer momento.
- Alterações materialmente desfavoráveis ao cliente devem ser comunicadas com aviso prévio razoável (definir prazo, ex. 15-30 dias) antes de entrarem em vigor.
- Uso continuado da plataforma após a alteração entrar em vigor implica aceitação — mas o Stand deve poder cancelar sem penalização se não concordar com a alteração, durante a janela de aviso.
- Manter versões anteriores acessíveis publicamente (boa prática de transparência).

**Fonte:** prazos de pré-aviso de 15-30 dias são o padrão mais comum nos SaaS PT analisados (olx.pt exige 15 dias mínimo, exceto ameaça iminente; CustoJusto diferencia prazos para profissionais vs. particulares). Manter histórico de versões visível é prática de mobile.de e leboncoin.

**✅ Seguro escrever já.**

---

## 15. Comunicações

**Conteúdo:**
- Comunicações relevantes (alterações de preço, suspensão, alterações aos Termos) feitas por email para o endereço registado na conta e/ou notificação dentro da própria plataforma.
- Responsabilidade do Stand por manter os seus dados de contacto atualizados.

**Fonte:** prática comum e não controversa em todo o dossier (InvoiceXpress, Vercel, etc.).

**✅ Seguro escrever já.**

---

## 16. Lei Aplicável, Foro e Resolução de Litígios

**Conteúdo:**
- Lei portuguesa aplicável.
- Foro competente: comarca da sede do AutoImport (definir qual, consoante local de constituição da empresa).
- Referência a mecanismos de resolução alternativa de litígios (RAL) e Livro de Reclamações Eletrónico, por precaução (ver secção 3).

**Por que Portugal e não outra jurisdição (nota a incluir/decidir conscientemente):** múltiplos concorrentes internacionais analisados impõem lei e foro estrangeiros mesmo a clientes portugueses (AUTO1 → Berlim; OPENLANE, Autorola → variam; mobile.de → Potsdam) — o dossier assinala isto explicitamente como hostil e dissuasor para uma PME portuguesa cliente, e recomenda que o AutoImport faça o oposto: lei e foro portugueses, para transmitir confiança ao seu público-alvo (stands PT).

**Fonte:** lei e foro portugueses são o padrão de todos os SaaS PT analisados (InvoiceXpress, Vendus, Moloni, doutorfinancas, comparaja — este último com a lacuna notada de nem sequer ter esta cláusula, erro a não replicar). Foro em comarca de Lisboa aparece em vários exemplos (PiscaPisca, InvoiceXpress, doutorfinancas) mas não é uma regra obrigatória — depende da sede real da empresa.

**⚠️ Precisa de validação por advogado:** confirmar comarca exata competente consoante a sede formal da entidade, e confirmar definitivamente a questão do Livro de Reclamações/RAL levantada na secção 3.

---

## 17. Disposições Finais

**Conteúdo:**
- Se alguma cláusula for considerada inválida, as restantes mantêm-se em vigor (cláusula de divisibilidade).
- Estes Termos, juntamente com a Política de Privacidade e a Política de Cookies, constituem o acordo integral entre as partes.
- Proibição de cessão da posição contratual pelo Stand sem autorização prévia do AutoImport.
- Título do documento e idioma vinculativo: português (relevante só se o AutoImport vier a operar multi-idioma no futuro).

**Fonte:** cláusulas standard presentes em praticamente todos os contratos analisados (Indicata, Autobiz, Jasmin/Primavera, JATO).

**✅ Seguro escrever já.**

---

## Resumo — o que precisa de advogado antes de publicar

| Secção | O que validar |
|---|---|
| 3. Natureza B2B | Se afasta mesmo a obrigatoriedade do Livro de Reclamações Eletrónico / RAL |
| 6. Cancelamento/Reembolsos | Redação final da política de reembolso voluntária, para não contradizer o que se comunica no site/FAQ |
| 7. Disclaimers de dados | Revisão final da linguagem de exclusão de garantia à luz do Código Civil e DL 446/85 (é a cláusula com maior exposição financeira real) |
| 11. Limitação de responsabilidade | Valor do teto e redação da ressalva de dolo/negligência grosseira |
| 12. Indemnização | Se compensa alguma reciprocidade, dado ser B2B com PMEs sem departamento jurídico |
| 16. Foro/Lei | Comarca exata competente e confirmação final da questão RAL |
| 0. Identificação | Preenchimento dos dados legais reais da entidade |

## O que já é seguro escrever com base no material

Objeto, aceitação, elegibilidade B2B, estrutura de conta/multi-tenant, mecânica de subscrição e preço, estrutura de cancelamento self-service, todo o bloco de disclaimers de dados (conteúdo, não a redação jurídica final), uso aceitável, propriedade intelectual, remissão de privacidade, suspensão/rescisão, alterações aos termos, comunicações, disposições finais.

## O que a investigação não cobre (não inventado)

- Mecânica exata de assentos/utilizadores múltiplos por conta (quantos, como remover acesso).
- Regras de proration em upgrade/downgrade — não há plano múltiplo referido, é decisão de produto.
- Texto exato e prazo da eventual garantia de reembolso voluntária — nenhuma fonte dá um número "certo", é escolha de negócio dentro do intervalo observado no mercado (7 a 30 dias, consoante o concorrente).
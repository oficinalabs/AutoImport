# Origem dos Dados e Risco de Scraping — AutoImport

**Nota de enquadramento:** este é o tema mais perigoso dos que foram investigados. Não há forma de o suavizar sem mentir ao dono do produto — por isso este documento não suaviza. Tudo o que está marcado como **[VALIDAR COM ADVOGADO]** é isso mesmo: uma leitura minha do material, não um parecer jurídico.

---

## 1. O que os Termos dos marketplaces PROÍBEM, concretamente

Todos os marketplaces automóveis analisados (AutoScout24, mobile.de, StandVirtual/OLX, CustoJusto, PiscaPisca, La Centrale, leboncoin, Marktplaats/AutoTrack, Coches.net) têm cláusulas anti-scraping explícitas. Não é uma zona cinzenta interpretativa — é proibição escrita, em três camadas que se repetem site a site:

**a) Proibição do ato técnico.** Todos proíbem nomeadamente "robots", "crawlers", "spiders", "scraping", "data mining", "consultas automatizadas" ou "contornar a máscara de pesquisa" (linguagem literal do AutoScout24 §8, mobile.de Art. 11, Marktplaats, Coches.net). Alguns (Coches.net) redigem a proibição de forma tecnologicamente aberta — "extracción... u otras técnicas vigentes en cada momento" — precisamente para não deixar brechas a métodos futuros.

**b) Proibição do uso subsequente**, mesmo que os dados tenham sido obtidos sem bot (ex. copiados manualmente em escala). AutoScout24 §8 proíbe explicitamente usar dados obtidos por consulta para "construir uma base de dados própria", para "exploração comercial de dados" ou para "prestação de informação a terceiros". mobile.de Art. 2.5 vai mais longe: mesmo o conteúdo que parece "público" (um anúncio) está sob licença que só a plataforma pode redistribuir — o vendedor cedeu direitos à mobile.de, não ao mundo. StandVirtual proíbe "download, agregação ou processamento repetido e sistemático de dados". OLX tem uma cláusula equivalente (2.6) sem sequer usar a palavra "scraping".

**c) Proibição de "ligar/interligar" bases de dados**, isto é, cruzar dados do marketplace com dados de outras fontes — que é literalmente o que o AutoImport faria ao cruzar preço de anúncio com cálculo de ISV/IUC.

Isto não é fricção contratual menor: é a invocação direta do **direito sui generis de bases de dados** da Diretiva 96/9/CE, transposta em Portugal pelo **DL 122/2000**. Este direito protege quem fez um "investimento substancial" a obter, verificar ou apresentar o conteúdo de uma base de dados — mesmo sem direitos de autor sobre os dados individuais em si. Dura 15 anos e renova-se sempre que há atualização substancial (ou seja, um marketplace atualizado diariamente está, na prática, protegido para sempre).

**O que a jurisprudência do TJUE diz sobre isto** (fonte primária, não interpretação secundária):
- **Innoweb v Wegener/AutoTrack** (C-202/12): um motor de meta-busca que consultava o site-alvo em tempo real, sem nunca copiar/armazenar dados, foi condenado por infração — replicar a funcionalidade de pesquisa já conta como "reutilização de parte substancial". O paralelo com Gaspedaal (leparking.fr, mobile.de/AutoTrack) confirmado noutras fontes do material aponta o mesmo padrão: ~100.000 consultas diárias, cada uma pequena, foram somadas e qualificadas como extração de parte substancial.
- **CV-Online v Melons** (C-762/19): a infração exige prova de risco ao investimento comercial do titular — mas isto é mais fácil de provar contra um concorrente comercial pago e organizado (como seria o AutoImport) do que contra uso pontual não comercial.
- **Ryanair v PR Aviation**: mesmo quando a proteção sui generis da base de dados é duvidosa, os Termos de Uso continuam válidos como proibição contratual — mas só vinculam quem os aceitou, não terceiros.
- **La Centrale vs. ADS4ALL/leparking.fr** (Cour de cassation, outubro 2025): confirmado no material como condenação recente e real, não teórica — extração sistemática de ~350.000 anúncios, indemnização de 100.000€ em recurso, calculada com prova concreta de perda de tráfego.
- **LBC France vs. Entreparticuliers.com** (TGI Paris 2017, CA Paris 2021): indemnização de 50.000€ + 20.000€ por extração e reutilização de anúncios do leboncoin — mesmo com hiperligação de volta ao site original, o tribunal considerou que substituir o telefone por um link não afasta a infração porque os dados essenciais (preço, localização, foto) continuavam replicados.

**A conclusão do próprio material de investigação (não minha) é direta:** este padrão de negócio — extrair sistematicamente + oferecer funcionalidade equivalente + reformatar com layout próprio — é exatamente o que os tribunais europeus têm penalizado com sucesso e recentemente. Não é uma zona cinzenta a explorar; é uma linha já traçada por jurisprudência.

---

## 2. Como empresas do mesmo espaço descrevem a origem dos dados sem se expor

Vale a pena olhar para como quem já vive disto (Indicata, Autobiz, carVertical, Eurotax/Autovista, JATO) redige os seus próprios Termos — não porque resolvam o problema de origem, mas porque mostram o vocabulário e a estrutura que separam "declaração honesta" de "confissão".

**Padrão comum, replicado por todos:**

1. **Nunca dizem "recolhemos por scraping".** Usam formulações neutras: "dados compilados a partir de fontes de terceiros" (Autobiz), "informação de fontes independentes" (carVertical), "agregação de milhões de anúncios de plataformas de classificados" (Autobiz, dito uma única vez, sem detalhar o método).

2. **Disclaimer de não-verificação, sempre presente.** carVertical: "a informação provém de fontes independentes e a carVertical não tem poder para alterar esses dados". Autobiz: "os dados/avaliações são comunicados de boa-fé mas sem garantia explícita de precisão ou completude". JATO tem isto redigido de forma ainda mais defensiva: nega qualquer moderação/verificação dos dados de terceiros.

3. **"Estimativa/indicação orientativa", nunca "valor exato".** Eurotax/Autovista usa literalmente "guiding indications only" — é o padrão da indústria de avaliação automóvel inteiro, não uma frase isolada.

4. **Transferem a decisão final para o cliente profissional.** Autobiz: "transferência integral da responsabilidade pela decisão comercial final... para o cliente". Isto é estrutural, não decorativo — protege contra o argumento "confiei no vosso número e perdi dinheiro".

5. **Proíbem, nos seus próprios Termos, que os CLIENTES delas façam scraping ao produto delas** (Indicata, Autobiz) — o que é irónico dado que a origem dos dados delas provavelmente também passa por agregação de terceiros, mas mostra que a defesa "para trás" (como obtemos) e a defesa "para a frente" (como protegemos o que agregámos) são cláusulas distintas e ambas necessárias.

**O que nenhuma delas faz — e é revelador:** nenhuma destas empresas (Indicata, Autobiz, Eurotax, carVertical) descreve nos seus Termos públicos exatamente COMO obtém os dados de origem (que sites, que método técnico). Isso fica propositadamente vago. O material é explícito sobre isto no caso da Indicata: "os Termos da Indicata mostram o padrão do lado output (proibir que o cliente final faça scraping da Indicata), mas não revelam nada sobre como a Indicata próprio obtém os dados de fontes de terceiros — isso continua a ser um risco legal a resolver internamente, não copiável da concorrência."

Ou seja: **a indústria protege-se contratualmente do lado de saída e fica deliberadamente silenciosa do lado de entrada.** Isso não é uma solução jurídica — é gestão de exposição pública. O risco legal de origem não desaparece por não ser mencionado; só deixa de estar escrito em lado nenhum que se possa citar contra a empresa.

---

## 3. O que o AutoImport pode dizer nos seus Termos — verdadeiro e não confessional

Com base no padrão acima, o que se pode escrever hoje sem mentir e sem incriminar:

**Pode dizer, com segurança:**
- Que as estimativas/valores apresentados resultam do **cruzamento de fontes públicas e de mercado**, sujeitas a alterações e a possíveis imprecisões.
- Que os valores são **indicativos**, não substituem confirmação junto da Autoridade Tributária/DGAIEC, e a decisão de importação é do stand.
- Que o AutoImport **não garante** exatidão, atualidade ou completude dos dados de mercado usados no cálculo.
- Que fontes fiscais (tabelas ISV/IUC) são **legislação pública** — isto é categoricamente diferente de dados de anúncios de terceiros, e pode ser dito sem qualquer exposição, porque não há direito sui generis sobre legislação.

**Não pode dizer** (seria confissão, não proteção):
- Qualquer frase que descreva o método técnico ("recolhemos dados de anúncios do AutoScout24/StandVirtual via scraping automatizado") — isto é prova documental da própria empresa a admitir a conduta, exatamente o oposto de proteção. Numa eventual ação, um documento público onde a empresa descreve o método é o tipo de prova que substitui a necessidade de a parte contrária o provar.
- Nomear as plataformas-fonte de forma que sugira extração sistemática direta ("os nossos dados vêm do AutoScout24, mobile.de e StandVirtual") — mesmo sem a palavra "scraping", isto liga o produto às fontes protegidas e facilita a identificação da vítima da alegada infração.

**Zona a decidir com advogado antes de escrever qualquer coisa [VALIDAR COM ADVOGADO]:**
- Se convém ou não ter qualquer menção pública à origem dos dados de mercado além de "fontes públicas/de mercado" genérico. O material mostra que ninguém no setor (Indicata, Autobiz, Eurotax) vai além disto voluntariamente — e há uma razão jurídica para esse silêncio, não só estética.
- Se a estrutura de dados do AutoImport deve evitar deliberadamente os 4 fatores que a jurisprudência holandesa (Gaspedaal/AutoTrack) identificou como combinação de infração: (1) funcionalidade equivalente à fonte, (2) consulta em tempo real, (3) deduplicação, (4) reformatação com layout/marca própria. Isto é uma decisão de arquitetura de produto, não só de texto legal — e tem de ser tomada antes de escrever os Termos, não depois.

---

## 4. O risco real: o que pode acontecer, com que probabilidade, e o que muda por ser pago e B2B

**O que pode acontecer, por ordem crescente de gravidade:**

1. **Bloqueio técnico de IP/conta** — o mais provável e o mais barato para o marketplace aplicar. Todos os sites analisados (AutoScout24 via Akamai, PiscaPisca via Cloudflare com 403 confirmado nesta própria investigação, La Centrale via DataDome que bloqueou até o WebFetch e o browser desta investigação, leboncoin também via DataDome) têm bot management ativo e a deteção é hoje trivial e barata para eles. **Isto vai acontecer cedo, independentemente de haver ou não ação legal.**

2. **Cease & desist (carta de advogado a exigir cessação)** — é o passo seguinte natural, barato para o marketplace (é um template), e não exige provar dano nenhum. Serve também para estabelecer prova de "aviso prévio" caso avancem depois para tribunal, o que reforça o argumento de dolo/má-fé numa eventual ação (o robots.txt já provado nesta investigação a bloquear crawlers de IA e bots — se ignorado, é exatamente esse tipo de prova).

3. **Ação civil por violação do direito sui generis de base de dados (DL 122/2000)** — pedido de indemnização + injunção para cessar. É aqui que a jurisprudência é mais relevante: os casos leboncoin (50.000€+20.000€) e La Centrale (100.000€) não são hipotéticos, são condenações reais e recentes (2021, 2025) no mesmo setor (anúncios de automóveis usados) contra o mesmo tipo de conduta (agregador que extrai sistematicamente e oferece funcionalidade equivalente).

4. **Concorrência desleal / parasitismo comercial** — fundamento adicional, cumulável com o anterior, mencionado explicitamente no material a propósito do leboncoin.

5. **Responsabilidade penal** — referida nos próprios termos B2B da mobile.de e AutoScout24 (infração de direitos de propriedade industrial, §§108 e segs. da lei alemã de direitos de autor; a AutoScout24 refere potencial responsabilidade penal nos seus termos B2B). **[VALIDAR COM ADVOGADO]** até que ponto isto tem equivalente direto em Portugal — o material não cobre isso em detalhe, só confirma que existe na jurisdição alemã.

**Probabilidade — honestamente, sem inventar números que o material não dá:** o material não contém estatísticas de "quantos scrapers de automóveis são processados por ano" — não posso inventar uma percentagem. O que o material mostra com clareza é que:
- A deteção técnica (bot management) é quase certa e rápida — não é "se", é "quando".
- A escalada para ação judicial correlaciona-se com **escala e persistência**: os casos julgados (Gaspedaal, leparking.fr, Entreparticuliers.com) envolviam extração sistemática e contínua ao longo do tempo, não uma consulta pontual. Um SaaS pago que depende estruturalmente destes dados para funcionar é, por definição, extração sistemática e contínua — é o perfil exato que atrai ação judicial, não o perfil que a evita.
- A escalada correlaciona-se também com **efeito substitutivo**: se o produto do AutoImport permitir ao stand tomar a decisão de importação sem nunca visitar o AutoScout24/StandVirtual original, isso é o fator mais agravante identificado na jurisprudência francesa e holandesa.

**O que muda por ser pago e B2B — e a resposta é: agrava, não protege.**
- **Pago** facilita provar dano quantificável ao titular da base de dados (é isso que os tribunais franceses exigiram e aceitaram nos casos julgados — prova concreta de perda de tráfego/receita). Um concorrente que monetiza diretamente os dados extraídos é um alvo mais fácil de quantificar do que um projeto pessoal não comercial.
- **B2B** não dá nenhuma isenção — o direito sui generis de bases de dados protege contra qualquer reutilização não autorizada, independentemente de quem é o utilizador final. Aliás, um SaaS B2B estruturado, com personalidade jurídica, morada e faturação identificável em Portugal, é um alvo de cease & desist e ação judicial muito mais fácil de atingir do que um scraper anónimo — não há onde se esconder.
- **Escala** (o modelo de negócio depende de recolha contínua, não pontual) é precisamente o padrão que a jurisprudência (Gaspedaal: "cada consulta pequena, mas repetida sistematicamente") já qualificou como infração mesmo quando cada extração individual não seria "substancial" isoladamente.

---

## 5. Alternativas legítimas

Do material, por ordem de segurança jurídica decrescente:

1. **Dados oficiais/públicos por natureza legal** — tabelas de ISV/IUC (legislação, não protegida por direito de bases de dados), dados aduaneiros/registo de matrículas se publicados oficialmente. Isto é a fonte mais segura e é já parte do core do produto (o cálculo fiscal em si).

2. **APIs oficiais dos próprios marketplaces, quando existem.** O material confirma que a OLX tem um "Portal de Programadores" com API de submissão de anúncios (não de pesquisa/leitura em massa). A AutoScout24 tem API só de submissão para dealers, sem endpoint de pesquisa. Ou seja: **as APIs oficiais existentes não resolvem o problema do AutoImport**, porque servem para publicar anúncios, não para consultar em massa os anúncios de terceiros. Isto fecha esta via para a maioria dos marketplaces analisados.

3. **Acordo comercial direto com o marketplace (licenciamento de dados).** É a via que o material recomenda repetidamente e de forma consistente em quase todos os casos analisados (AutoScout24, mobile.de, La Centrale, leboncoin, Marktplaats/AutoTrack) — negociar acesso via API paga/licenciada, não via scraping. Custo mais alto, mas é a única via que elimina o risco descrito acima em vez de o gerir.

4. **Dados fornecidos diretamente pelos próprios stands parceiros (first-party, com consentimento).** Se os stands que usam o AutoImport carregarem os seus próprios dados de stock/preços diretamente na plataforma, não há questão de direito de bases de dados de terceiros — é dado próprio do cliente, cedido contratualmente ao AutoImport nos seus Termos de uso (o padrão de "licença sobre conteúdo submetido" replicado por praticamente todos os marketplaces analisados nos seus próprios Termos, e recomendado no material como padrão a copiar).

5. **Fornecedores de market intelligence que já pagaram este preço** (Indicata, Autobiz, Eurotax, JATO) — comprar acesso a dados agregados e já licenciados em vez de agregar diretamente. Custo de subscrição B2B, mas transfere o risco de origem para quem já o resolveu (ou pelo menos já o geriu) profissionalmente.

6. **Ferramentas de scraping-as-a-service com "legal shield" (SerpApi, Bright Data).** O material é claro que isto **não é solução, é apenas transferência de seguro** — e mesmo a líder de mercado deste nicho (SerpApi) está, à data da investigação, a ser processada pela Google por scraping de dados protegidos, com um "Legal Shield" que expressamente **não cobre a legalidade do uso subsequente dos dados**, só a recolha. Não resolve o problema do AutoImport, que precisa de usar e revender os dados, não só de os recolher.

---

## Conclusão direta

O material não deixa margem para interpretação otimista: **o modelo "scraping direto de marketplaces + venda do produto derivado" tem jurisprudência europeia recente e desfavorável específica ao setor automóvel** (leboncoin, La Centrale, AutoTrack — não são casos de outro setor por analogia, são exatamente concorrentes/agregadores de anúncios de carros). Ser pago e B2B não mitiga isto, agrava a exposição por facilitar a prova de dano e a identificação do responsável.

A via defensável a prazo é: dados fiscais oficiais (que já são o core do produto) + dados first-party dos stands parceiros + eventual acordo comercial com uma fonte de mercado, nunca scraping direto e sistemático dos marketplaces líderes como fundação do negócio. O texto dos Termos pode e deve ser escrito com a linguagem "estimativa, fontes públicas e de mercado, sem garantia" — mas isso protege a comunicação com o cliente, não resolve o risco de origem, que é uma decisão de arquitetura de dados e de fornecimento, não de redação legal.

**Antes de escalar recolha de dados de qualquer marketplace listado neste documento, isto precisa de parecer jurídico dedicado** — não porque o material seja insuficiente, mas porque a decisão (litigar o risco vs. negociar acesso vs. mudar de fonte) é uma decisão de negócio com exposição financeira real, e este documento é investigação, não parecer.
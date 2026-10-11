# Fixtures do P04 (coletores DE/NL/BE)

**Reconstruídas, não gravadas.** O ambiente onde o P04 foi feito não chegava aos sites
(proxy de saída recusou autoscout24.de, autotrader.nl e opendata.rdw.nl), por isso estas
páginas reproduzem a FORMA dos payloads que os coletores já leem (`__NEXT_DATA__` do
AutoScout24/AutoTrader/autoboerse, objetos da API do Autohero/meinauto, cards do quoka/autoline/
ooyyo, JSON-LD do theparking/autouncle) com textos de IVA tirados dos estudos por país
(DE §3.2, NL §3.2, BE §3.2). Os nomes dos campos de IVA nos payloads (`taxDeductible`,
`netPriceRaw`, `vatType`…) são hipóteses: o código procura-os por padrão (lib/vat-regime-text.ts)
e cai no vocabulário do texto quando não existem.

A resposta da RDW (`rdw-m9d7-ebf2-GB123X.json`) segue as colunas do dataset "Gekentekende
voertuigen" (m9d7-ebf2); a matrícula e os valores são fictícios.

Para trocar por fixtures reais: gravar 1 página de cada fonte com `--max-pages 1` numa máquina
com acesso e substituir o ficheiro; os testes `tests/collector/p04-*.test.ts` dizem o que tem de
continuar a dar.

# Fixtures do P05 (coletores FR/ES)

**Sintéticas**, não gravadas: o ambiente onde o P05 foi feito não tinha acesso de rede aos sites
(o proxy recusou `ocasionplus.com`, e o Autocasión bloqueia leitura automática). Cada ficheiro
reproduz só a estrutura que o parser lê — a mesma que está documentada em
`research/<fonte>-investigacao.md` e nos comentários de `tools/collector/<fonte>/parse.ts` —
com valores inventados mas plausíveis.

| ficheiro | fonte | estrutura | o que cobre |
|---|---|---|---|
| `ocasionplus-iva-deducible.html` | ocasionplus.com `/coches-ocasion/iva-deducible` | JSON-LD `ItemList` de `Vehicle` + cards `data-test` | página "IVA Deducible" → `dedutivel`; galeria |
| `flexicar-listagem.html` | flexicar.es | `__NEXT_DATA__` `initialVehicles` | `taxDeductible` true/false/ausente; galeria relativa |
| `autocasion-listagem.html` | autocasion.com | JSON-LD `Product[]` + `<article class="anuncio">` | "IVA deducible" com preço + IVA; "REBU"; particular; sem menção; rodapé com link "IVA deducible" |
| `trovit-listagem.html` | coches.trovit.es | JSON-LD `SearchResultsPage.about[Car]` + cards | "IVA deducible"; "REBU"; sem menção; imagens protocolo-relativas |
| `aramisauto-listagem.html` | aramisauto.com | `window.__NUXT__` (IIFE) | regime sempre null; 1 foto |

Quando houver rede, substituir por páginas gravadas (`curl` de uma página por fonte) e confirmar
que os testes `tests/collector/p05-coletores-fr-es.test.ts` continuam verdes; o Autocasión é o
que mais precisa disso (o estudo ES §3.2 também não o conseguiu ver).

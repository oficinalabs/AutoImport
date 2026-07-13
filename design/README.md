# 🎨 Design

Referência visual do AutoImport. **Não é a app final** — a app será construída em
Next.js (ver [`../docs/02-FRONTEND.md`](../docs/02-FRONTEND.md)). Isto serve de
protótipo/maqueta a partir do qual o frontend é implementado.

O sistema visual (paleta petróleo + âmbar, tipografia Archivo / IBM Plex, veredito
compensa/marginal/não-compensa) está definido em
[`../docs/01-DESIGN.md`](../docs/01-DESIGN.md).

## `prototype/`
Protótipo interativo gerado no Claude a partir do prompt de design. Ecrãs: Painel,
Pesquisar, Comparar, Detalhe do anúncio, Negociações (email mascarado), Compras
(pipeline), Favoritos, Alertas, Stand/Perfil. Navegação em barra de topo.

| Ficheiro | O quê |
|---|---|
| `AutoImport.dc.html` | Protótipo principal (abrir este) |
| `CarCard.dc.html` | Componente isolado do cartão de carro |
| `AutoImport-print-13pc44d.dc.html` | Versão para impressão |
| `support.js` | Runtime partilhado — **tem de ficar na mesma pasta** |
| `preview.webp` | Miniatura de pré-visualização |

**Como ver:** abrir `prototype/AutoImport.dc.html` no browser (mantém o `support.js`
ao lado). As fotos de carros são placeholders — as reais entram na implementação.

> Documento de referência. Quando o frontend estiver implementado, esta pasta pode
> passar a arquivo histórico.

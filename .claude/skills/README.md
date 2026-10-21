# Skills do AutoImport

Skills do Claude que só valem para este projeto. Os outros chats e projetos não as veem.
O Claude só carrega uma skill quando o pedido bate com a descrição dela.

Todas vêm de repositórios da comunidade com licença MIT (a `LICENSE` de cada uma está na pasta).

## Testar o modelo de negócio

| Skill | Para quê | Como chamar | Origem |
|---|---|---|---|
| `claude-council` | Conselho de 2 a 8 agentes com papéis diferentes, que respondem em separado, se avaliam às cegas e acabam num veredito. Dá para usar papéis de stands (pequeno, importador experiente, cético, contabilista). | "consulta o conselho: …" | [amgadelgamal/claude-council](https://github.com/amgadelgamal/claude-council) |
| `synthetic-user-research` | Clientes simulados com regras: serve para ver se o site e o texto se percebem, não para prever quem paga. Tudo sai marcado como SINTÉTICO. | "faz um teste com utilizadores sintéticos" | [mohitagw15856/pm-claude-skills](https://github.com/mohitagw15856/pm-claude-skills) |
| `monetization-strategy` | 3 a 5 modelos de receita com CAC, LTV, riscos e experiências baratas para validar. | "estratégia de monetização" | [phuryn/pm-skills](https://github.com/phuryn/pm-skills) |
| `pricing-strategy` | Modelo de preço, planos, concorrência e testes de preço. | "estratégia de preço" | [phuryn/pm-skills](https://github.com/phuryn/pm-skills) |
| `grill-me` + `grilling` | Interroga um plano por rondas até cada decisão estar fechada. `grill-me` precisa de `grilling`. | `/grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills) |

## Marketing

| Skill | Para quê | Origem |
|---|---|---|
| `copywriting` | Escrever ou reescrever o texto da landing e de outras páginas. | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) |
| `cro` | Perceber porque é que uma página não converte (ex.: visitantes que não começam o trial). | idem |
| `seo-audit` | Auditoria de SEO do site. | idem |

As skills de marketing procuram contexto do produto em `.claude/product-marketing.md` se existir.

## Descobrir mais

| Skill | Para quê | Origem |
|---|---|---|
| `find-skills` | Procura skills no registo do skills.sh. **Alterada** para só instalar neste projeto (nunca global, sem `-g`/`-y`) e só depois de dizeres que sim. | [vercel-labs/skills](https://github.com/vercel-labs/skills) |

Ao adicionar uma skill nova, lê o SKILL.md antes e acrescenta-a a esta lista.

# 🎨 Design — Sistema Visual

> 🔒 fixo · ✏️ preencher · ☑️ escolher (a recomendada já vem marcada)

> **Conceito:** instrumento de decisão, não brochura. Um comprador de stand olha para isto entre chamadas, à procura de uma resposta rápida — «este carro compensa importar, sim ou não?». Fundo frio e sóbrio (petróleo/aço), com **um** acento quente (âmbar) reservado à ação e ao destaque de oportunidade. As **cores semânticas do veredito** (compensa / marginal / não compensa) são o coração da UI e vivem separadas do acento de marca.

## Cores
> Define tudo como **tokens** (CSS variables). Nada de hex soltos pelos componentes.
- ✏️ **Cor primária:** `#0E3B4A`  ·  _Petróleo — teal-navy escuro, automóvel e de confiança, sem ser azul-corporativo genérico_
- ✏️ **Cor secundária:** `#3E6B79`  ·  _Aço — teal médio para apoios, cabeçalhos e estados_
- ✏️ **Cor de acento / CTA:** `#E8930C`  ·  _Âmbar/brass — o «ouro» de um bom negócio; contraste quente sobre o petróleo frio_
- ✏️ **Neutro — fundo (claro):** `#F3F5F5`  ·  _off-white com leve viés frio (toque da primária)_
- ✏️ **Neutro — fundo (escuro):** `#0B1A20`  ·  _quase-preto tingido de petróleo_
- ✏️ **Texto principal:** `#0D1C22`  ·  _(no tema escuro → `#E7ECEC`)_
- ✏️ **Texto suave / secundário:** `#5B6B71`  ·  _(no tema escuro → `#93A3A8`)_
- 🔒 **Cores semânticas** (separadas do acento):
  - ✏️ sucesso `#1E9E57` · aviso `#C2410C` · erro `#D1403A`
  - _Veredito de negócio usa a mesma família: **Compensa** = sucesso (verde) · **Marginal** = neutro/aço (cinza-azulado, break-even) · **Não compensa** = erro (vermelho). O âmbar do acento **não** entra no veredito para não confundir._
- 🔒 **Neutros com viés:** o cinza leva um leve toque da primária (petróleo) — nunca cinza puro.

## Tipografia
> CSP/preferência: carregar via `@font-face` self-hosted (WOFF2), nunca CDN externo.
- ✏️ **Display (títulos):** **Archivo** _(grotesque técnico; usar o corte **Expanded** em KPIs e números grandes de poupança — dá um ar industrial/automóvel deliberado)_
- ✏️ **Corpo (texto):** **IBM Plex Sans** _(neutra, fiável, ótima em tabelas densas; algarismos tabulares)_
- ☑️ **Mono (código / dados):**
  - [ ] Stack do sistema (`ui-monospace, SF Mono, …`)
  - [x] Fonte específica: **IBM Plex Mono** _(preços, cilindrada, ISV, matrículas — reforça o ar de «instrumento»; combina com o Plex Sans)_
- 🔒 **Tamanho base:** 16px · **Corpo:** ~65 caracteres de largura.
- 🔒 **Escala:** define uma (ex.: 1.25) e fica nela. Títulos com `text-wrap: balance`.
- 🔒 **Números:** `font-variant-numeric: tabular-nums` sempre que houver colunas de preços/valores a alinhar.

## Forma & espaço
- ✏️ **Raio de cantos:** `6px`  ·  _cartões e inputs; discreto e preciso, não «bubbly»_
- 🔒 **Espaçamento:** múltiplos de 4px. Layout com flex/grid + `gap` (não margens soltas).
- ✏️ **Largura máx. de conteúdo:** `1280px`  ·  _páginas de conteúdo/marketing; o dashboard/app usa largura total com padding, e tabelas largas fazem `overflow-x: auto` no seu próprio contentor_

## Tema
- ☑️ **Dark mode:**
  - [x] Sim — desenhar os dois temas com o mesmo cuidado _(uso em escritório/showroom; dashboards de dados beneficiam)_
  - [ ] Só um tema (decisão deliberada): `________`
- 🔒 **Estratégia:** tokens em `:root`; override por `prefers-color-scheme` **e** `data-theme`.
  - _No escuro: primária e links clareiam para um teal legível (~`#4FB3C7`); âmbar mantém-se (~`#F0A929`); verde/vermelho do veredito ajustados para contraste AA sobre `#0B1A20`._

## Componentes & ícones
- 🔒 **Base:** shadcn/ui + Tailwind.
- ☑️ **Primitivas:**
  - [x] Radix (default do shadcn)
  - [ ] Base UI (mais ativo em 2026)
- ✏️ **Ícones:** **Lucide** _(cobertura ampla, utilitário; combina com o tom sóbrio)_
- ☑️ **Componentes animados (copy-paste):**
  - [ ] Nenhum
  - [x] Magic UI (micro-interações e marketing) _— apenas na landing/site de vendas; a app fica sóbria_
  - [ ] Aceternity UI (hero spectacle: 3D, spotlights)
  - [ ] React Bits (efeitos de texto/background)

## Movimento
- ☑️ **Nível de animação:**
  - [ ] Nenhum (utilitário)
  - [x] Subtil (transições, hovers) _— é uma ferramenta de trabalho; nada de cinemático dentro da app_
  - [ ] Expressivo (scroll cinematográfico, 3D)
- ☑️ **Motor:**
  - [x] Motion (default, UI de app)
  - [ ] GSAP + Lenis (sites de agência, scroll)
  - [ ] Só CSS / Tailwind
- 🔒 **Regras:** anima só `transform` / `opacity` / `filter` / `clip-path` · < 300ms · ease-out · respeita `prefers-reduced-motion`.

## Tom & acessibilidade
- ✏️ **Personalidade (3 adjetivos):** Rigoroso · Prático · De confiança.
- ✏️ **Evitar (anti-exemplos):** azul-corporativo genérico; gradiente roxo→azul; estética de app de consumo/gaming; decoração e emojis como marcadores; hero gigante e «flashy»; tudo centrado e `rounded-lg` por todo o lado. A densidade de dados é uma funcionalidade, não um defeito.
- 🔒 **Contraste:** WCAG AA mínimo · foco de teclado sempre visível.

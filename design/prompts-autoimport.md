# Prompts de hero para o AutoImport

Três prompts no molde dos do motionsites.ai, adaptados a este projeto. Cola um
deles num Claude/v0/Cursor e sai um hero completo.

## ⚠️ Ler antes de usar

**1. A stack está corrigida.** Os prompts originais assumem **Vite + React +
`tailwind.config.js`**. Este projeto é **Next.js 15 App Router + Tailwind v4**,
e o Tailwind v4 **não tem ficheiro de configuração** — os tokens declaram-se em
CSS com `@theme`. Um prompt que peça `tailwind.config.js` produz código que não
encaixa aqui. Já vai corrigido abaixo.

**2. Os vídeos não são nossos.** Os prompts originais apontam para URLs
CloudFront do próprio motionsites (`d8j0ntlcm91z4.cloudfront.net/...`). Isso é
o CDN deles, a largura de banda deles, e podem cortar quando quiserem — não se
usa num produto que se cobra. Põe um ficheiro teu em `public/video/` e
referencia `/video/nome.mp4`. Vídeo de stock de carros em estrada há grátis e
com licença comercial (Pexels, Coverr, Mixkit).

**3. O vídeo pesa.** Um hero em vídeo custa 2-5 MB e atrasa o primeiro
carregamento — o oposto do que trabalhámos na performance. Se avançares:
`poster` obrigatório, `preload="metadata"`, e desligar em `prefers-reduced-motion`.

---

## Prompt 1 — Cinemático (do "VANGUARD")

> Cria um hero de ecrã inteiro para o **AutoImport**, um SaaS português que diz
> a stands automóveis que carros compensa importar da Europa com o custo final
> real já calculado (ISV, IUC, transporte, legalização).
>
> **Stack:** Next.js 15 App Router (React Server Components), TypeScript,
> Tailwind CSS v4, `lucide-react`. **Não criar `tailwind.config.js`** — o
> Tailwind v4 declara tokens em CSS com `@theme` dentro de `app/globals.css`.
> Fontes via `next/font/google` em `app/layout.tsx`, nunca `<link>` no HTML.
> O componente do hero é `"use client"` só por causa do menu; o resto fica server.
>
> **Vídeo de fundo:** elemento `<video>` a cobrir o viewport inteiro com
> `autoPlay`, `muted`, `loop`, `playsInline`, `preload="metadata"`,
> `poster="/video/hero-poster.jpg"` e `object-cover`. Fonte: `/video/hero.mp4`
> (ficheiro local em `public/video/`). Por cima do vídeo, uma camada
> `bg-gradient-to-b from-black/70 via-black/50 to-black/80` para o texto ler.
> Respeitar `prefers-reduced-motion`: com movimento reduzido, mostrar só o poster.
>
> **Tipografia:** `Archivo` peso 900 (via `next/font/google`, variável
> `--font-archivo`) para a marca e o título; `Inter` pesos 400/500/600 para
> corpo, navegação e números. Registar em `@theme` como `--font-display` e
> `--font-sans`.
>
> **Ícones (`lucide-react`):** `ArrowUpRight`, `TrendingDown`, `ShieldCheck`, `X`.
>
> **Barra de navegação:**
> - Horizontal no topo, `px-6 sm:px-10 lg:px-16`, `py-5 lg:py-7`.
> - Esquerda: "AutoImport" em `font-display`, branco, `text-2xl sm:text-3xl`,
>   `tracking-tight`. O "Auto" a `font-normal`, o "Import" a `font-black`.
> - Centro (escondido abaixo de `md`): "Mercado", "Como funciona", "Preço",
>   "Ajuda" — `font-sans`, `text-sm`, `text-white/80`, `tracking-widest`,
>   maiúsculas, `hover:text-white`.
> - Direita (a partir de `md`): "COMEÇAR GRÁTIS" com ícone `ArrowUpRight`,
>   `border border-white/30 hover:border-white/60`, `px-6 py-3`, `text-xs`,
>   `tracking-widest`, `rounded-full`, `hover:bg-white/10`.
> - Abaixo de `md`: hambúrguer de três barras brancas (`w-6 h-0.5`, `w-6 h-0.5`,
>   `w-4 h-0.5`, `space-y-1.5`).
>
> **Menu móvel (só abaixo de `md`):** overlay `fixed inset-0 z-50`,
> `bg-black/95 backdrop-blur-sm`, com `useState`. Aberto: `opacity-100 visible`;
> fechado: `opacity-0 invisible`; `transition-all duration-500`. Cabeçalho igual
> à navbar com `X` à direita. Links centrados verticalmente em `font-display`,
> `text-4xl sm:text-5xl`, maiúsculas, com entrada escalonada
> (`transitionDelay: i * 80 + 100ms`, `opacity` + `translateY(20px)`). Todos
> fecham o menu ao clicar.
>
> **Conteúdo do hero** (centrado verticalmente, alinhado à esquerda). Todos os
> elementos com `animate-fade-up` escalonado de 0.2s em 0.2s, `opacity: 0`
> inicial e `animation-fill-mode: forwards`:
>
> 1. **Etiqueta:** ponto verde a pulsar (`size-1.5 rounded-full bg-emerald-400`
>    com `ring-4 ring-emerald-400/20`) seguido de "ATUALIZADO HOJE · 29 281
>    ANÚNCIOS LIDOS" em `text-white/60`, `text-xs sm:text-sm`, `font-sans`,
>    `tracking-[0.3em]`, maiúsculas. `mb-6 lg:mb-8`.
>
> 2. **Título:** três linhas em `font-display`, peso 900, maiúsculas,
>    `leading-[0.86]`, `tracking-[-0.05em]`, `text-[clamp(3rem,11vw,9rem)]`:
>    - "174" — com `bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500`
>      e `bg-clip-text text-transparent`
>    - "CARROS"
>    - "COMPENSAM."
>    O número vem de props (`activeOpportunities`), não fixo no código.
>
> 3. **Subtexto:** "Cinco mercados europeus. Custo final já com ISV, IUC,
>    transporte e legalização —" + `<strong className="text-white">` "comparado
>    com o preço a que se vende em Portugal." Em `text-white/60`,
>    `text-sm sm:text-base`, `leading-relaxed`, `max-w-md`. `mt-6 lg:mt-8`.
>
> 4. **Botões** (`mt-8 lg:mt-10`, `flex flex-wrap items-center gap-4 sm:gap-6`):
>    - "COMEÇAR — 1.º MÊS GRÁTIS" com `ArrowUpRight`, `bg-white text-black`
>      `hover:bg-neutral-200`, `rounded-full`, `px-5 sm:px-7 py-3 sm:py-4`,
>      `text-[11px] sm:text-xs`, `tracking-widest`. A seta faz
>      `group-hover:translate-x-0.5 group-hover:-translate-y-0.5`.
>    - Ao lado (`hidden sm:flex`): ícone `ShieldCheck` (`w-8 h-8 text-white/50`)
>      com duas linhas: "Sem cartão" / "Sem fidelização" em `text-white/60`,
>      `text-xs`, `tracking-wider`, maiúsculas.
>
> 5. **Números** (`mt-8 sm:mt-10 lg:mt-14`, `flex flex-wrap gap-6 sm:gap-12
>    lg:gap-16`), todos com `font-variant-numeric: tabular-nums`:
>    - "29 281" / "Anúncios analisados"
>    - "174" / "Compensam agora"
>    - "2 850 €" / "Poupança mediana"
>    - "11 745 €" / "A melhor de hoje"
>    Valores em `font-sans`, branco, `text-2xl sm:text-4xl lg:text-5xl`, bold,
>    `tracking-tight`. Rótulos em `text-white/50`, `text-[9px] sm:text-xs`,
>    `tracking-widest`, maiúsculas, `mt-1`.
>
> **Animações** em `app/globals.css` dentro de `@layer utilities`:
> ```css
> @keyframes fade-up {
>   from { opacity: 0; transform: translateY(30px); }
>   to   { opacity: 1; transform: translateY(0); }
> }
> ```
> Classes `.animate-fade-up` e `.animate-fade-up-delay-1` a `-4` (0.2s de
> incremento). Dentro de `@media (prefers-reduced-motion: reduce)`, todas as
> animações passam a `none` e `opacity: 1`.
>
> Totalmente responsivo, mobile-first, com cortes em `sm` (640), `md` (768) e
> `lg` (1024). Sem router — é um único componente de secção.

---

## Prompt 2 — Limpo e caro (do "SkyElite")

> Cria a secção hero de uma landing premium para o **AutoImport**, uma
> plataforma portuguesa que calcula o custo real de importar um carro da Europa
> (preço na origem + transporte + ISV + IUC + legalização) e compara com o preço
> de mercado em Portugal.
>
> **Vídeo de fundo:** `/video/hero.mp4` (ficheiro local em `public/video/`, não
> um CDN externo). `autoPlay`, `muted`, `loop`, `playsInline`,
> `poster="/video/hero-poster.jpg"`. Cobre o viewport todo (`h-screen`,
> `object-cover`). Por cima, `bg-white/60 backdrop-blur-[2px]` — é um hero
> **claro**, não escuro.
>
> **Navegação:**
> - Marca "AutoImport" à esquerda (`text-2xl`, `font-semibold`,
>   `text-[#0E3B4A]`).
> - Menu (escondido em mobile, `md:flex`): Mercado, Como funciona, Preço,
>   Ajuda, Contacto.
> - Links em `text-[#0E3B4A]` com `hover:text-[#3E6B79]` e `transition-colors`.
> - Hambúrguer em mobile com `lucide-react` (`Menu` / `X`).
> - Menu móvel em dropdown `bg-white/95`, `backdrop-blur`, `rounded-2xl`,
>   `shadow-lg`.
> - `max-w-7xl`, centrado, `px-8 py-6`.
>
> **Conteúdo do hero** (centrado, `-mt-64` para subir):
> - Rótulo pequeno em maiúsculas: "IMPORTAÇÃO AUTOMÓVEL" (`text-sm`,
>   `font-semibold`, `text-[#5B6B71]`, `tracking-wider`, `mb-4`).
> - Título de duas linhas com sobreposição:
>   - Linha 1: "Importa." (`text-6xl md:text-7xl lg:text-8xl`, `font-normal`,
>     `text-[#5B6B71]`, `leading-none`, `tracking-tighter`)
>   - Linha 2: "Com contas." (mesmo tamanho, cor `#0E3B4A`,
>     `margin-top: -12px` para sobrepor)
> - Subtítulo: "174 carros compensam hoje. Já com o imposto na conta."
>   (`text-lg md:text-xl`, `text-[#5B6B71]`, `mb-6`, `max-w-2xl`). O número vem
>   de props.
> - Dois botões (`gap-4`, centrados):
>   - "Ver as contas": `px-5 py-2.5`, `rounded-full`, `bg-[#E8930C]/15`,
>     `text-[#9A6200]`, `font-medium`, `hover:bg-[#E8930C]/25`
>   - "Começar grátis": `px-5 py-2.5`, `rounded-full`, texto branco,
>     `bg-[#0E3B4A]`, `hover:bg-[#0a2c38]`, transições suaves
> - Por baixo, uma linha fina de prova (`mt-10`, `text-sm`, `text-[#5B6B71]`,
>   `flex gap-6 flex-wrap justify-center`, separada por `·`):
>   "29 281 anúncios lidos" · "Poupança mediana 2 850 €" · "5 mercados"
>
> **Tipografia:** Inter via `next/font/google` (400, 500, 600, 700), aplicada
> ao `<body>` no `app/layout.tsx`.
>
> **Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS v4 (tokens em
> `@theme`, **sem `tailwind.config.js`**), `lucide-react`, `useState` para o
> menu. `h-screen`, mobile-first com `md` e `lg`. Todas as transições com
> `transition-colors`.
>
> **Estrutura:** contentor exterior `min-h-screen bg-[#F3F5F5]`; hero
> `relative h-screen overflow-hidden`; wrapper `relative h-full flex flex-col`;
> área principal `flex-1 flex items-center justify-center`.
>
> Limpo, moderno e caro — mas **sóbrio**: quem vê isto está a decidir gastar
> 30 mil euros num carro, não a comprar um curso.

---

## Prompt 3 — Editorial (do "Atelier")

> Cria um hero de ecrã inteiro para o **AutoImport**, plataforma portuguesa que
> mostra a stands automóveis que carros compensa importar da Europa com o custo
> final real. Next.js 15 App Router, Tailwind CSS v4, `lucide-react`.
> Totalmente responsivo, com menu móvel animado.
>
> **Tipografia** (via `next/font/google` em `app/layout.tsx`, **nunca `<link>`**):
> - `Instrument_Serif` (normal + itálico) para títulos e links do menu móvel
> - `Inter` (300, 400, 500, 600) como sans de corpo
>
> Registar em `app/globals.css`:
> ```css
> @theme {
>   --font-serif: var(--font-instrument-serif), Georgia, serif;
>   --font-sans:  var(--font-inter), system-ui, sans-serif;
> }
> ```
> **Não criar `tailwind.config.js`** — no Tailwind v4 não existe.
>
> **Fundo:** vídeo em loop, `autoPlay muted playsInline`, a cobrir o viewport
> com `object-cover`. Fonte `/video/hero.mp4` (ficheiro local em `public/video/`,
> não um CDN de terceiros). Camada `bg-black/45` por cima.
>
> **Layout:** secção `w-full h-screen overflow-hidden`, vídeo em absoluto atrás
> de uma camada `relative z-10 flex flex-col h-full`.
>
> **Navegação:**
> - `px-6 md:px-12 lg:px-16 py-5 md:py-6`
> - Esquerda: "AutoImport" (branco, `font-semibold`, `text-lg`,
>   `tracking-tight`, `font-sans`) + links desktop (`hidden md:flex`):
>   "Mercado", "Como funciona", "Preço", "Ajuda" —
>   `text-white/80 hover:text-white text-sm font-light transition-colors duration-200`
> - Direita: "Entrar" (texto, escondido em mobile) + botão "Começar grátis"
>   (fundo branco, texto preto, `rounded-full`, `px-5 py-2`, escondido em
>   mobile) + hambúrguer (`md:hidden`)
> - Hambúrguer: 3 linhas (2px, brancas, `rounded-full`), a do meio mais curta
>   (`w-4` vs `w-6`). Ao abrir, as de cima/baixo rodam 45/-45 graus e transladam,
>   a do meio desvanece. `cubic-bezier(0.76,0,0.24,1)`, 500ms.
>
> **Menu móvel** (`fixed inset-0 z-50 md:hidden`):
> - Fundo `bg-black/90 backdrop-blur-xl`, entrada em 700ms
> - Cabeçalho igual à navbar, com botão de fechar
> - Links empilhados, centrados, `text-4xl sm:text-5xl font-serif`, brancos,
>   cada um com `border-b border-white/10` e `py-4`. Entrada escalonada
>   (150ms + índice*80ms), de `translate-y-8` para `translate-y-0`.
>   `hover:pl-4`.
> - Itens: "Mercado", "Como funciona", "Preço", "Ajuda", "Entrar"
> - Rodapé: botão "Começar grátis" a toda a largura (branco, texto preto,
>   `rounded-full`, `py-4`), 550ms de atraso
>
> **Conteúdo do hero:**
> - Contentor: `flex-1 flex flex-col items-center justify-center px-6 text-center`
> - Título (h1): `font-serif text-white text-4xl sm:text-5xl md:text-6xl
>   lg:text-7xl xl:text-8xl leading-[1.05] max-w-5xl tracking-[-0.02em]`
>   ```
>   174 carros compensam
>   importar <italico>hoje</italico>.
>   ```
>   O "174" vem de props e leva `font-variant-numeric: tabular-nums`. A palavra
>   "hoje" em `<span className="italic">`.
> - Subtexto: `mt-6 md:mt-7 text-white/70 text-sm md:text-base font-light
>   max-w-lg leading-relaxed`
>   "Cinco mercados europeus, o custo final já com ISV, IUC, transporte e
>   legalização —" + quebra (`hidden sm:block`) + "comparado com o preço a que
>   se vende em Portugal."
> - Botões: `mt-8 md:mt-9 flex flex-col sm:flex-row items-center gap-4`
>   - Primário: "Começar grátis" com ícone `ArrowRight` (`lucide-react`), fundo
>     branco, texto preto, `rounded-full`, `px-7 py-3`, `text-sm font-medium`.
>     A seta translada 0.5 à direita no hover.
>   - Secundário: "Ver uma conta" com ícone `Calculator`, transparente com
>     `border border-white/40`, texto branco, `rounded-full`, `px-7 py-3`.
>     Hover: `bg-white/10 border-white/60`
> - Por baixo (`mt-12`, `text-white/45`, `text-xs`, `tracking-[0.2em]`,
>   maiúsculas): "29 281 anúncios lidos · atualizado hoje"
>
> **Dependências:** React, `lucide-react` (`ArrowRight`, `Calculator`),
> Tailwind v4. Mais nenhuma biblioteca de UI.

---

## O que estes prompts têm que os nossos não tinham

Vale a pena reparar, porque é a lição toda: **não há nada de mágico neles.**
São longos e decidem tudo — o peso da fonte, o valor exato do `tracking`, os
milissegundos de cada atraso, o `cubic-bezier`. O "superpoder de IA" é
inteiramente o detalhe do texto.

E reparar também no que lhes **falta**: nenhum deles diz uma palavra sobre como
a secção se relaciona com a seguinte. São heros avulsos. Colar três destes por
ordem dá exatamente o problema que esta landing teve — secções corretas, página
sem composição. Ver o comentário no topo de `app/(marketing)/page.tsx`.

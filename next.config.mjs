const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy — em **Report-Only**, de propósito.
 *
 * Uma CSP a bloquear a sério não dá erro: apaga coisas. A fonte não carrega, a
 * foto fica em branco, o script morre — e a página parece bem. Este projeto já
 * teve produção partida em silêncio uma vez (ver CLAUDE.md); não se repete a
 * dose com um header. Em Report-Only o browser **deixa passar tudo** e
 * limita-se a gritar na consola. Passa a `Content-Security-Policy` a sério
 * quando produção estiver observada e limpa — mudar só o nome da chave lá em
 * baixo. (Sem `report-uri`: o sítio para onde apontar são os relatórios do
 * Sentry, que ainda não existe. Até lá lê-se na consola.)
 *
 * As diretivas, e porquê cada uma é assim:
 */
const csp = [
  // Tudo o que não estiver explicitado abaixo só pode vir de nós.
  "default-src 'self'",

  // ⚠️ O ponto fraco da política. O App Router injeta `<script>` inline em
  // todas as páginas (o payload RSC via `self.__next_f.push`), e o next-themes
  // injeta outro no <head> para aplicar o tema antes da primeira pintura — sem
  // ele havia um flash de branco. Sem `'unsafe-inline'` isto não anda.
  // Não vale a pena fingir o contrário: com `'unsafe-inline'` o script-src
  // deixa de travar XSS, e passa a valer só como defesa contra scripts
  // carregados de domínios externos. Fortalecer exige **nonces** — middleware
  // a gerar um por pedido e a reescrever o header, com o `nonce` a chegar aos
  // scripts do Next. Dá trabalho e obriga a render dinâmico; fica para quando
  // houver campos de texto de utilizador a aparecer na página de outra pessoa.
  // 'unsafe-eval' é só do `next dev` (o Fast Refresh compila em runtime).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,

  // Tailwind vem num ficheiro, mas há `style={{…}}` em componentes (barras de
  // progresso, larguras calculadas) e o Next inlina CSS crítico — ambos contam
  // como inline. Em style-src o risco é muito menor do que em script-src.
  "style-src 'self' 'unsafe-inline'",

  // As fontes são next/font/google: descarregadas no build e servidas por nós
  // a partir de /_next/static/media. Não há pedido nenhum ao Google em runtime.
  "font-src 'self' data:",

  // Permissivo por necessidade, não por preguiça. As fotos dos anúncios vêm de
  // ~24 CDNs diferentes (AutoScout24, leparking, olxcdn…) e cada coletor novo
  // traz mais — é por isso que se servem com <img> normal em
  // components/car-image.tsx em vez de passarem pelo optimizer do Next. Um
  // allowlist aqui teria o mesmo problema do `images.remotePatterns`: obrigava
  // a editar este ficheiro e a fazer redeploy sempre que uma fonte nova
  // entrasse, e o preço do engano é a foto sumir sem ninguém dar por isso.
  // `https:` aceita imagens de qualquer origem, mas continua a barrar `http:`
  // (conteúdo misto) e `data:`… que se admite à mesma para os placeholders.
  "img-src 'self' data: blob: https:",

  // O vídeo do hero (public/video/hero-camiao.mp4) é nosso e é o único.
  "media-src 'self'",

  // Chamadas XHR/fetch: só à nossa API. No dev acresce o websocket do Fast
  // Refresh, que de outra forma reportava violação a cada guardar de ficheiro.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,

  // A app não embebe nada nem é embebida (o X-Frame-Options acima diz o mesmo,
  // mas esse é o header antigo; frame-ancestors é o que os browsers seguem).
  "frame-src 'none'",
  "frame-ancestors 'none'",

  // Sem Flash/applets, e os formulários só submetem para nós — trava o truque
  // de injetar um <form> que envia a password para outro sítio.
  "object-src 'none'",
  "form-action 'self'",
  // Impede que um <base> injetado redirecione todos os URLs relativos.
  "base-uri 'self'",
].join("; ");

/**
 * Cabeçalhos de segurança aplicados a todas as respostas.
 * Objetivo: reduzir a superfície de ataque (clickjacking, sniffing,
 * fuga de referrer, acesso a APIs do browser) sem partir a app.
 */
const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  // Impede que o site seja embebido noutro (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o browser de "adivinhar" tipos de conteúdo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não vaza o URL completo (com tokens) para sites externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs que a app não usa.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Isola a origem contra ataques cross-origin (Spectre-like).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Força HTTPS durante 2 anos (só tem efeito em HTTPS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Não anunciar a stack.
  poweredByHeader: false,

  // Imagens externas autorizadas no <Image>: SÓ o catálogo ultimatespecs
  // (imagem principal da versão/galeria do modelo — ver Listing.catalogImage).
  //
  // As fotos dos próprios anúncios (AutoScout24, leparking, olxcdn…) NÃO entram
  // aqui de propósito: são ~24 CDNs e cada coletor novo traz mais, portanto um
  // allowlist obrigaria a editar este ficheiro + redeploy só para a foto não
  // rebentar. Servem-se com <img> normal em components/car-image.tsx.
  // Ver docs/07-FRONTEND-HANDOFF.md.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.ultimatespecs.com", pathname: "/cargallery/**" },
    ],
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

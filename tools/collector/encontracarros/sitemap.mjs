// encontracarros/sitemap.mjs — enumeração dos anúncios a partir do sitemap.xml.
//
// PORQUÊ o sitemap é a espinha dorsal deste coletor: a listagem `/pesquisa` é client-side (sem dados
// no HTML puro), mas o `sitemap.xml` publica ~50.000 URLs `/anuncio/…` COM `<lastmod>` (ISO). Ou seja,
// dá-nos de graça: (1) a ENUMERAÇÃO completa dos anúncios (para o batch/--full), e (2) um sinal de
// RECÊNCIA real (o `lastmod`) — algo que a maioria dos outros coletores não tem, e que torna o watch
// preciso (poll dos que mudaram desde a última vez).
//
// LIMITE: o sitemap.xml traz EXATAMENTE 50.000 <url> (o teto do protocolo por ficheiro). Não há
// sitemap-index nem sitemap-1.xml (404) → 50k é o universo alcançável, e são os MAIS RECENTES
// (lastmod dos últimos dias). O site anuncia "100.000+ anúncios" → recolhemos ~metade (a metade viva/
// recente). O "1,67M" reportado é global/inflacionado — não corresponde ao catálogo PT real.

export const SITEMAP_URL = 'https://encontracarros.pt/sitemap.xml';

// id do anúncio = os 6 caracteres alfanuméricos no fim do slug (`…-usado-porto-jbhq50`). Chave global
// de dedupe/estado. É estável (não muda entre recolhas).
export function idFromUrl(url) {
  const m = /-([a-z0-9]{6})(?:[/?#]|$)/i.exec(url || '');
  return m ? m[1].toLowerCase() : null;
}

// slug de marca = o 1º segmento do slug do anúncio (`/anuncio/{marca}-…`). Best-effort: marcas com
// várias palavras vêm com hífen (ex. `mercedes-benz`, `alfa-romeo`) → o filtro por `--brand` usa
// `startsWith("{slug}-")`, pelo que "mercedes" apanha "mercedes-benz" e "mercedes-amg".
function brandSlugFromUrl(url) {
  const m = /\/anuncio\/([a-z0-9-]+?)-/i.exec(url || '');
  return m ? m[1].toLowerCase() : null;
}

// Faz o parse do sitemap.xml → array de entradas { url, id, lastmod, brandSlug }, ORDENADO por
// lastmod DESC (mais recentes primeiro). A ordem do ficheiro não é cronológica → ordenamos nós.
export async function fetchSitemap(http) {
  const xml = await http.fetchText(SITEMAP_URL);
  if (!xml) return [];
  const out = [];
  // Cada <url> tem <loc> e (quase sempre) <lastmod>. Percorremos bloco a bloco.
  const re = /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1].trim();
    if (!/\/anuncio\//.test(url)) continue;         // só páginas de anúncio
    const id = idFromUrl(url);
    if (!id) continue;
    out.push({ url, id, lastmod: m[2] ? m[2].trim() : null, brandSlug: brandSlugFromUrl(url) });
  }
  // Mais recentes primeiro: a amostra (--max-pages) e o watch veem logo os anúncios frescos.
  out.sort((a, b) => String(b.lastmod).localeCompare(String(a.lastmod)));
  return out;
}

// district slug = o token imediatamente antes do id de 6 chars (`…-usado-{distrito}-jbhq50`). Usado
// pelo filtro `--district`. Best-effort (distritos com espaço vêm com hífen, ex. `viana-do-castelo`).
export function districtSlugFromUrl(url) {
  const m = /-([a-z0-9-]+)-[a-z0-9]{6}(?:[/?#]|$)/i.exec(url || '');
  return m ? m[1].toLowerCase() : null;
}

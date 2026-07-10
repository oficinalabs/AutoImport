// sitemap.mjs — enumeração de marcas/modelos a partir do sitemap.xml.
//
// PORQUÊ: a paginação de um país sozinho tem um limite prático e repete resultados.
// Para COBERTURA MÁXIMA (modo --full) fatiamos por país × marca-modelo. O sitemap.xml
// do theparking.eu lista ~13.800 páginas `/models/{slug}.html` — usamos esses slugs
// como filtros de query. No modo amostra este módulo não é necessário.

// Extrai os slugs de marca/modelo do sitemap (ex. "bmw", "bmw-serie-3").
export async function fetchModelSlugs(http) {
  const xml = await http.fetchText('https://www.theparking.eu/sitemap.xml');
  if (!xml) return [];
  const slugs = new Set();
  const re = /\/models\/([a-z0-9-]+)\.html/gi;
  let m;
  while ((m = re.exec(xml)) !== null) slugs.add(m[1]);
  return [...slugs];
}

// parse.ts — parsing das três camadas do ultimatespecs.com (regex sobre HTML SSR, sem browser).
//
// 1. sitemapversions.xml (índice) → sub-sitemaps → ~6300 páginas de MODELO/geração
//    (/car-specs/{Make}/M{id}/{Slug}).
// 2. Página de modelo: tabelas `table_versions` agrupadas por combustível (`versions_div`),
//    uma linha por VERSÃO com nome, ano, potência e cilindrada — chega para o matching.
// 3. Página de versão (--deep): tabelas `label : valor` com a ficha completa (CO₂, código
//    do motor, binário, caixa, norma Euro…).

import type { DeepSpecs, ModelRef, VersionRecord } from './schema.ts';
import { BASE } from './http.ts';

const deentity = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

// Texto de um fragmento HTML: remove tags e colapsa espaços.
const text = (s: string) => deentity(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const toNum = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// <loc>…</loc> de um sitemap (índice ou folha).
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

// URL de página de modelo → ModelRef (null para URLs que não seguem /car-specs/{Make}/M{id}/{Slug}).
export function parseModelUrl(url: string): ModelRef | null {
  const m = url.match(/\/car-specs\/([^/]+)\/(M\d+)\/([^/?#]+)$/);
  if (!m) return null;
  const [, makeSlug, mid, slug] = m;
  const yearMatch = slug.match(/-(\d{4})$/);
  const modelYear = yearMatch ? Number(yearMatch[1]) : null;
  const model = (modelYear ? slug.slice(0, -5) : slug).replace(/-/g, ' ').trim();
  return {
    make: makeSlug.replace(/-/g, ' ').trim(),
    mid,
    slug,
    model,
    modelYear,
    url: new URL(url, BASE).toString(),
  };
}

// URLs de imagem do próprio carro (CDN `cargallery`, protocolo-relativo → https).
// Nas páginas de modelo o path contém o nº do modelo; os widgets "carros relacionados"
// usam outros nºs — filtramos por `pathId` quando fornecido.
export function parseGalleryImages(html: string, pathId?: string): string[] {
  const urls = [...html.matchAll(/(?:src|href)="((?:https?:)?\/\/www\.ultimatespecs\.com\/cargallery\/[^"]+)"/g)]
    .map((m) => m[1].replace(/^\/\//, 'https://'));
  const filtered = pathId ? urls.filter((u) => u.includes(`/${pathId}/`)) : urls;
  return [...new Set(filtered)];
}

// Página de modelo → versões. As secções `versions_div` têm id `{fuel}_engines`; dentro,
// linhas <tr> com <a href="/car-specs/{Make}/{id}/{slug}.html">nome</a> | ano | hp/kW | cc.
export function parseModelPage(html: string, ref: ModelRef, collectedAt: string): VersionRecord[] {
  const out: VersionRecord[] = [];
  const modelImages = parseGalleryImages(html, ref.mid.slice(1)); // "M27110" → path /27110/
  const sections = [...html.matchAll(
    /<div class=['"]versions_div['"] id=['"](\w+)_engines['"]>([\s\S]*?)(?=<div class=['"]versions_div['"]|<\/section|$)/g,
  )];
  for (const [, fuelSection, body] of sections) {
    for (const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
      if (!cells.length) continue;
      const link = cells[0].match(/href="(\/car-specs\/[^/]+\/(\d+)\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/);
      if (!link) continue; // cabeçalho da tabela ou linha sem versão
      const [, path, versionId, nameHtml] = link;
      const powerTxt = text(cells[2] ?? '');
      const kw = powerTxt.match(/(\d+(?:\.\d+)?)\s*kW/i);
      out.push({
        source: 'ultimatespecs',
        versionId,
        url: new URL(path, BASE).toString(),
        mid: ref.mid,
        make: ref.make,
        model: ref.model,
        modelSlug: ref.slug,
        modelYear: ref.modelYear,
        modelImages,
        name: text(nameHtml),
        fuelSection,
        year: toNum(text(cells[1] ?? '')),
        powerHp: toNum(powerTxt),
        powerKw: kw ? Number(kw[1]) : null,
        displacementCc: toNum(text(cells[3] ?? '')),
        collectedAt,
      });
    }
  }
  return out;
}

// Linhas `label : valor` da página de versão → mapa cru {label: valor}.
// Estrutura: <td class="tabletd" align="right">Label :</td><td class="tabletd_right">Valor</td>.
export function parseSpecRows(html: string): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const m of html.matchAll(
    /<td[^>]*class="tabletd"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="tabletd_right"[^>]*>([\s\S]*?)<\/td>/g,
  )) {
    const label = text(m[1]).replace(/\s*:\s*$/, '');
    const value = text(m[2]);
    // "-" é o marcador de "sem dado" do site → tratar como ausente.
    if (label && value && value !== '-' && !(label in specs)) specs[label] = value;
  }
  return specs;
}

// Página de versão → ficha normalizada (+ specs cruas). `find` tolera variações de label.
export function parseVersionPage(html: string): DeepSpecs {
  const specs = parseSpecRows(html);
  const find = (re: RegExp): string | null => {
    for (const [k, v] of Object.entries(specs)) if (re.test(k)) return v;
    return null;
  };
  const co2Wltp = toNum(find(/^CO2 emissions WLTP/i));
  const co2Plain = toNum(find(/^CO2 emissions(?! WLTP)/i));
  return {
    generation: find(/^Generation$/i),
    body: find(/^Body$/i),
    doors: toNum(find(/^Num\. of Doors/i)),
    seats: toNum(find(/^Num\. of Seats/i)),
    fuel: find(/^Fuel type$/i),
    engineCode: find(/^Engine Code$/i),
    cylinders: find(/^Engine type - Number of cylinders/i),
    torqueNm: toNum(find(/^Maximum torque/i)),
    drivetrain: find(/^Drive wheels/i),
    gearbox: find(/^Transmission Gearbox/i),
    co2Wltp,
    co2Nedc: co2Plain,
    emissionStandard: find(/^Emission standard/i),
    curbWeightKg: toNum(find(/^Curb Weight/i)),
    // imagem principal (w800); os widgets "relacionados" usam w400
    imageUrl: parseGalleryImages(html).find((u) => u.includes('w800_')) ?? null,
    specs,
  };
}

// parse.ts — extração dos dados de uma página de listagem do theparking.eu.
//
// PORQUÊ JSON-LD: cada página de listagem embute 27 blocos `schema.org/Vehicle`
// (`<script type="application/ld+json">`), um por anúncio. É a forma mais robusta de
// extrair (imune a mudanças de CSS) e o site publica-os de propósito para máquinas.
//
// Fluxo: (1) extrair os blocos Vehicle; (2) extrair a fonte original de cada card
// (o JSON-LD não a traz); (3) juntar vehicle<->fonte pelo ID do anúncio.

import { normalizeVehicle, type TheparkingRecord } from './schema.ts';

// Domínios que aparecem nos cards mas NÃO são a fonte do anúncio (CDN, afiliados, o
// próprio agregador). Excluídos ao detetar a fonte original.
const NAO_FONTE = /^(cloud\.)?leparking|theparking|ads4all|carvertical|stripe|dasparking|admin\./i;

// ID do anúncio = os 6+ caracteres alfanuméricos antes de ".html" no URL de detalhe.
// É a chave de junção entre o JSON-LD (offers.url) e o card (href).
function idDoUrl(url: unknown): string | null {
  const m = /([A-Z0-9]{6,})\.html/i.exec(String(url || ''));
  return m ? m[1] : null;
}

// (1) Extrai todos os blocos JSON-LD `Vehicle` da página.
// GOTCHA: o theparking.eu mete quebras de linha/tabs LITERAIS dentro das strings
// (campos `name`/`description`), o que é JSON inválido → `JSON.parse` rebenta com
// "Bad control character". Sanitizamos os caracteres de controlo para espaços antes.
export function extractVehicles(html: string) {
  const out = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const limpo = m[1].replace(/[\n\r\t]+/g, ' ');
    try {
      const j = JSON.parse(limpo);
      if (j && j['@type'] === 'Vehicle') out.push(j);
    } catch { /* bloco não-Vehicle ou malformado — ignorar */ }
  }
  return out;
}

// (2) Mapa ID -> fonte original, lendo os cards `li.li-result`.
// Em vez de depender da tag de fecho </li> (frágil com aninhamento), dividimos o HTML
// nos pontos onde começa cada card e analisamos o pedaço de cada um.
export function extractCardSources(html: string) {
  const map = new Map<string, string | null>();
  // Índices onde começa cada card.
  const marca = /<li class="[^"]*li-result/gi;
  const inicios = [];
  let m;
  while ((m = marca.exec(html)) !== null) inicios.push(m.index);
  for (let i = 0; i < inicios.length; i++) {
    const chunk = html.slice(inicios[i], inicios[i + 1] ?? html.length);
    const id = idDoUrl((/\/used-cars-detail\/[^"']+?\.html/.exec(chunk) || [])[0]);
    if (!id) continue;
    // Primeiro domínio "real" do card (ignorando CDN/afiliados/agregador).
    // Domínios podem vir colados a texto em maiúsculas (ex. "RICOgocar.be") → limpar
    // o prefixo em maiúsculas antes do domínio minúsculo.
    let fonte: string | null = null;
    const domRe = /([A-Za-z0-9-]+\.(?:be|nl|de|fr|com|pt|es|it|lu|at))/g;
    let d;
    while ((d = domRe.exec(chunk)) !== null) {
      const dom = d[1].replace(/^[A-Z]+(?=[a-z])/, '');
      if (!NAO_FONTE.test(dom)) { fonte = dom; break; }
    }
    map.set(id, fonte);
  }
  return map;
}

// (3) Parse completo de uma página → registos normalizados (com fonte anexada).
export function parseListingPage(html: string, { collectedAt = null }: { collectedAt?: string | null } = {}): TheparkingRecord[] {
  const vehicles = extractVehicles(html);
  const fontes = extractCardSources(html);
  return vehicles.map((v) => {
    const id = idDoUrl(v.offers?.url);
    return normalizeVehicle(v, { source: id ? fontes.get(id) ?? null : null, collectedAt });
  });
}

// Total de resultados da query (contador `nb_results` embutido no HTML). Útil para
// planear/relatar volume. Devolve null se não encontrar.
export function readNbResults(html: string): number | null {
  const m = /nb_results["'\s:]+?(\d{1,9})/.exec(html);
  return m ? Number(m[1]) : null;
}

// ID público de um registo (para dedupe). Usa o URL de detalhe.
export function recordId(rec: TheparkingRecord): string | null {
  return idDoUrl(rec.detail_url) || rec.detail_url || null;
}

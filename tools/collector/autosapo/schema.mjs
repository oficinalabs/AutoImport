// autosapo/schema.mjs — schema-alvo comum + mapeamento de um anúncio do auto.sapo.pt.
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver
// lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um
// cartão da listagem no registo comum, estendido com os extras que o auto.sapo.pt oferece.
//
// NOTA sobre o Auto SAPO: é um MARKETPLACE nacional (não retalhista de stock próprio nem agregador
// externo). Serve particulares (grátis) E profissionais (stands). Porém o CARTÃO da listagem NÃO
// distingue o vendedor nem expõe distrito/caixa/cor/carroçaria — esses campos vivem só na página de
// DETALHE (dataLayer + JSON-LD), preenchidos opcionalmente via `applyDetail` (flag --detail). Por
// isso, na recolha por cartão, `source` = 'Auto SAPO' (o marketplace) e gearbox/color/category/
// region/postalCode = null por design. Ver research/autosapo-investigacao.md.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
import { BASE, PAIS, MOEDA } from './http.mjs';
import { splitMakeModel, parseSpan, oidToDate } from './parse.mjs';
export { CAMPOS, toInt, cleanStr };

// Absolutiza um URL relativo do site (imagens/detalhe vêm como "/carro-usado/…").
function abs(u) {
  const s = cleanStr(u);
  if (!s) return null;
  return s.startsWith('http') ? s : BASE + (s.startsWith('/') ? '' : '/') + s;
}

// Ano/km/combustível vêm nos <li> do cartão, sem ordem garantida → identifica por padrão.
function parseLis(lis = []) {
  let year = null, km = null, fuel = null;
  for (const t of lis) {
    if (year === null && /^\d{4}$/.test(t)) { year = Number(t); continue; }
    if (km === null && /km/i.test(t)) { km = toInt(t); continue; }
    if (fuel === null && /[a-zA-Z]/.test(t)) fuel = t;   // o restante alfabético = combustível
  }
  return { year, km, fuel };
}

// --- mapeamento cartão da listagem -> registo normalizado --------------------
//
// Mapa (referência rápida):
//   h3 (marca+modelo) ÷ lista de marcas   -> make / model
//   <span> (variante - Ncv - NP)          -> variant / power_cv / doors
//   <li> ano                              -> year
//   <li> km                               -> km
//   <li> combustível                      -> fuel
//   .price                                -> price
//   MOEDA / PAIS                          -> currency (EUR) / country (PORTUGAL)
//   (só no detalhe)                       -> gearbox/color/category/region/postalCode = null
//   'Auto SAPO'                            -> source (marketplace; o stand vem no --detail)
//   href /carro-usado/{id}/{slug}          -> detail_url  (+ id = ObjectId = chave/recência)
//   <img src>                             -> image
// Extras: source_site, id, power_cv, published_at (do ObjectId), highlighted (anúncio "Em destaque").
export function normalizeCard(c, { brandSet = null, collectedAt = null } = {}) {
  const { make, model } = splitMakeModel(c.makeModel, brandSet);
  const { variant, power_cv, doors } = parseSpan(c.span);
  const { year, km, fuel } = parseLis(c.lis);
  return {
    // --- campos comuns (uniformes entre coletores) ---
    make: cleanStr(make),
    model: cleanStr(model),
    variant,
    year,
    km,
    fuel: cleanStr(fuel),
    gearbox: null,                                   // só no detalhe (vehicleTransmission)
    engine: null,                                    // cilindrada só no detalhe (--detail → engine_cc)
    color: null,                                     // só no detalhe
    doors,
    category: null,                                  // carroçaria só no detalhe
    price: toInt(c.priceRaw),
    currency: MOEDA,
    country: PAIS,
    region: null,                                    // distrito só no detalhe (ou via --slice localizacao)
    postalCode: null,
    source: 'Auto SAPO',                             // marketplace (vendedor concreto vem no --detail)
    detail_url: c.slug ? `${BASE}/carro-usado/${c.id}/${c.slug}` : null,
    image: abs(c.imageRaw),
    collected_at: collectedAt,
    // --- extras próprios do auto.sapo.pt ---
    source_site: 'auto.sapo.pt',
    id: cleanStr(c.id),                              // ObjectId (chave natural + recência)
    power_cv: power_cv ?? null,
    published_at: oidToDate(c.id),                   // recência (timestamp embutido no ObjectId)
    highlighted: Boolean(c.highlighted),             // anúncio promovido ("Em destaque")
  };
}

// --- enriquecimento por detalhe (flag --detail) ------------------------------
// Preenche os campos que o cartão não tem, a partir dos extras da página de detalhe (ver
// parse.parseDetail). Só sobrescreve quando o detalhe traz valor (não apaga o que o cartão já tinha).
export function applyDetail(rec, d = {}) {
  if (!d) return rec;
  const set = (k, v) => { if (v != null && v !== '') rec[k] = v; };
  set('gearbox', d.gearbox);
  set('color', d.color);
  set('category', d.category);
  set('region', d.region);                           // distrito
  set('engine', d.engine_cc);
  // extras ricos do detalhe:
  rec.locality = d.locality ?? null;                 // concelho/freguesia
  rec.seats = d.seats ?? null;
  rec.vin = d.vin ?? null;
  rec.interior_color = d.interior_color ?? null;
  rec.interior_type = d.interior_type ?? null;
  rec.drive_train = d.drive_train ?? null;
  rec.seller_type = d.seller_type ?? null;           // particular | profissional
  rec.national = d.national ?? null;                 // matrícula nacional vs importado
  rec.dealer = d.dealer ?? null;                     // nome do stand (quando profissional)
  if (d.seller_type) rec.source = d.dealer || (d.seller_type === 'particular' ? 'Particular' : 'Auto SAPO');
  return rec;
}

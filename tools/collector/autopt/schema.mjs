// autopt/schema.mjs — schema-alvo comum + mapeamento do card `car_listing_entry` (+ Vehicle do
// JSON-LD) do auto.pt para o registo normalizado comum (ver lib/normalize.mjs).
//
// PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado, para comparar
// preços PT vs. UE de forma uniforme. O auto.pt é SSR (Symfony): a listagem `/carros-usados` traz
// DUAS fontes por página, alinhadas:
//   (1) CARD HTML (`<a data-testid="car_listing_entry" id="item_XXXX">`) — fonte PRINCIPAL: tem o
//       `id` (referenceNumber), o URL de detalhe, o título (marca+modelo/variante), o preço, o
//       VENDEDOR (nome do stand) e o DISTRITO, e uma `<ul>` de 3 itens [combustível, ano, km].
//   (2) JSON-LD `Vehicle` (num `OfferCatalog` dentro do bloco `WebPage.mainEntity`) — enriquece com
//       a marca/modelo já SEPARADOS (o card junta-os no `<h2>`), a imagem e a condição (usado). Não
//       tem `url`/`id` → junta-se ao card por POSIÇÃO via o `ItemList` (ver parse.mjs).
//
// ⚠️ PARTICULAR vs. EMPRESA: o card de um STAND traz um `<span class="… text-primary …">` com o
// nome; o card de um PARTICULAR NÃO traz esse span (só o distrito). Logo: vendedor presente →
// `owner_type='empresa'` e `source`=nome do stand; ausente → `owner_type='particular'` e
// `source='Particular'` (como no quoka). Ver research/autopt-investigacao.md.
//
// Campos SEM equivalente na listagem (só no detalhe): gearbox, engine(cilindrada), color, doors,
// category(segmento) → ficam `null`.

import { CAMPOS_BASE as CAMPOS, toInt, cleanStr } from '../lib/normalize.mjs';
export { CAMPOS, toInt, cleanStr };

// Decodifica as entidades HTML comuns dos títulos/nomes PT (&amp; &quot; &#039; acentos numéricos).
export function decodeEntities(s) {
  if (s == null) return null;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&atilde;/g, 'ã')
    .replace(/&otilde;/g, 'õ').replace(/&ccedil;/g, 'ç').replace(/&acirc;/g, 'â');
}

// `year` do JSON-LD: `vehicleModelDate` é uma data ISO com o dia/hora sintéticos ("2024-01-01T…")
// — só o ANO é real. Extraímo-lo dos 4 primeiros dígitos.
function yearFromModelDate(d) {
  const m = /^(\d{4})/.exec(String(d ?? ''));
  return m ? Number(m[1]) : null;
}

// Normaliza um card (Fonte 1) + o Vehicle do JSON-LD (Fonte 2, opcional) → registo comum + extras.
export function normalizeListing(card, { veh = null, collectedAt = null } = {}) {
  const seller = cleanStr(decodeEntities(card.seller));   // nome do stand, ou null se particular
  const ownerType = seller ? 'empresa' : 'particular';

  // marca/modelo: preferimos o JSON-LD (já separados). Sem JSON-LD, a marca é o 1º token do <h2>
  // e o modelo o resto (best-effort; o join por id garante quase sempre o JSON-LD presente).
  let make = cleanStr(decodeEntities(veh?.brand?.name || veh?.brand));
  let model = cleanStr(decodeEntities(veh?.model));
  if (!make && card.titleMake) {
    const t = decodeEntities(card.titleMake).trim();
    const sp = t.indexOf(' ');
    make = cleanStr(sp > 0 ? t.slice(0, sp) : t);
    model = model || cleanStr(sp > 0 ? t.slice(sp + 1) : null);
  }

  // variant: título completo. Preferimos o `name` do JSON-LD ("Renault Clio TCe 90 Techno"); se
  // faltar, combinamos o <h2> ("Renault Clio") com o <p> da variante ("TCe 90 Techno").
  const variant = cleanStr(decodeEntities(veh?.name))
    || cleanStr(decodeEntities([card.titleMake, card.variant].filter(Boolean).join(' ')));

  const condition = veh?.itemCondition?.name || veh?.itemCondition;
  const isUsed = condition ? /Used/i.test(String(condition)) : null;

  return {
    // --- campos comuns (uniformes entre coletores) ---
    make,
    model,
    variant,
    year: yearFromModelDate(veh?.vehicleModelDate) ?? toInt(card.year),
    km: toInt(veh?.mileageFromOdometer?.value ?? veh?.mileageFromOdometer) ?? toInt(card.km),
    fuel: cleanStr(veh?.fuelType || decodeEntities(card.fuel)),
    gearbox: null,                                  // não exposto na listagem (só no detalhe)
    engine: null,                                   // cilindrada não exposta na listagem
    color: null,                                    // não exposto na listagem
    doors: null,                                    // não exposto na listagem
    category: null,                                 // segmento não exposto por card
    price: toInt(card.price) ?? toInt(veh?.offers?.priceSpecification?.price ?? veh?.offers?.price),
    currency: 'EUR',
    country: 'PORTUGAL',
    region: cleanStr(decodeEntities(card.district)),  // distrito
    postalCode: null,                               // só distrito na listagem
    source: seller || 'Particular',                 // stand (empresa) ou "Particular" (P2P)
    detail_url: cleanStr(card.detailUrl),
    image: cleanStr(veh?.image || card.image),
    collected_at: collectedAt,

    // --- extras próprios do auto.pt ---
    source_site: 'auto.pt',
    id: cleanStr(card.id),                           // referenceNumber (chave de dedupe/join)
    owner_type: ownerType,                           // 'empresa' | 'particular'
    dealer: seller,                                  // nome do stand (null se particular)
    condition: isUsed === null ? null : (isUsed ? 'Usado' : 'Novo'),
  };
}

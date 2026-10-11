/**
 * IVA da compra: que regime se aplica ao stand e quanto custa de facto o carro.
 * Estudos por país em AutoImport-plano/paises/ (out. 2026); a regra de cada
 * país está ao lado da taxa.
 */
import type { CountryCode } from "../types";
import type { SourceVatRegime, VatRegime } from "./types";

/**
 * Taxa normal de IVA na origem (out. 2026).
 *  - DE 19 %: § 12 Abs. 1 UStG — https://www.gesetze-im-internet.de/ustg_1980/__12.html
 *  - FR 20 %: art. 278 CGI — https://bofip.impots.gouv.fr/bofip/1376-PGP.html
 *  - BE 21 %, NL 21 %, ES 21 % (art. 90 Ley 37/1992 — https://www.boe.es/eli/es/l/1992/12/28/37/con)
 */
export const VAT_RATE_ORIGIN: Record<CountryCode, number> = {
  DE: 0.19,
  FR: 0.2,
  BE: 0.21,
  NL: 0.21,
  ES: 0.21,
};

/** IVA normal em Portugal continental (CIVA art. 18.º). */
export const VAT_RATE_PT = 0.23;

/**
 * Regime aplicado na conta. `dedutivel` só se o anúncio o declarar **e** o
 * stand tiver n.º de IVA no VIES (entrega intracomunitária isenta). Tudo o
 * resto — margem, particular ou a fonte não diz — é margem: o lado seguro, que
 * não inventa um desconto (DEFAULT, plano §5).
 *
 * NL: os preços incluem a BPM, que não entra na base do IVA (estudo NL §3, §6.5).
 * Dividir o preço todo por 1,21 subestimava o custo, por isso sem `price_net`
 * publicado o anúncio NL é tratado como margem (DEFAULT, plano §5).
 */
export function applicableRegime(
  sourceVatRegime: SourceVatRegime | null | undefined,
  country: CountryCode,
  standVatRegistered: boolean,
  priceNet?: number | null,
): VatRegime {
  if (sourceVatRegime !== "dedutivel" || !standVatRegistered) return "margem";
  if (country === "NL" && priceNet == null) return "margem";
  return "dedutivel";
}

/**
 * Custo de compra efetivo. Dedutível: o preço líquido publicado ou, sem ele,
 * preço ÷ (1 + IVA da origem). Margem: o preço anunciado.
 */
export function originPriceNet(
  price: number,
  country: CountryCode,
  regime: VatRegime,
  priceNet?: number | null,
): number {
  if (regime === "margem") return price;
  return priceNet ?? Math.round(price / (1 + VAT_RATE_ORIGIN[country]));
}

/**
 * Caução de IVA que o vendedor costuma reter até chegar a prova de transporte
 * (estudo DE §3.5, FR §2). Dinheiro parado, não custo: só para mostrar.
 */
export function vatDeposit(price: number, netPrice: number): number {
  return Math.max(0, price - netPrice);
}

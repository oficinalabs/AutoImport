/**
 * Seed das fontes com coletor em tools/collector (o slug = `source_site`
 * emitido pelos coletores). As restantes ~180 fontes investigadas em
 * research/sites-stands-por-pais-2026.md só entram quando tiverem coletor.
 * kind: marketplace | agregador | rede_stands | particulares (docs/04).
 */

export interface SourceSeed {
  slug: string;
  name: string;
  /** ISO-2; null = pan-europeia */
  country: string | null;
  kind: "marketplace" | "agregador" | "rede_stands" | "particulares";
}

export const SOURCES: SourceSeed[] = [
  // ── Estrangeiro ──────────────────────────────────────────────
  { slug: "autoscout24.de", name: "AutoScout24", country: null, kind: "marketplace" },
  { slug: "autotrader.nl", name: "AutoTrader.nl", country: "NL", kind: "marketplace" },
  { slug: "theparking.eu", name: "theParking", country: null, kind: "agregador" },
  { slug: "autoboerse.de", name: "Autobörse", country: "DE", kind: "marketplace" },
  { slug: "meinauto.de", name: "MeinAuto", country: "DE", kind: "marketplace" },
  { slug: "quoka.de", name: "Quoka", country: "DE", kind: "particulares" },
  { slug: "autohero.com", name: "Autohero", country: "DE", kind: "rede_stands" },
  { slug: "aramisauto.com", name: "Aramisauto", country: "FR", kind: "rede_stands" },
  { slug: "ooyyo.com", name: "Ooyyo", country: null, kind: "agregador" },
  { slug: "autoline.pt", name: "Autoline", country: "BE", kind: "marketplace" },
  { slug: "autocasion.com", name: "Autocasión", country: "ES", kind: "marketplace" },
  { slug: "ocasionplus.com", name: "OcasionPlus", country: "ES", kind: "rede_stands" },
  { slug: "flexicar.es", name: "Flexicar", country: "ES", kind: "rede_stands" },
  { slug: "coches.trovit.es", name: "Trovit", country: "ES", kind: "agregador" },
  // ── AutoUncle multi-país (mesmo coletor; autouncle.pt está na secção PT) ──
  { slug: "autouncle.de", name: "AutoUncle DE", country: "DE", kind: "agregador" },
  { slug: "autouncle.dk", name: "AutoUncle DK", country: "DK", kind: "agregador" },
  { slug: "autouncle.se", name: "AutoUncle SE", country: "SE", kind: "agregador" },
  { slug: "autouncle.it", name: "AutoUncle IT", country: "IT", kind: "agregador" },
  { slug: "autouncle.at", name: "AutoUncle AT", country: "AT", kind: "agregador" },
  { slug: "autouncle.es", name: "AutoUncle ES", country: "ES", kind: "agregador" },
  { slug: "autouncle.pl", name: "AutoUncle PL", country: "PL", kind: "agregador" },
  { slug: "autouncle.fi", name: "AutoUncle FI", country: "FI", kind: "agregador" },
  { slug: "autouncle.ro", name: "AutoUncle RO", country: "RO", kind: "agregador" },
  { slug: "autouncle.ch", name: "AutoUncle CH", country: "CH", kind: "agregador" },
  { slug: "autouncle.co.uk", name: "AutoUncle UK", country: "GB", kind: "agregador" },
  { slug: "autouncle.nl", name: "AutoUncle NL", country: "NL", kind: "agregador" },
  { slug: "autouncle.fr", name: "AutoUncle FR", country: "FR", kind: "agregador" },
  // ── Portugal (baseline de preço PT) ──────────────────────────
  { slug: "standvirtual.com", name: "Standvirtual", country: "PT", kind: "marketplace" },
  { slug: "olx.pt", name: "OLX", country: "PT", kind: "marketplace" },
  { slug: "custojusto.pt", name: "CustoJusto", country: "PT", kind: "marketplace" },
  { slug: "auto.sapo.pt", name: "auto SAPO", country: "PT", kind: "marketplace" },
  { slug: "auto.pt", name: "Auto.pt", country: "PT", kind: "marketplace" },
  { slug: "piscapisca.pt", name: "PiscaPisca", country: "PT", kind: "marketplace" },
  { slug: "autouncle.pt", name: "AutoUncle", country: "PT", kind: "agregador" },
  { slug: "encontracarros.pt", name: "EncontraCarros", country: "PT", kind: "agregador" },
  { slug: "caetano.pt", name: "Caetano Usados", country: "PT", kind: "rede_stands" },
  { slug: "carplus.pt", name: "CarPlus", country: "PT", kind: "rede_stands" },
  { slug: "santogal.pt", name: "Santogal", country: "PT", kind: "rede_stands" },
];

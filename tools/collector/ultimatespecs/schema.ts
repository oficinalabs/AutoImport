// schema.ts — registo de CATÁLOGO do ultimatespecs.com (referência de versões, não anúncios).
//
// PORQUÊ: ao contrário dos outros coletores (anúncios de carros à venda), este recolhe a
// ficha técnica de cada VERSÃO de modelo para alimentar o matching (designação + potência +
// cilindrada + combustível) e, em modo --deep, o cost engine (CO₂ WLTP/NEDC, norma Euro).
// Não usa CAMPOS_BASE/Sink: o destino é um NDJSON de referência, não a tabela listings.

// Página de modelo/geração no sitemap (ex. /car-specs/Kia/M27110/Stonic-2021).
export interface ModelRef {
  make: string;        // "Kia" (segmento do URL, com hífens → espaços)
  mid: string;         // "M27110"
  slug: string;        // "Stonic-2021"
  model: string;       // "Stonic" (slug sem o ano final, hífens → espaços)
  modelYear: number | null; // 2021 (ano no fim do slug; null quando não há)
  url: string;         // absoluto
}

// Uma versão listada na página de modelo (tabela `table_versions`, agrupada por combustível).
export interface VersionRecord {
  source: 'ultimatespecs';
  versionId: string;          // "141870" (id numérico do URL da versão)
  url: string;                // absoluto .html
  mid: string;                // "M27110" — página de modelo de origem (FK em us_models)
  make: string;
  model: string;              // do ModelRef (ex. "Stonic")
  modelSlug: string;          // "Stonic-2021" — distingue gerações/facelifts
  modelYear: number | null;
  /** galeria da página de modelo — URLs diretos ultimatespecs (não descarregamos imagens) */
  modelImages: string[];
  name: string;               // "Stonic 2021 1.0 T-GDI 100" — a designação para matching
  fuelSection: string;        // secção da tabela: petrol|diesel|electric|pluginhybrid|hybrid|...
  year: number | null;        // coluna "Year" da tabela de versões
  powerHp: number | null;
  powerKw: number | null;
  displacementCc: number | null;
  collectedAt: string;
  deep?: DeepSpecs;           // ficha completa (só com --deep)
}

// Campos normalizados da página da versão (modo --deep); `specs` guarda TODAS as linhas cruas.
export interface DeepSpecs {
  generation: string | null;
  body: string | null;
  doors: number | null;
  seats: number | null;
  fuel: string | null;           // "Petrol" | "Diesel" | ... (linha "Fuel type")
  engineCode: string | null;
  cylinders: string | null;      // "Inline 3"
  torqueNm: number | null;
  drivetrain: string | null;     // FWD | RWD | AWD...
  gearbox: string | null;        // "6 speed Manual"
  co2Wltp: number | null;        // g/km
  co2Nedc: number | null;        // g/km (linha "CO2 emissions" sem WLTP, carros antigos)
  emissionStandard: string | null; // "Euro 6e"
  curbWeightKg: number | null;
  /** imagem principal da página da versão — URL direto ultimatespecs */
  imageUrl: string | null;
  specs: Record<string, string>;
}

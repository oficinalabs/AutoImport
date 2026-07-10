/**
 * Dados de exemplo (mock) para desenvolver o frontend sem backend.
 * ⚠️ Substituir pela ligação real na camada `lib/data.ts` — os componentes
 * nunca importam este ficheiro diretamente. Ver docs/07-FRONTEND-HANDOFF.md.
 */
import type {
  Alert,
  Conversation,
  CountryInsight,
  Deal,
  Listing,
  Stand,
  VehicleModel,
} from "./types";
import { verdictFromSavings } from "./verdict";

type ListingSeed = {
  id: string;
  model: VehicleModel;
  title: string;
  year: number;
  km: number;
  color?: string;
  country: Listing["country"];
  source: string;
  images: number;
  originPrice: number;
  transport: number;
  isv: number;
  iuc: number;
  legalization: number;
  ptEstimate: number;
  sample: number;
  kmTrust: Listing["kmTrust"];
  seenAt: string;
  isFavorite?: boolean;
};

function history(base: number): { month: string; price: number }[] {
  const months = ["Fev", "Mar", "Abr", "Mai", "Jun", "Jul"];
  return months.map((m, i) => ({
    month: m,
    price: Math.round(base * (1 + (i - 5) * 0.012)),
  }));
}

function build(s: ListingSeed): Listing {
  const totalPt = s.originPrice + s.transport + s.isv + s.iuc + s.legalization;
  const savings = s.ptEstimate - totalPt;
  const savingsPct = (savings / s.ptEstimate) * 100;
  return {
    id: s.id,
    model: s.model,
    title: s.title,
    year: s.year,
    km: s.km,
    color: s.color,
    country: s.country,
    source: s.source,
    images: Array.from({ length: s.images }, (_, i) => `${s.id}-${i}`),
    cost: {
      originPrice: s.originPrice,
      transport: s.transport,
      isv: s.isv,
      iuc: s.iuc,
      legalization: s.legalization,
      totalPt,
    },
    ptMarket: {
      estimatedPrice: s.ptEstimate,
      sampleSize: s.sample,
      history: history(s.ptEstimate),
    },
    savings,
    savingsPct: Math.round(savingsPct * 10) / 10,
    verdict: verdictFromSavings(savingsPct),
    kmTrust: s.kmTrust,
    seenAt: s.seenAt,
    isFavorite: s.isFavorite ?? false,
  };
}

export const LISTINGS: Listing[] = [
  build({
    id: "l-golf-de",
    model: {
      id: "m-golf-15tsi",
      make: "Volkswagen",
      model: "Golf",
      variant: "1.5 TSI Style",
      fuel: "gasolina",
      transmission: "manual",
      displacementCc: 1498,
      co2: 126,
      powerHp: 150,
    },
    title: "VW Golf 1.5 TSI Style",
    year: 2022,
    km: 45_000,
    color: "Cinzento Urano",
    country: "DE",
    source: "AutoScout24",
    images: 4,
    originPrice: 22_500,
    transport: 700,
    isv: 3_100,
    iuc: 220,
    legalization: 350,
    ptEstimate: 29_900,
    sample: 18,
    kmTrust: { level: "verificado", source: "carVertical" },
    seenAt: "2026-07-10",
    isFavorite: true,
  }),
  build({
    id: "l-serie3-nl",
    model: {
      id: "m-320d",
      make: "BMW",
      model: "Série 3",
      variant: "320d Pack M",
      fuel: "diesel",
      transmission: "automática",
      displacementCc: 1995,
      co2: 138,
      powerHp: 190,
    },
    title: "BMW 320d Pack M",
    year: 2021,
    km: 62_000,
    color: "Preto Safira",
    country: "NL",
    source: "Gaspedaal",
    images: 5,
    originPrice: 27_800,
    transport: 820,
    isv: 4_950,
    iuc: 260,
    legalization: 350,
    ptEstimate: 39_500,
    sample: 12,
    kmTrust: { level: "disponivel", source: "NAP" },
    seenAt: "2026-07-10",
  }),
  build({
    id: "l-a4-be",
    model: {
      id: "m-a4-35tdi",
      make: "Audi",
      model: "A4 Avant",
      variant: "35 TDI S line",
      fuel: "diesel",
      transmission: "automática",
      displacementCc: 1968,
      co2: 129,
      powerHp: 163,
    },
    title: "Audi A4 Avant 35 TDI S line",
    year: 2021,
    km: 71_000,
    color: "Branco Glaciar",
    country: "BE",
    source: "AutoScout24",
    images: 4,
    originPrice: 29_400,
    transport: 780,
    isv: 4_600,
    iuc: 250,
    legalization: 350,
    ptEstimate: 38_900,
    sample: 9,
    kmTrust: { level: "disponivel", source: "Car-Pass" },
    seenAt: "2026-07-09",
  }),
  build({
    id: "l-model3-nl",
    model: {
      id: "m-model3-lr",
      make: "Tesla",
      model: "Model 3",
      variant: "Long Range AWD",
      fuel: "elétrico",
      transmission: "automática",
      co2: 0,
      powerHp: 440,
    },
    title: "Tesla Model 3 Long Range AWD",
    year: 2023,
    km: 34_000,
    color: "Branco Pérola",
    country: "NL",
    source: "Marktplaats",
    images: 5,
    originPrice: 31_200,
    transport: 820,
    isv: 0,
    iuc: 60,
    legalization: 350,
    ptEstimate: 41_500,
    sample: 15,
    kmTrust: { level: "verificado", source: "carVertical" },
    seenAt: "2026-07-10",
    isFavorite: true,
  }),
  build({
    id: "l-formentor-es",
    model: {
      id: "m-formentor-vz",
      make: "Cupra",
      model: "Formentor",
      variant: "2.0 TSI VZ",
      fuel: "gasolina",
      transmission: "automática",
      displacementCc: 1984,
      co2: 168,
      powerHp: 310,
    },
    title: "Cupra Formentor 2.0 TSI VZ",
    year: 2022,
    km: 41_000,
    color: "Cinzento Magnético",
    country: "ES",
    source: "Coches.net",
    images: 4,
    originPrice: 33_900,
    transport: 640,
    isv: 6_200,
    iuc: 320,
    legalization: 350,
    ptEstimate: 46_500,
    sample: 7,
    kmTrust: { level: "por_verificar" },
    seenAt: "2026-07-09",
  }),
  build({
    id: "l-3008-fr",
    model: {
      id: "m-3008-hybrid",
      make: "Peugeot",
      model: "3008",
      variant: "Hybrid 136 Allure",
      fuel: "híbrido",
      transmission: "automática",
      displacementCc: 1199,
      co2: 124,
      powerHp: 136,
    },
    title: "Peugeot 3008 Hybrid 136 Allure",
    year: 2024,
    km: 19_000,
    color: "Azul Celebes",
    country: "FR",
    source: "La Centrale",
    images: 4,
    originPrice: 28_600,
    transport: 700,
    isv: 2_300,
    iuc: 210,
    legalization: 350,
    ptEstimate: 34_200,
    sample: 11,
    kmTrust: { level: "disponivel", source: "Histovec" },
    seenAt: "2026-07-08",
  }),
  build({
    id: "l-classe-c-de",
    model: {
      id: "m-c220d",
      make: "Mercedes-Benz",
      model: "Classe C",
      variant: "C 220 d AMG Line",
      fuel: "diesel",
      transmission: "automática",
      displacementCc: 1993,
      co2: 132,
      powerHp: 200,
    },
    title: "Mercedes C 220 d AMG Line",
    year: 2022,
    km: 55_000,
    color: "Cinzento Selenite",
    country: "DE",
    source: "mobile.de",
    images: 5,
    originPrice: 34_800,
    transport: 720,
    isv: 5_100,
    iuc: 260,
    legalization: 350,
    ptEstimate: 46_900,
    sample: 10,
    kmTrust: { level: "verificado", source: "carVertical" },
    seenAt: "2026-07-10",
  }),
  build({
    id: "l-clio-fr",
    model: {
      id: "m-clio-tce",
      make: "Renault",
      model: "Clio",
      variant: "1.0 TCe Evolution",
      fuel: "gasolina",
      transmission: "manual",
      displacementCc: 999,
      co2: 118,
      powerHp: 90,
    },
    title: "Renault Clio 1.0 TCe Evolution",
    year: 2023,
    km: 28_000,
    color: "Vermelho Flame",
    country: "FR",
    source: "Leboncoin",
    images: 3,
    originPrice: 14_200,
    transport: 700,
    isv: 950,
    iuc: 180,
    legalization: 350,
    ptEstimate: 16_800,
    sample: 21,
    kmTrust: { level: "por_verificar" },
    seenAt: "2026-07-07",
  }),
];

export function findListing(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

export const ALERTS: Alert[] = [
  {
    id: "a-1",
    name: "BMW Série 3 diesel",
    criteria: "BMW Série 3 · diesel · < 42 000 € · > 2020",
    countries: ["DE", "NL", "BE"],
    active: true,
    matchCount: 6,
    lastMatchAt: "2026-07-10",
  },
  {
    id: "a-2",
    name: "Elétricos até 42k",
    criteria: "Elétrico · < 42 000 € · < 60 000 km",
    countries: ["NL", "DE"],
    active: true,
    matchCount: 4,
    lastMatchAt: "2026-07-10",
  },
  {
    id: "a-3",
    name: "Cupra / Seat desportivos",
    criteria: "Cupra, Seat · gasolina · > 250 cv",
    countries: ["ES"],
    active: false,
    matchCount: 2,
    lastMatchAt: "2026-07-05",
  },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c-1",
    listingId: "l-serie3-nl",
    listingTitle: "BMW 320d Pack M",
    listingImage: "l-serie3-nl-0",
    country: "NL",
    savings: 5_320,
    supplierName: "AutoHaus Kessler (via AutoImport)",
    status: "respondido",
    updatedAt: "2026-07-10T14:20:00Z",
    messages: [
      {
        id: "m-1",
        author: "stand",
        body: "Bom dia, o BMW 320d ainda está disponível? Pode enviar mais fotos do interior e confirmar o histórico de manutenção?",
        sentAt: "2026-07-09T09:10:00Z",
      },
      {
        id: "m-2",
        author: "fornecedor",
        body: "Bom dia, sim está disponível. Envio fotos ainda hoje. Tem livro de revisões completo na BMW.",
        sentAt: "2026-07-10T14:20:00Z",
      },
    ],
  },
  {
    id: "c-2",
    listingId: "l-model3-nl",
    listingTitle: "Tesla Model 3 Long Range",
    listingImage: "l-model3-nl-0",
    country: "NL",
    savings: 9_070,
    supplierName: "EV Trade Rotterdam (via AutoImport)",
    status: "aguarda_resposta",
    updatedAt: "2026-07-10T08:00:00Z",
    messages: [
      {
        id: "m-3",
        author: "stand",
        body: "Olá, tenho interesse no Model 3. Consegue tratar da declaração de exportação e ter o carro pronto a levantar na próxima semana?",
        sentAt: "2026-07-10T08:00:00Z",
      },
    ],
  },
  {
    id: "c-3",
    listingId: "l-classe-c-de",
    listingTitle: "Mercedes C 220 d AMG Line",
    listingImage: "l-classe-c-de-0",
    country: "DE",
    savings: 5_670,
    supplierName: "Sternauto GmbH (via AutoImport)",
    status: "acordo",
    updatedAt: "2026-07-08T16:30:00Z",
    messages: [
      {
        id: "m-4",
        author: "stand",
        body: "Fechamos a 34 800 €? Faço transferência de sinal esta semana.",
        sentAt: "2026-07-08T11:00:00Z",
      },
      {
        id: "m-5",
        author: "fornecedor",
        body: "Combinado a 34 800 €. Envio os dados para o sinal e a fatura pró-forma.",
        sentAt: "2026-07-08T16:30:00Z",
      },
    ],
  },
];

export const DEALS: Deal[] = [
  {
    id: "d-1",
    listingId: "l-classe-c-de",
    title: "Mercedes C 220 d AMG Line",
    image: "l-classe-c-de-0",
    country: "DE",
    stage: "pagamento",
    totalPt: 41_230,
    savings: 5_670,
    nextAction: "Enviar comprovativo de sinal ao fornecedor",
    checklist: [
      { label: "Preço acordado", done: true },
      { label: "Fatura pró-forma", done: true },
      { label: "Sinal transferido", done: false },
      { label: "COC recebido", done: false },
    ],
    updatedAt: "2026-07-09T10:00:00Z",
  },
  {
    id: "d-2",
    listingId: "l-serie3-nl",
    title: "BMW 320d Pack M",
    image: "l-serie3-nl-0",
    country: "NL",
    stage: "negociacao",
    totalPt: 34_180,
    savings: 5_320,
    nextAction: "Aguardar fotos e propor preço",
    checklist: [
      { label: "Contacto iniciado", done: true },
      { label: "Fotos / histórico", done: false },
    ],
    updatedAt: "2026-07-10T14:20:00Z",
  },
  {
    id: "d-3",
    listingId: "l-3008-fr",
    title: "Peugeot 3008 Hybrid 136",
    image: "l-3008-fr-0",
    country: "FR",
    stage: "transporte",
    totalPt: 32_160,
    savings: 2_040,
    nextAction: "Confirmar data de recolha com transportadora",
    checklist: [
      { label: "Pago na totalidade", done: true },
      { label: "COC recebido", done: true },
      { label: "Transporte agendado", done: true },
      { label: "Recolhido na origem", done: false },
    ],
    updatedAt: "2026-07-08T09:00:00Z",
  },
  {
    id: "d-4",
    listingId: "l-golf-de",
    title: "VW Golf 1.5 TSI Style",
    image: "l-golf-de-0",
    country: "DE",
    stage: "legalizacao",
    totalPt: 26_870,
    savings: 3_030,
    nextAction: "Submeter DAV e pedido de ISV",
    checklist: [
      { label: "Carro em Portugal", done: true },
      { label: "DAV submetida", done: false },
      { label: "ISV pago", done: false },
      { label: "Inspeção tipo B", done: false },
    ],
    updatedAt: "2026-07-07T09:00:00Z",
  },
];

export const COUNTRY_INSIGHTS: CountryInsight[] = [
  { country: "DE", listingCount: 1240, avgSavings: 4_100 },
  { country: "NL", listingCount: 680, avgSavings: 4_650 },
  { country: "BE", listingCount: 410, avgSavings: 3_500 },
  { country: "FR", listingCount: 910, avgSavings: 2_600 },
  { country: "ES", listingCount: 520, avgSavings: 2_200 },
];

export const STAND: Stand = {
  id: "s-1",
  name: "Stand Costa & Filhos",
  nif: "509 123 456",
  address: "Rua da Estação 120, 4700-223 Braga",
  phone: "+351 253 000 000",
  members: [
    { id: "u-1", name: "Rui Costa", email: "rui@standcosta.pt", role: "owner" },
    { id: "u-2", name: "Miguel Sá", email: "miguel@standcosta.pt", role: "member" },
  ],
  subscription: {
    status: "trial",
    pricePerMonth: 100,
    renewsAt: "2026-08-09",
  },
};

export type Verdict = "compensa" | "marginal" | "nao-compensa";

export type Opportunity = {
  id: string;
  flag: string;
  title: string;
  meta: string;
  finalCost: string;
  saving: string;
  verdict: Verdict;
  verdictLabel: string;
  photo: string;
};

export const STATS = [
  { value: "27 000", label: "anúncios lidos hoje" },
  { value: "174", label: "compensam agora" },
  { value: "2 850 €", label: "poupança mediana" },
  { value: "5", label: "países de origem" },
];

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "bmw-320d",
    flag: "🇩🇪",
    title: "BMW 320d Touring",
    meta: "2021 · 78 400 km · Munique",
    finalCost: "29 159 €",
    saving: "+5 741 €",
    verdict: "compensa",
    verdictLabel: "Compensa",
    photo: "/carros/bmw-320d-01.jpg",
  },
  {
    id: "peugeot-3008",
    flag: "🇫🇷",
    title: "Peugeot 3008 GT",
    meta: "2022 · 54 100 km · Lyon",
    finalCost: "27 480 €",
    saving: "+3 120 €",
    verdict: "compensa",
    verdictLabel: "Compensa",
    photo: "/carros/peugeot-3008-01.jpg",
  },
  {
    id: "audi-a4",
    flag: "🇳🇱",
    title: "Audi A4 Avant 35 TDI",
    meta: "2021 · 66 700 km · Utreque",
    finalCost: "31 250 €",
    saving: "+4 380 €",
    verdict: "compensa",
    verdictLabel: "Compensa",
    photo: "/carros/audi-a4-01.jpg",
  },
  {
    id: "volvo-xc40",
    flag: "🇧🇪",
    title: "Volvo XC40 D3",
    meta: "2020 · 91 000 km · Antuérpia",
    finalCost: "26 940 €",
    saving: "+1 460 €",
    verdict: "marginal",
    verdictLabel: "Marginal",
    photo: "/carros/volvo-xc40-01.jpg",
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Dizes o que procuras",
    body: "Marca, modelo, orçamento, quilómetros. Ou deixas em aberto e vês tudo o que compensa hoje.",
  },
  {
    n: "02",
    title: "Nós fazemos a conta",
    body: "Todas as manhãs recalculamos ISV, transporte e legalização de cada anúncio e comparamos com o preço praticado em Portugal.",
  },
  {
    n: "03",
    title: "Contactas o vendedor",
    body: "Falas com o stand estrangeiro a partir da plataforma, com o email protegido, e guardas a papelada da compra num sítio só.",
  },
];

export const LIMITS = [
  {
    title: "São estimativas, não orçamentos",
    body: "Usamos a tabela do ISV de 2026 e valores médios de transporte. O valor real pode variar algumas centenas de euros.",
  },
  {
    title: "Não substituímos a Alfândega",
    body: "Quem fixa o ISV é a AT, na inspeção do veículo. A nossa conta serve para decidires se vale a pena avançar.",
  },
  {
    title: "Um anúncio pode já estar vendido",
    body: "Lemos os anúncios de manhã. Marcamos a hora da última verificação em cada carro para saberes o que estás a ver.",
  },
];

/**
 * Conteúdo estático por país para a ficha do anúncio (P07): o que pedir ao
 * vendedor, onde confirmar os km, a mensagem pronta e a nota de IVA.
 *
 * Fonte: estudos por país de 10/10/2026 (AutoImport-plano/paises/*.md, secções
 * 4, 6 e 7), que citam as fontes oficiais de cada regra. É orientação prática,
 * não aconselhamento fiscal — a ficha di-lo. Funções puras, sem React: testadas
 * em tests/app/p07-country-guides.test.ts.
 */
import type { CostBreakdown, CountryCode, KmCheck, SourceVatRegime, VatRegime } from "./types";

/** IVA normal no país de origem (%). Estudos §2 de cada país. */
export const ORIGIN_VAT_PCT: Record<CountryCode, number> = {
  DE: 19,
  FR: 20,
  BE: 21,
  NL: 21,
  ES: 21,
};

/** IVA português na revenda (%). Estudo PT §3.2. */
export const PT_VAT_PCT = 23;

export interface SellerMessage {
  /** rótulo do separador, ex.: "Alemão" */
  label: string;
  lang: "de" | "fr" | "nl" | "es";
  /** com os marcadores {carro}, {preco} e {link} (ver fillSellerMessage) */
  template: string;
}

export interface CountryGuide {
  /** "na Alemanha", "em França" — para os títulos */
  where: string;
  /** o que pedir e verificar, pela ordem da compra */
  checklist: string[];
  /** sinais de risco típicos do país */
  warnings: string[];
  messages: SellerMessage[];
}

// ── Mensagens ao vendedor (estudos §7.5/§7.6, adaptadas com marcadores) ──

const MSG_DE = `Sehr geehrte Damen und Herren,

wir sind ein Autohaus aus Portugal (USt-IdNr. PT_________, im VIES gültig) und interessieren uns für Ihr Fahrzeug {carro} ({preco}), {link}.

1. Ist die MwSt. ausweisbar, oder wird das Fahrzeug nach § 25a UStG differenzbesteuert verkauft?
2. Falls ausweisbar: Bitte bestätigen Sie den Nettopreis für eine steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1b, § 6a UStG). Verlangen Sie eine Kaution in Höhe der MwSt.? Wenn ja: Welche Nachweise genügen für die Rückzahlung (Gelangensbestätigung, CMR, portugiesische Zulassung) und in welcher Frist erstatten Sie?
3. Ist der Preis ein Barpreis (ohne Finanzierung/Inzahlungnahme)?
4. Liegen die Zulassungsbescheinigung Teil I und Teil II im Original vor? Ist das Fahrzeug unfallfrei, und können Sie uns die letzten HU-Berichte, das Scheckheft und das COC-Papier schicken?
5. Können Sie das Fahrzeug vor der Abholung außer Betrieb setzen? Die Abholung erfolgt per Lkw durch unsere Spedition.

Mit freundlichen Grüßen
[Nome, stand, morada, telefone]`;

const MSG_FR = `Bonjour,

Nous sommes un garage automobile professionnel au Portugal (n° TVA intracommunautaire PT_________, vérifiable sur VIES). Votre véhicule {carro}, annoncé à {preco} ({link}), nous intéresse.

1. Le véhicule est-il vendu en TVA récupérable (facture HT, livraison intracommunautaire exonérée – art. 262 ter I du CGI) ou en TVA sur marge (art. 297 A du CGI) ?
2. Pouvez-vous nous envoyer le lien du rapport HistoVec et le dernier procès-verbal de contrôle technique ?
3. Le véhicule dispose-t-il du certificat de conformité européen (COC) ?
4. Le paiement se fera par virement depuis le compte de notre société. Le transport vers le Portugal sera assuré par un transporteur professionnel (CMR). Si une caution de TVA est nécessaire, quel montant et sous quel délai est-elle restituée ?
5. Merci de confirmer le prix comptant (hors financement) et la disponibilité pour un enlèvement.

Cordialement,
[Nome, stand, telefone]`;

const MSG_BE_FR = `Bonjour,

Nous sommes un négociant automobile au Portugal (n° TVA intracommunautaire PT_________, valide sur VIES). Nous sommes intéressés par votre véhicule {carro}, annoncé à {preco} ({link}).

1. Le véhicule est-il vendu avec TVA déductible (facture HTVA, livraison intracommunautaire exonérée – art. 39bis CTVA) ou sous le régime de la marge ?
2. Pouvez-vous nous envoyer le Car-Pass (moins de 2 mois), le certificat de conformité (COC), les deux parties du certificat d'immatriculation et le dernier rapport de contrôle technique ?
3. Le véhicule est-il libre de tout leasing/financement ?
4. Le transport sera assuré par notre transporteur (CMR). Demandez-vous une caution TVA ? Si oui, quel montant et sur quel document est-elle remboursée ?

Merci d'avance. Cordialement,
[Nome, stand, telefone]`;

const MSG_BE_NL = `Goedendag,

Wij zijn een autohandelaar in Portugal (intracommunautair btw-nummer PT_________, geldig in VIES). Wij hebben interesse in uw {carro}, aangeboden aan {preco} ({link}).

1. Wordt de wagen verkocht met BTW aftrekbaar (factuur excl. btw, vrijgestelde intracommunautaire levering – art. 39bis W.btw) of onder de margeregeling?
2. Kunt u ons de Car-Pass (minder dan 2 maanden oud), het gelijkvormigheidsattest (COC), beide delen van het inschrijvingsbewijs en het laatste keuringsverslag bezorgen?
3. Is de wagen vrij van leasing/financiering?
4. Het transport gebeurt door onze vervoerder (CMR). Vraagt u een btw-waarborg? Zo ja, welk bedrag en op basis van welk document wordt die terugbetaald?

Alvast bedankt. Met vriendelijke groeten,
[Nome, stand, telefone]`;

const MSG_NL = `Goedendag,

Wij zijn een autobedrijf in Portugal (btw-nummer PT_________, geldig in VIES) en hebben interesse in uw {carro}, vraagprijs {preco} ({link}).

1. Is dit een BTW-auto (btw verrekenbaar) of een marge-auto?
2. Wat is uw exportprijs ex BPM en excl. BTW bij een intracommunautaire levering (0 %) aan ons bedrijf?
3. Kunt u de exportmelding bij de RDW verzorgen en ons het exportdocument (deel II), de kentekencard/deel 1B en het vrijwaringsbewijs meegeven?
4. Is er een COC, onderhoudshistorie (DSR/boekje) en een geldige APK? Wat is het tellerstandoordeel (NAP)?
5. Vraagt u een borg voor btw/BPM? Wij leveren de CMR en binnen 13 weken een kopie van het Portugese kentekenbewijs.
6. Het transport wordt door ons geregeld via een vrachtwagen met CMR.

Met vriendelijke groet,
[Nome] — [stand], Portugal`;

const MSG_ES = `Buenos días,

Somos un concesionario de vehículos de ocasión en Portugal (NIF-IVA intracomunitario PT_________, válido en VIES). Estamos interesados en el vehículo {carro}, anunciado por {preco} ({link}).

1. ¿Cuál es el precio al contado (sin financiación)?
2. ¿El vehículo está en REBU o con IVA deducible? Si es IVA deducible, ¿pueden emitir factura exenta de IVA como entrega intracomunitaria (art. 25 LIVA) a nuestro NIF-IVA? ¿Exigen fianza del IVA hasta recibir el CMR?
3. ¿Nos pueden enviar el informe completo de la DGT (cargas, ITV, kilometraje) y fotos del permiso de circulación y de la tarjeta ITV? ¿Tienen el COC y el libro de mantenimiento?
4. ¿Se encargan ustedes de la baja definitiva por traslado a otro país y de imprimir la tarjeta ITV antes de la baja? ¿Tiene alguna reserva de dominio o financiación pendiente?
5. Organizaremos el transporte en camión con CMR. ¿Fecha de recogida posible?

Muchas gracias. Un saludo,
[Nome] — [stand], Portugal`;

const VIES = "Confirma que o n.º de IVA do stand está válido no VIES e envia-o ao vendedor.";
const EM_PT = "Em Portugal: inspeção tipo B, DAV com o ISV e pedido de matrícula.";

export const COUNTRY_GUIDES: Record<CountryCode, CountryGuide> = {
  // Estudo DE §4.1, §6.1, §7.3–7.5.
  DE: {
    where: "na Alemanha",
    checklist: [
      VIES,
      "Confirma por escrito o regime de IVA (“MwSt. ausweisbar” ou § 25a, margem) e que o preço é a pronto (Barpreis).",
      "Pede fotos da Zulassungsbescheinigung Teil I e Teil II, com o VIN igual ao do carro.",
      "Pede o COC, os últimos relatórios HU e o Scheckheft.",
      "Acorda por escrito a caução de IVA: montante, documentos que a libertam e prazo de devolução.",
      "Paga por transferência a partir da conta do stand.",
      "O vendedor faz a Abmeldung e entrega ao motorista a Teil I, a Teil II, a fatura e o COC.",
      "À chegada, assina a CMR e a Gelangensbestätigung com o VIN e envia-as logo ao vendedor.",
      EM_PT,
    ],
    warnings: [
      "Sem a Teil II original não pagues: num carro financiado está com o banco. Paga contra a entrega do original.",
      "Preço só com financiamento ou retoma: confirma o Barpreis.",
      "Venda “Export/Gewerbe” é B2B e sem garantia.",
    ],
    messages: [{ label: "Alemão", lang: "de", template: MSG_DE }],
  },
  // Estudo FR §4, §6, §7.
  FR: {
    where: "em França",
    checklist: [
      VIES,
      "Pede o link do relatório HistoVec: km de cada contrôle technique, sinistros, gage/opposition e n.º de titulares.",
      "Confirma na fatura proforma o regime: TVA récupérable (art. 262 ter I CGI) ou TVA sur marge (art. 297 A CGI).",
      "Paga a partir da conta do stand e combina a caução e a sua devolução.",
      "Na recolha: carte grise original barrée (“vendu le … à …h”, assinada), Cerfa 15776 (exemplar n.º 2), certificat de situation administrative com menos de 15 dias, último contrôle technique, COC, 2 chaves e carnet d'entretien.",
      "CMR assinada pelo vendedor, pelo transportador e pelo stand. Envia a declaração de chegada ao vendedor até ao dia 10 do mês seguinte.",
      "Confirma que o vendedor fez a déclaration de cession na ANTS.",
      EM_PT,
    ],
    warnings: [
      "Em França quase todos os ligeiros vendem-se na margem: o preço não baixa com o n.º de IVA intracomunitário.",
      "Sem CT ou CT défavorable: venda só para profissionais. Verifica as avarias.",
      "O carro vem de camião: o cupão da carte grise não permite circular fora de França.",
    ],
    messages: [{ label: "Francês", lang: "fr", template: MSG_FR }],
  },
  // Estudo BE §4.1, §6.1, §7.3–7.5.
  BE: {
    where: "na Bélgica",
    checklist: [
      VIES,
      "Confirma o regime de IVA por escrito: TVA déductible (fatura HTVA, art. 39bis) ou regime da margem.",
      "Pede o VIN e o Car-Pass e verifica-o em car-pass.be pelo QR.",
      "Verifica o certificado de matrícula no Checkdoc, pelo n.º do documento.",
      "Exige as duas partes do certificado de matrícula (I e II) em original, o COC, o relatório de inspeção com menos de 2 meses e o histórico de manutenção.",
      "Se for ex-leasing: prova de liquidação ou de que o carro é do vendedor.",
      "Acorda o transporte e a caução de IVA: montante, prazo de devolução e documento exigido (CMR, attestation de réception).",
      "Paga por transferência para um IBAN belga em nome da empresa do anúncio.",
      "Na receção: CMR assinada e carimbada, declaração de chegada ao vendedor e pedido de devolução da caução.",
      EM_PT,
    ],
    warnings: [
      "Importado para a Bélgica: as leituras de km anteriores podem não estar no Car-Pass.",
      "O carro sai sem matrícula (as chapas ficam com o vendedor): transporte em camião ou chapa X.",
      "Anúncio “export / marchand / sans garantie”: risco alto.",
    ],
    messages: [
      { label: "Francês", lang: "fr", template: MSG_BE_FR },
      { label: "Neerlandês", lang: "nl", template: MSG_BE_NL },
    ],
  },
  // Estudo NL §4, §6.1, §7.4–7.6.
  NL: {
    where: "nos Países Baixos",
    checklist: [
      "Confirma no VIES o n.º de IVA do stand e o do vendedor (KvK).",
      "Faz o Kentekencheck da RDW: roubo, “tenaamstelling mogelijk” e recalls.",
      "Vê o veredito de km da RDW e, para as leituras, o RDW-Voertuigrapport.",
      "Confirma por escrito o regime (BTW ou marge) e o preço ex BPM e excl. BTW.",
      "Pergunta pela caução de IVA/BPM e pelas condições de devolução.",
      "Confirma o COC (ou pede-o ao fabricante) e o livro de manutenção ou DSR.",
      "Pede prova de quitação do leasing ou financiamento: não há registo público de ónus.",
      "O vendedor faz a exportmelding na RDW e entrega o exportdocument (deel II), o kentekencard com o canto cortado (ou deel 1B) com o tenaamstellingscode, o vrijwaringsbewijs, a fatura, a APK, o COC e as chaves.",
      "Transporte com CMR assinada. Envia a declaração de chegada até ao dia 10 do mês seguinte.",
      "Depois da matrícula PT, envia ao vendedor a cópia do certificado dentro de 13 semanas.",
    ],
    warnings: [
      "O preço inclui rest-BPM: negocia o preço de exportação “ex BPM”.",
      "WOK, schadevoertuig ou “tenaamstellen mogelijk: nee” na RDW: não comprar.",
      "O vendedor só recupera a BPM se o carro for matriculado em Portugal em 13 semanas.",
    ],
    messages: [{ label: "Neerlandês", lang: "nl", template: MSG_NL }],
  },
  // Estudo ES §4, §6, §7.
  ES: {
    where: "em Espanha",
    checklist: [
      VIES,
      "Pede o informe completo da DGT (titulares, cargas, ITV e km) e compara os km com o anúncio.",
      "Confirma por escrito o regime de IVA (REBU ou IVA deducible) e o preço a pronto.",
      "Confirma que não há reserva de domínio ou financiamento por cancelar.",
      "Fatura isenta (art. 25 LIVA) com o NIF-IVA PT, ou em REBU.",
      "Paga por transferência. Se houver caução de IVA, com cláusula de devolução contra a CMR.",
      "Recebe o permiso de circulación original e a ficha técnica eITV impressa antes da baja (depois já não se pede duplicado), e o COC se existir.",
      "O vendedor ou um gestor faz a baja definitiva por traslado a otro país e envia o justificante.",
      "Camião com CMR. Assina e devolve a declaração de chegada.",
      EM_PT,
    ],
    warnings: [
      "Preço financiado: o preço a pronto pode ser mais alto.",
      "Pede a ficha técnica/eITV antes da baja definitiva.",
      "Ex-renting ou rent-a-car: muitos km em pouco tempo, confirma o histórico.",
    ],
    messages: [{ label: "Espanhol", lang: "es", template: MSG_ES }],
  },
};

/** Preenche os marcadores da mensagem com os dados do anúncio. */
export function fillSellerMessage(
  template: string,
  data: { car: string; price: string; link?: string },
): string {
  return template
    .replaceAll("{carro}", data.car)
    .replaceAll("{preco}", data.price)
    .replaceAll("{link}", data.link ?? "[link do anúncio]");
}

// ── Quilómetros ───────────────────────────────────────────────────

export interface KmAdvice {
  tone: "good" | "bad" | "warn" | "info";
  text: string;
}

/** Idade aproximada pelo ano (a ficha não tem a data da 1.ª matrícula). */
function ageYears(year: number, now: Date): number {
  return now.getFullYear() - year;
}

/**
 * Onde confirmar os km, por país, e o veredito do registo oficial quando o
 * coletor o trouxe (`km_check`). Estudos BE §6.1, NL §6.1, FR §6, ES §6, DE §6.1.
 */
export function kmAdvice(
  country: CountryCode,
  year: number,
  kmCheck?: KmCheck,
  now: Date = new Date(),
): KmAdvice[] {
  const out: KmAdvice[] = [];
  if (kmCheck) {
    const quando = new Date(kmCheck.checkedAt).toLocaleDateString("pt-PT");
    if (kmCheck.verdict === "coerente")
      out.push({ tone: "good", text: `Km coerentes segundo ${kmCheck.source} (${quando}).` });
    else if (kmCheck.verdict === "incoerente")
      out.push({
        tone: "bad",
        text: `${kmCheck.source}: há uma leitura de km inferior à anterior. Evitar, salvo explicação documentada.`,
      });
    else
      out.push({
        tone: "warn",
        text: `${kmCheck.source} sem juízo sobre os km (dados insuficientes). Pede faturas de manutenção e o histórico.`,
      });
  }

  const age = ageYears(year, now);
  switch (country) {
    case "BE":
      out.push({
        tone: "info",
        text: "Pede o Car-Pass (com menos de 2 meses) e verifica-o em car-pass.be pelo QR. Numa venda a profissionais não é obrigatório, por isso tens de o pedir.",
      });
      break;
    case "NL":
      if (kmCheck?.source !== "RDW")
        out.push({
          tone: "info",
          text: "Consulta o veredito de km da RDW pela matrícula (grátis): Logisch, Onlogisch (evitar) ou Geen oordeel (pedir histórico).",
        });
      break;
    case "FR":
      out.push(
        age < 4
          ? {
              tone: "warn",
              text: "Carro com menos de 4 anos: ainda não fez contrôle technique, por isso não há leituras oficiais de km. Pede o carnet d'entretien e as faturas.",
            }
          : {
              tone: "info",
              text: "Consulta o HistoVec: pede ao vendedor o link do relatório, com os km de cada contrôle technique.",
            },
      );
      break;
    case "ES":
      out.push(
        age < 4
          ? {
              tone: "warn",
              text: "Carro com menos de 4 anos: ainda não fez ITV, por isso não há leituras oficiais de km. Pede o livro de manutenção.",
            }
          : {
              tone: "info",
              text: "Pede o informe completo da DGT: tem os km registados em cada ITV.",
            },
      );
      break;
    case "DE":
      out.push(
        age < 3
          ? {
              tone: "warn",
              text: "Na Alemanha não há registo público de km e o carro ainda não fez a 1.ª HU (aos 3 anos). Pede o Scheckheft ou o histórico digital da marca.",
            }
          : {
              tone: "info",
              text: "Na Alemanha não há registo público de km. Pede os 2–3 últimos relatórios HU e o Scheckheft e confirma que os km batem certo.",
            },
      );
      break;
  }
  return out;
}

// ── IVA ───────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<SourceVatRegime, string> = {
  dedutivel: "IVA dedutível",
  margem: "Regime da margem",
  particular: "Vendedor particular",
};

export interface VatNote {
  /** o que o anúncio diz */
  said: string;
  /** o regime usado na conta */
  applied: string;
  /** frase simples sobre a compra e a revenda */
  explanation: string;
}

/**
 * Nota de IVA da ficha. Sem `cost.vatRegime` (estimativa anterior ao motor novo)
 * a conta trata o preço anunciado como custo, o que equivale à margem.
 * DEFAULT do plano (§5): anúncio sem menção de IVA → margem; NL "dedutível" sem
 * preço líquido → margem.
 */
export function vatNote(
  source: SourceVatRegime | undefined,
  cost: Pick<CostBreakdown, "vatRegime">,
  country: CountryCode,
): VatNote {
  const applied: VatRegime = cost.vatRegime ?? "margem";
  const said = source ? SOURCE_LABEL[source] : "Não diz";
  const appliedLabel = applied === "dedutivel" ? "IVA dedutível" : "Regime da margem";
  const revendaMargem = `Na revenda em Portugal o IVA é só sobre a margem: (preço de venda − preço de compra) × ${PT_VAT_PCT}/${100 + PT_VAT_PCT}.`;

  let explanation: string;
  if (!source) {
    explanation = "O anúncio não diz; contámos como margem. Confirma com o vendedor.";
  } else if (applied === "dedutivel") {
    explanation = `Compras pelo preço sem o IVA de origem (${ORIGIN_VAT_PCT[country]} %), numa entrega intracomunitária isenta. Na revenda em Portugal liquidas ${PT_VAT_PCT} % de IVA sobre o preço total.`;
  } else if (source === "dedutivel") {
    explanation =
      country === "NL"
        ? "O anúncio diz IVA dedutível mas não publica o preço sem IVA. Nos Países Baixos o preço inclui BPM, que não entra na base do IVA, por isso contámos como margem. Pede ao vendedor o preço “ex BPM, excl. BTW”."
        : `O anúncio diz IVA dedutível, mas contámos como margem, que é o lado seguro. Confirma o preço sem IVA com o vendedor. ${revendaMargem}`;
  } else {
    explanation = `Pagas o preço anunciado e não recuperas IVA. ${revendaMargem}`;
  }
  return { said, applied: appliedLabel, explanation };
}

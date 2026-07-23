import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, button, h1, linkStyle, muted, notice, text } from "./layout";

/**
 * Email disparado pelo job de matching de alertas (ver
 * docs/09-ALERTAS-MATCHING.md) quando um anúncio novo encaixa num alerta ativo
 * do stand. O botão leva DIRETO ao anúncio — igual ao sino da topbar.
 *
 * Assunto sugerido: "Apareceu um {título} que encaixa no teu alerta"
 */
export function AlertMatchEmail({
  name,
  alertName,
  listingTitle,
  country,
  totalPt,
  savings,
  listingUrl,
}: {
  name?: string;
  /** nome do alerta que disparou, ex.: "BMW iX" */
  alertName: string;
  /** marca modelo do anúncio encontrado */
  listingTitle: string;
  /** país de origem, ex.: "Alemanha" */
  country: string;
  /** custo final estimado em PT, já formatado (ex.: "62 705 €") */
  totalPt: string;
  /** poupança face ao mercado PT, já formatada (ex.: "11 745 €") */
  savings: string;
  /** URL absoluto do anúncio */
  listingUrl: string;
}) {
  return (
    <EmailLayout preview={`${listingTitle} — poupa ${savings} face ao mercado português.`}>
      <Text style={h1}>Apareceu um carro que encaixa no teu alerta</Text>
      <Text style={text}>
        {name ? `Olá ${name},` : "Olá,"} o teu alerta <strong>“{alertName}”</strong> encontrou um
        anúncio novo:
      </Text>

      <Text style={{ ...text, marginBottom: "4px" }}>
        <strong>{listingTitle}</strong> · {country}
      </Text>
      <Text style={{ ...text, marginTop: 0 }}>
        Custo final estimado em Portugal: <strong>{totalPt}</strong> — poupa cerca de{" "}
        <strong>{savings}</strong> face ao mercado português.
      </Text>

      <Button href={listingUrl} style={button}>
        Ver anúncio
      </Button>

      <Text style={notice}>
        Os valores são estimativas (ISV/IUC podem mudar, o anúncio pode já ter sido vendido).
        Confirma sempre antes de fechar negócio.
      </Text>

      <Text style={muted}>
        Recebes isto porque tens um alerta ativo no AutoImport. Podes geri-lo ou desligá-lo em{" "}
        <Link href="https://autoimport.arestadigital.pt/alertas" style={linkStyle}>
          Alertas
        </Link>
        .
      </Text>

      <Text style={{ ...muted, marginTop: "20px" }}>
        Se o botão não funcionar, copia este endereço para o navegador:
        <br />
        <Link href={listingUrl} style={linkStyle}>
          {listingUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

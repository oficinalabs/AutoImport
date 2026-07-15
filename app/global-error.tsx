"use client";

import { RotateCw } from "lucide-react";
import { useEffect } from "react";
import "./globals.css";

/**
 * Última rede de segurança: erros no **root layout** não são apanhados pelos
 * `error.tsx` — sem isto, o utilizador vê o ecrã cru do Next
 * ("Application error: a server-side exception has occurred… Digest: …").
 *
 * Como substitui o root layout, tem de trazer o seu próprio <html>/<body> e
 * não pode contar com fontes, tema ou providers. Daí o HTML mínimo e as
 * cores em hex (os tokens CSS vivem no globals.css, que importamos, mas o
 * tema depende de JS que aqui pode não ter corrido).
 *
 * Regra: nunca expor `error.message` — só o digest, que é opaco.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? error);
  }, [error]);

  return (
    <html lang="pt">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f3f5f5",
          color: "#0d1c22",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "460px", textAlign: "center" }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              marginBottom: "28px",
              color: "#0e3b4a",
            }}
          >
            <span style={{ fontWeight: 500 }}>Auto</span>Import
          </div>

          <div
            aria-hidden
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 20px",
              borderRadius: "999px",
              backgroundColor: "rgba(232,147,12,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                backgroundColor: "#e8930c",
              }}
            />
          </div>

          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>
            Isto não devia ter acontecido
          </h1>
          <p style={{ margin: 0, fontSize: "14px", lineHeight: "22px", color: "#5b6b71" }}>
            Tivemos um problema a carregar a aplicação. Já estamos a par e a tratar disso.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: 0,
              borderRadius: "6px",
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: "#e8930c",
              color: "#241500",
            }}
          >
            <RotateCw size={16} aria-hidden />
            Tentar de novo
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: "28px",
                paddingTop: "16px",
                borderTop: "1px solid #dbe2e3",
                fontSize: "12px",
                color: "#5b6b71",
              }}
            >
              Se falares connosco, dá-nos esta referência:{" "}
              <code
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  backgroundColor: "#eef1f0",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  color: "#0d1c22",
                }}
              >
                {error.digest}
              </code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

# stealth_fetch.py — bridge de transporte "stealth" para os domínios AutoUncle com Cloudflare ATIVO.
#
# ⚠️ EXCEÇÃO DELIBERADA à norma "HTTP puro, zero-deps" dos coletores Node (mesma exceção do
# piscapisca). 4 domínios AutoUncle (de, it, es, uk) devolvem HTTP 403 a qualquer cliente
# não-browser (Cloudflare managed challenge, probe 2026-07-15). Os outros 10 passam a HTTP puro e
# NÃO usam isto. Ver README (secção autouncle) e research/piscapisca-investigacao.md.
#
# PAPEL: é SÓ transporte. Não faz parse — devolve o HTML cru ao Node, que o mete no MESMO
# parse.ts/schema.ts/checkpoint dos 10 mercados HTTP-puros (parsing single-source). Assim o browser
# stealth fica confinado ao mínimo: buscar bytes que o Cloudflare de outra forma barra.
#
# COMO: um daemon de vida longa. UMA StealthySession (Camoufox headless, solve_cloudflare=True) por
# processo — resolve o challenge UMA vez por domínio e reutiliza o cf_clearance em todos os pedidos
# seguintes (re-solver por página seria proibitivo). Uma sessão serve os 4 domínios: a 1.ª visita a
# cada um resolve o respetivo challenge (confirmado: .de e .co.uk na mesma sessão → ambos 200).
#
# PROTOCOLO (com o Node, ver stealth.ts): pedidos entram por STDIN, um JSON por linha
# `{"url": "..."}`. As respostas saem pelo FD 3 (dedicado — imune ao ruído de log do Camoufox no
# stdout/stderr), um JSON por linha: `{"status": 200, "b64": "<html em base64 utf-8>"}` ou
# `{"status": N, "error": "..."}`. base64 evita ambiguidade de newlines no HTML (~1,5 MB/página).
# Primeira linha emitida ao ficar pronto: `{"ready": true}`.
#
# RITMO: throttle (delay + jitter) e retry/backoff aqui, como o fetcher.py do piscapisca — o Node
# não volta a esperar para estes mercados. Knobs por variável de ambiente (AU_*).

import sys
import os
import io
import json
import time
import base64
import random

from scrapling.fetchers import StealthySession

RESP_FD = 3   # canal dedicado das respostas (o stdout/stderr fica livre p/ logs do browser)


def respond(fd, obj):
    os.write(fd, (json.dumps(obj) + "\n").encode("utf-8"))


def main():
    min_delay = float(os.environ.get("AU_MIN_DELAY_MS", "4000")) / 1000
    jitter = float(os.environ.get("AU_JITTER_MS", "1200")) / 1000
    max_retries = int(os.environ.get("AU_MAX_RETRIES", "3"))
    headless = os.environ.get("AU_HEADLESS", "1") != "0"
    timeout_ms = int(os.environ.get("AU_TIMEOUT_MS", "90000"))

    last_req = 0.0
    stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

    with StealthySession(headless=headless, solve_cloudflare=True, timeout=timeout_ms) as session:
        respond(RESP_FD, {"ready": True})
        for line in stdin:
            line = line.strip()
            if not line:
                continue
            try:
                url = json.loads(line)["url"]
            except (ValueError, KeyError) as e:
                respond(RESP_FD, {"status": 0, "error": f"pedido inválido: {e}"})
                continue

            # throttle: mínimo desde o último pedido + jitter (espelha lib/http._throttle / fetcher.py)
            wait = last_req + min_delay - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            if jitter:
                time.sleep(random.uniform(0, jitter))
            last_req = time.monotonic()

            body, status, err = None, 0, None
            for attempt in range(max_retries + 1):
                try:
                    resp = session.fetch(url)
                    status = getattr(resp, "status", 0) or 0
                    text = resp.body if isinstance(resp.body, str) else resp.body.decode("utf-8", "replace")
                    if status >= 400 and status != 404:
                        err = f"HTTP {status}"
                    else:
                        body, err = text, None
                        break
                except Exception as e:  # noqa: BLE001 — qualquer falha do browser é retryável
                    err = f"{type(e).__name__}: {e}"
                if attempt < max_retries:
                    time.sleep(2 ** attempt)  # backoff 1s, 2s, 4s…

            if body is None:
                respond(RESP_FD, {"status": status, "error": err or "sem corpo"})
            else:
                respond(RESP_FD, {"status": status, "b64": base64.b64encode(body.encode("utf-8")).decode("ascii")})


if __name__ == "__main__":
    main()

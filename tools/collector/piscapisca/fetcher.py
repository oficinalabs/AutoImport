# fetcher.py — cliente de rede do PiscaPisca. Papel do lib/http.mjs, MAS com browser stealth.
#
# ⚠️ EXCEÇÃO DELIBERADA à política "HTTP puro, sem evasão" do repo (secção 4 do scraping-estado.md).
# O PiscaPisca tem um challenge ATIVO do Cloudflare: devolve HTTP 403 a qualquer cliente não-browser,
# MESMO com User-Agent + headers de browser completos e HTTP/2 (confirmado por probe 2026-07-13). Os
# 23 coletores Node são HTTP puro e não passam isto. É o 1.º (e único) coletor a usar browser stealth.
#
# COMO: uma ÚNICA StealthySession (Camoufox headless) por processo, com solve_cloudflare=True. A
# sessão resolve o challenge do Cloudflare UMA vez e reutiliza o cf_clearance em todos os pedidos
# seguintes (crítico para o watch de 1 min — re-solver por ciclo seria proibitivo). Mantém, tal como
# o lib/http.mjs, rate-limit (delay + jitter) e retry com backoff.
#
# ROBOTS / BOA CIDADANIA: o robots.txt do PiscaPisca é ilegível (o Cloudflare devolve 403 também a
# /robots.txt). Mitigação: allowlist ESTRITA de paths — só buscamos páginas que um humano visita num
# browser (listagem /carros[...] e detalhe /carros/usados/...). NUNCA tocamos /api, /admin, /conta,
# /login, /backoffice, /empresa, /stand, etc. Ver assert_allowed().
#
# RITMO CONSERVADOR (mais lento que os HTTP-puros): delay default ~4000 ms, headless, 1 sessão por
# processo, SEM concorrência — para reduzir peso e risco de deteção.

import re
import time
import random

from scrapling.fetchers import StealthySession

BASE = "https://www.piscapisca.pt"

# Allowlist: só paths de listagem/detalhe. Um path é permitido se casar um destes prefixos.
# (Tudo o resto — /api, /admin, /conta, /login, /backoffice, /empresa, /stand, /favoritos… — é vedado.)
ALLOW_PREFIXES = ("/carros",)


class Fetcher:
    """Sessão quente do Cloudflare. Uso:
        f = Fetcher(min_delay_ms=4000); f.start()
        html = f.get_html("/carros?page=2")
        ...
        f.close()
    Ou como context manager: `with Fetcher() as f: ...`."""

    def __init__(self, min_delay_ms=4000, jitter_ms=1200, max_retries=3, headless=True, timeout_ms=90000):
        self.min_delay_ms = min_delay_ms
        self.jitter_ms = jitter_ms
        self.max_retries = max_retries
        self.headless = headless
        self.timeout_ms = timeout_ms
        self._session = None
        self._last_req_at = 0.0

    # --- ciclo de vida da sessão quente ---
    def start(self):
        if self._session is None:
            # solve_cloudflare=True → resolve o challenge UMA vez; a sessão reutiliza o cf_clearance.
            self._session = StealthySession(
                headless=self.headless,
                solve_cloudflare=True,
                timeout=self.timeout_ms,
            )
            self._session.start()
        return self

    def close(self):
        if self._session is not None:
            try:
                self._session.close()
            finally:
                self._session = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.close()

    # --- allowlist (boa cidadania: só listagem/detalhe) ---
    @staticmethod
    def assert_allowed(url):
        path = re.sub(r"[?#].*$", "", url[len(BASE):] if url.startswith(BASE) else url)
        if not path.startswith("/"):
            path = "/" + path
        if not any(path.startswith(p) for p in ALLOW_PREFIXES):
            raise ValueError(f"allowlist proíbe (só listagem/detalhe): {path}")

    # --- rate-limit: espera o mínimo desde o último pedido + jitter (espelha lib/http._throttle) ---
    def _throttle(self):
        wait = self._last_req_at + self.min_delay_ms / 1000 - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        if self.jitter_ms:
            time.sleep(random.uniform(0, self.jitter_ms / 1000))
        self._last_req_at = time.monotonic()

    # get_html: busca uma página (path relativo ou URL absoluto) com throttle + retry/backoff.
    # `validate(html)` opcional: se devolver False, trata como retryável (ex. challenge em vez de HTML).
    # Devolve o HTML ou None se esgotar as tentativas.
    def get_html(self, url, validate=None):
        if self._session is None:
            raise RuntimeError("Fetcher não iniciado — chamar start() (ou usar 'with').")
        full = url if url.startswith("http") else BASE + url
        self.assert_allowed(full)
        last_err = None
        for attempt in range(self.max_retries + 1):
            self._throttle()
            try:
                resp = self._session.fetch(full)
                body = resp.body if isinstance(resp.body, str) else resp.body.decode("utf-8", "replace")
                status = getattr(resp, "status", None)
                if status and status >= 400 and status != 404:
                    last_err = f"HTTP {status}"
                elif validate and not validate(body):
                    last_err = "validação falhou (challenge/página vazia?)"
                else:
                    return body
            except Exception as e:  # noqa: BLE001 — queremos apanhar qualquer falha do browser p/ retry
                last_err = f"{type(e).__name__}: {e}"
            if attempt < self.max_retries:
                time.sleep(2 ** attempt)  # backoff 1s, 2s, 4s…
        print(f"  ⚠ falhou {full} após {self.max_retries + 1} tentativas: {last_err}")
        return None

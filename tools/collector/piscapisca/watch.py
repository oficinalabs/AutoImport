# watch.py — recolha CONTÍNUA (polling) do PiscaPisca. Mesma lógica do custojusto/watch.mjs: poll de
# X em X tempo, deteta NOVOS e MUDANÇAS DE PREÇO, mantém uma "tabela" de estado (id→linha) e emite
# eventos para o sink (a DB isolada em sink.py).
#
# ⚠️ SESSÃO QUENTE (crítico): usamos UMA StealthySession para toda a vida do poller. O challenge do
# Cloudflare é resolvido UMA vez (no start do fetcher) e o cf_clearance reaproveitado em todos os
# ciclos — re-solver o challenge a cada ciclo de 1 min seria proibitivo (e suspeito). O Fetcher é
# passado já iniciado pelo CLI.
#
# ⚠️ RECÊNCIA POR PROXY: a listagem SSR é sempre por relevância ("Mais relevantes"). O sort "Mais
# recentes" existe mas é feito client-side por POST à API interna (não alcançável pela rota SSR sem
# tocar /api, que a allowlist proíbe). Logo, como no AutoTrader/autocasion, a recência é POR PROXY
# (ordem default). Para alargar a captura por ciclo, `--pages N` lê as N primeiras páginas da listagem
# base (default 1). A captura exaustiva depende do re-crawl batch (--full).

import os
import time
import json
import signal

from parse import parse_listing_page, record_id, tem_state
from sink import Sink

URL_BASE = "/carros"   # sort default = relevância; page 1 = os mais relevantes/promovidos


def watch(fetcher, interval_s=60, cycles=0, pages=1, out_dir=None, collected_at_fn=None):
    """config → {total}. Espelha o contrato do custojusto/watch.mjs.
    `collected_at_fn` devolve o timestamp ISO atual (injetado pelo CLI; datetime é do CLI)."""
    os.makedirs(out_dir, exist_ok=True)
    state_path = os.path.join(out_dir, "piscapisca-state.json")
    sink = Sink(out_dir, "piscapisca")

    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {}

    def save_state():
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)

    stop = {"v": False}

    def _sigint(*_):
        stop["v"] = True
        print("\n⏹  a terminar após o ciclo atual…")

    signal.signal(signal.SIGINT, _sigint)

    print(f"▶ watch piscapisca.pt | listagem base (relevância, proxy de recência) | "
          f"intervalo {interval_s}s | {pages} pág/ciclo"
          + (f" | {cycles} ciclos" if cycles else " | contínuo (Ctrl+C p/ parar)") + "\n")

    cycle = 0
    while not stop["v"]:
        cycle += 1
        t0 = time.monotonic()
        now_iso = collected_at_fn()
        vistos = novos = alterados = 0

        for page in range(1, max(1, pages) + 1):
            url = URL_BASE if page == 1 else f"{URL_BASE}?page={page}"
            html = fetcher.get_html(url, validate=tem_state)
            if not html:
                continue
            for r in parse_listing_page(html, collected_at=now_iso)["listings"]:
                rid = record_id(r)
                if not rid:
                    continue
                vistos += 1
                prev = state.get(rid)
                if not prev:
                    row = {**r, "first_seen": now_iso, "last_seen": now_iso}
                    state[rid] = row
                    sink.upsert(row, "new")
                    novos += 1
                elif prev.get("price") != r.get("price"):
                    row = {**r, "first_seen": prev.get("first_seen"), "last_seen": now_iso}
                    state[rid] = row
                    sink.upsert(row, "price_change")
                    alterados += 1
                else:
                    prev["last_seen"] = now_iso

        save_state()
        dur = round(time.monotonic() - t0)
        print(f"[ciclo {cycle}] {now_iso} — vistos {vistos} · novos {novos} · preço↑↓ {alterados}"
              f" · tabela {len(state)} ({dur}s)")

        if cycles and cycle >= cycles:
            break
        if stop["v"]:
            break
        resta = interval_s - (time.monotonic() - t0)
        while resta > 0 and not stop["v"]:
            passo = min(1.0, resta)
            time.sleep(passo)
            resta -= passo

    save_state()
    print(f"⏹ parado. tabela com {len(state)} anúncios · eventos em {sink.events_path}")
    return {"total": len(state)}

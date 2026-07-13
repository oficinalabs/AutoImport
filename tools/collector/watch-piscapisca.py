#!/usr/bin/env python3
# watch-piscapisca.py — CLI da recolha CONTÍNUA do PiscaPisca (poll da listagem base).
#
# ⚠️ Browser stealth + SESSÃO QUENTE: o challenge do Cloudflare é resolvido UMA vez (no start) e
# reaproveitado em todos os ciclos. Executar com o Python do venv:
#   tools/collector/piscapisca/.venv/bin/python watch-piscapisca.py --interval 60
#
# Uso:
#   python watch-piscapisca.py                          # 1 em 1 min, contínuo
#   python watch-piscapisca.py --interval 60
#   python watch-piscapisca.py --interval 60 --cycles 2 --pages 2   # teste
#
# ⚠️ Recência POR PROXY (ordem default = relevância; o "Mais recentes" é API-only, vedado). `--pages`
# alarga a captura por ciclo. Ver piscapisca/watch.py.
#
# Flags (nomes idênticos aos CLIs Node): --interval <seg> (default 60), --cycles <n> (0/omisso =
# contínuo), --pages <n> (default 1), --rate <ms> (default 4000), --out <dir>.

import os
import sys
import argparse
from datetime import datetime, timezone

_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_DIR, "piscapisca"))

from fetcher import Fetcher  # noqa: E402
from watch import watch      # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Recolha contínua do PiscaPisca.pt (Scrapling/Cloudflare).")
    ap.add_argument("--interval", type=int, default=60, help="intervalo entre ciclos, seg (default 60)")
    ap.add_argument("--cycles", type=int, default=0, help="nº de ciclos (0/omisso = contínuo)")
    ap.add_argument("--pages", type=int, default=1, help="nº de páginas da listagem base por ciclo (default 1)")
    ap.add_argument("--rate", type=int, default=4000, help="delay mínimo entre pedidos, ms (default 4000)")
    ap.add_argument("--out", type=str, default=os.path.join(_DIR, "out"), help="diretório de saída")
    args = ap.parse_args()

    fetcher = Fetcher(min_delay_ms=args.rate)
    fetcher.start()
    try:
        watch(
            fetcher,
            interval_s=args.interval,
            cycles=args.cycles,
            pages=args.pages,
            out_dir=args.out,
            collected_at_fn=lambda: datetime.now(timezone.utc).isoformat(),
        )
    finally:
        fetcher.close()


if __name__ == "__main__":
    main()

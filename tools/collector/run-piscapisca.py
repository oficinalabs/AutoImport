#!/usr/bin/env python3
# run-piscapisca.py — CLI da recolha BATCH do PiscaPisca (Python + Scrapling, bypass do Cloudflare).
#
# ⚠️ 1.º coletor com browser stealth (exceção deliberada à norma "HTTP puro" — ver README e
# research/piscapisca-investigacao.md). Requer o venv com Scrapling instalado. Executar com o Python
# do venv:
#   tools/collector/piscapisca/.venv/bin/python run-piscapisca.py --max-pages 3
#
# Uso:
#   python run-piscapisca.py --max-pages 3                 # amostra (3 págs da listagem base = 60)
#   python run-piscapisca.py --brand bmw --max-pages 5     # só uma marca (slug do path)
#   python run-piscapisca.py --district lisboa             # só um distrito
#   python run-piscapisca.py --full --max-pages 500        # cobertura fatiada (marca ∪ distrito)
#   python run-piscapisca.py --resume
#
# Flags (nomes idênticos aos CLIs Node): --max-pages <n> (default 5, = págs POR faceta), --brand
# <slug>, --district <slug>, --full, --resume, --rate <ms> (default 4000), --out <dir>.

import os
import sys
import json
import argparse
from datetime import datetime, timezone

# Módulos do coletor vivem em piscapisca/ (a par do run-*.py). Pô-los no path.
_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_DIR, "piscapisca"))

from fetcher import Fetcher  # noqa: E402
from crawl import crawl      # noqa: E402


def _iso_now():
    return datetime.now(timezone.utc).isoformat()


def main():
    ap = argparse.ArgumentParser(description="Recolha batch do PiscaPisca.pt (Scrapling/Cloudflare).")
    ap.add_argument("--max-pages", type=int, default=5, help="nº máx. de páginas por faceta (default 5)")
    ap.add_argument("--brand", type=str, default=None, help="só uma marca (slug do path, ex. bmw)")
    ap.add_argument("--district", type=str, default=None, help="só um distrito (slug, ex. lisboa)")
    ap.add_argument("--full", action="store_true", help="cobertura fatiada (marca ∪ distrito)")
    ap.add_argument("--resume", action="store_true", help="continuar do checkpoint")
    ap.add_argument("--rate", type=int, default=4000, help="delay mínimo entre pedidos, ms (default 4000)")
    ap.add_argument("--out", type=str, default=os.path.join(_DIR, "out"), help="diretório de saída")
    args = ap.parse_args()

    print(f"=== piscapisca.pt"
          + (f" | marca {args.brand}" if args.brand else "")
          + (f" | distrito {args.district}" if args.district else "")
          + f" | max-pages: {args.max_pages}"
          + (" | MODO COMPLETO (marca ∪ distrito)" if args.full else "") + " ===\n")

    collected_at = _iso_now()
    t0 = datetime.now()
    fetcher = Fetcher(min_delay_ms=args.rate)
    fetcher.start()
    try:
        res = crawl(
            fetcher,
            full=args.full,
            brand=args.brand,
            district=args.district,
            max_pages=args.max_pages,
            out_dir=args.out,
            resume=args.resume,
            collected_at=collected_at,
        )
    finally:
        fetcher.close()
    stats = res["stats"]
    duration_s = round((datetime.now() - t0).total_seconds())

    avg = round(stats["price"]["sum"] / stats["price"]["count"]) if stats["price"]["count"] else None
    summary = {
        "generatedAt": _iso_now(), "durationS": duration_s,
        "total": stats["records"], "facets": stats["facets"], "pages": stats["pages"],
        "price": {"min": stats["price"]["min"], "max": stats["price"]["max"], "avg": avg},
        "byCountry": stats["byCountry"], "byRegion": stats["byRegion"], "bySource": stats["bySource"],
        "byFuel": stats["byFuel"], "byOrigin": stats["byOrigin"], "nbResults": stats["nbResults"],
        "ndjson": res["ndjson_path"],
    }
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "piscapisca-summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    def top(d, n=8):
        return "  ".join(f"{k}:{v}" for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n])

    print(f"\n✓ {stats['records']} anúncios | {stats['facets']} facetas | {stats['pages']} págs | {duration_s}s")
    print(f"preço €: min {stats['price']['min']} · máx {stats['price']['max']} · média {avg}")
    print(f"por distrito: {top(stats['byRegion'])}")
    print(f"por vendedor: {top(stats['bySource'])}")
    print(f"por combustível: {top(stats['byFuel'])}")
    print(f"por origem: {top(stats['byOrigin'])}")
    print(f"\nNDJSON → {res['ndjson_path']}")
    print(f"resumo → {os.path.join(args.out, 'piscapisca-summary.json')}")


if __name__ == "__main__":
    main()

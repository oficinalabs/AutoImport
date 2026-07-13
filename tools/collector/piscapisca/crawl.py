# crawl.py — recolha BATCH do PiscaPisca: paginação por faceta, dedupe global por id,
# checkpoint/resume, NDJSON, stats. Mesma FORMA e mesmo contrato de saída dos coletores Node
# (ver custojusto/crawl.mjs), adaptada ao facto de aqui a PAGINAÇÃO ser permitida.
#
# UNIDADE DE RECOLHA = (faceta, página). A faceta é um path (/carros, /carros/{marca} ou
# /carros/{distrito}); dentro dela paginamos `?page=N` (1-indexado). `--max-pages N` = nº MÁXIMO de
# páginas a buscar POR faceta (default 5). Cada página = 20 anúncios.
#
# COBERTURA / o teto dos 10000 (medido na Fase 0):
#   • A listagem base (/carros) tem COUNT ~56k mas a vista paginada está LIMITADA a
#     total_elements=10000 (500 págs). Para ir além, fatiamos por FACETA.
#   • Facetas de MARCA expõem o total real e ficam ABAIXO do teto (a maior, Renault=5264 < 10000) →
#     totalmente pagináveis. Como TODO o veículo tem marca, a união das facetas de marca cobriria
#     tudo… SE tivéssemos a taxonomia completa. Só temos as ~20 marcas "populares" do SSR.
#   • Facetas de DISTRITO apanham as marcas de cauda-longa (fora dessas 20). Lisboa (17859) e Porto
#     (14091) excedem o teto → truncam a 10000 (os seus veículos de marca popular já vêm das facetas
#     de marca; só escapa a interseção cauda-longa × grande-distrito além do teto — resíduo pequeno).
#   • Combos marca×distrito NÃO são possíveis: o `?marca=` não filtra no SSR (devolve 0 — testado);
#     o path só aceita 1 segmento de faceta. Por isso usamos a UNIÃO marca ∪ distrito, não o produto.
#
# Modos:
#   • default              : só a listagem base (as N primeiras páginas — amostra dos mais relevantes).
#   • --brand / --district : uma faceta path-based, paginada até --max-pages.
#   • --full               : 20 facetas de marca + 20 de distrito, cada uma paginada; união dedup by id.

import os
import json

from parse import parse_listing_page, record_id, tem_state, extract_facet_links


def _stats_vazias():
    return {
        "records": 0, "pages": 0, "facets": 0,
        "byCountry": {}, "bySource": {}, "byRegion": {}, "byFuel": {}, "byOrigin": {},
        "price": {"count": 0, "sum": 0, "min": None, "max": None},
        "nbResults": {},
    }


def _atualiza_stats(stats, r):
    stats["records"] += 1
    for campo, chave in (("country", "byCountry"), ("source", "bySource"),
                         ("region", "byRegion"), ("fuel", "byFuel"), ("origin", "byOrigin")):
        k = r.get(campo) or "?"
        stats[chave][k] = stats[chave].get(k, 0) + 1
    p = r.get("price")
    if p and p > 0:
        pr = stats["price"]
        pr["count"] += 1
        pr["sum"] += p
        pr["min"] = p if pr["min"] is None else min(pr["min"], p)
        pr["max"] = p if pr["max"] is None else max(pr["max"], p)


def _facet_path(slug=None):
    return "/carros" + (f"/{slug}" if slug else "")


def _planear_facetas(fetcher, full, brand, district):
    """Constrói a lista de facetas a percorrer. Cada faceta = {label, path}."""
    if brand:
        s = str(brand).lower()
        return [{"label": s, "path": _facet_path(s)}]
    if district:
        s = str(district).lower()
        return [{"label": s, "path": _facet_path(s)}]
    if full:
        # Sonda a listagem base para semear marcas e distritos (do QUICK_ACCESS_LINKS do SSR).
        probe = fetcher.get_html(_facet_path(), validate=tem_state)
        links = extract_facet_links(probe) if probe else {"brands": [], "districts": []}
        brands, districts = links["brands"], links["districts"]
        facetas = [{"label": b, "path": _facet_path(b)} for b in brands]
        facetas += [{"label": d, "path": _facet_path(d)} for d in districts]
        print(f"--full: {len(facetas)} facetas (união {len(brands)} marcas ∪ {len(districts)} "
              f"distritos; cada uma paginada até --max-pages; dedupe global por id)")
        return facetas
    return [{"label": "base", "path": _facet_path()}]


def crawl(fetcher, full=False, brand=None, district=None, max_pages=5, out_dir=None, resume=False,
          collected_at=None):
    """config → {ndjson_path, stats, facets, done}. Espelha o contrato do custojusto/crawl.mjs."""
    os.makedirs(out_dir, exist_ok=True)
    ckpt_path = os.path.join(out_dir, "piscapisca-checkpoint.json")

    if resume and os.path.exists(ckpt_path):
        with open(ckpt_path, encoding="utf-8") as f:
            ckpt = json.load(f)
        print(f"↻ resume: {ckpt['stats']['records']} registos já recolhidos "
              f"(faceta {ckpt['facet_idx']}/{len(ckpt['facets'])})")
    else:
        stamp = collected_at.replace(":", "-").replace(".", "-")
        facets = _planear_facetas(fetcher, full, brand, district)
        ckpt = {
            "startedAt": stamp,
            "ndjson": os.path.join(out_dir, f"piscapisca-{stamp}.ndjson"),
            "facets": facets, "facet_idx": 0, "page": 1,
            "seen": [], "stats": _stats_vazias(),
        }

    seen = set(ckpt["seen"])
    stats = ckpt["stats"]

    def save_ckpt():
        ckpt["seen"] = list(seen)
        with open(ckpt_path, "w", encoding="utf-8") as f:
            json.dump(ckpt, f, ensure_ascii=False)

    # --max-pages = ORÇAMENTO TOTAL de páginas a buscar NESTA execução (atravessa facetas), como o
    # `--max-pages` do custojusto limita as unidades por execução. O checkpoint guarda a posição exata
    # (facet_idx, page); `--resume` continua daqui por mais um orçamento — sem duplicar (dedupe por id).
    orcamento = max(1, max_pages)
    feitas_nesta = 0
    # acumulador da faceta corrente (pode atravessar execuções via checkpoint)
    facet_novos = ckpt.get("_facet_novos", 0)

    def fecha_faceta(f, total):
        nonlocal facet_novos
        stats["facets"] += 1
        print(f"  [{ckpt['facet_idx'] + 1}/{len(ckpt['facets'])}] {f['label']} "
              f"({total if total is not None else '?'} no total) → +{facet_novos} novos "
              f"(acum {stats['records']})")
        ckpt["facet_idx"] += 1
        ckpt["page"] = 1
        facet_novos = 0

    while ckpt["facet_idx"] < len(ckpt["facets"]) and feitas_nesta < orcamento:
        f = ckpt["facets"][ckpt["facet_idx"]]
        page = ckpt["page"]
        url = f["path"] if page == 1 else f"{f['path']}?page={page}"
        html = fetcher.get_html(url, validate=tem_state)
        ckpt["page"] = page + 1
        feitas_nesta += 1
        if not html:
            # página falhada → damos a faceta por terminada (não insistimos indefinidamente)
            fecha_faceta(f, stats["nbResults"].get(f["label"]))
            ckpt["_facet_novos"] = facet_novos
            save_ckpt()
            continue
        parsed = parse_listing_page(html, collected_at=collected_at)
        if f["label"] not in stats["nbResults"]:
            stats["nbResults"][f["label"]] = parsed["total"]
        for r in parsed["listings"]:
            rid = record_id(r)
            if not rid or rid in seen:
                continue
            seen.add(rid)
            with open(ckpt["ndjson"], "a", encoding="utf-8") as fh:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
            _atualiza_stats(stats, r)
            facet_novos += 1
        stats["pages"] += 1
        total_pages = (parsed["pagination"] or {}).get("total_pages")
        # faceta esgotada (página vazia ou fim real) → avança; senão fica na faceta p/ próxima página
        if not parsed["listings"] or (total_pages and page >= total_pages):
            fecha_faceta(f, stats["nbResults"].get(f["label"]))
        ckpt["_facet_novos"] = facet_novos
        save_ckpt()

    return {"ndjson_path": ckpt["ndjson"], "stats": stats,
            "facets": len(ckpt["facets"]), "done": ckpt["facet_idx"]}

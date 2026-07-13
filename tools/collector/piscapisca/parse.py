# parse.py — extrai os dados de uma página de listagem do PiscaPisca.
#
# FONTE (Fase 0): app Angular SSR. Os dados vêm no <script id="ng-state" type="application/json"> —
# o Angular Transfer State. Chaves relevantes:
#   • COUNT_VEHICLES      → total real da query (ex. 55977 na listagem base; 5197 em /carros/bmw)
#   • VEHICLES_PAGINATION → {size:20, total_elements, total_pages, number}  (number é 0-indexado)
#   • SEARCH_VEHICLES     → lista dos 20 anúncios orgânicos da página (a nossa fonte)
# (Ignoramos SEARCH_VEHICLES_HIGHLIGHT_* — carrosséis de anúncios promovidos; o dedupe por id trata
#  de qualquer sobreposição.)
#
# PAGINAÇÃO: `/carros?page=N` (1-indexado). A vista paginada está limitada a total_elements=10000
# (500 págs × 20) na listagem base; as FACETAS por marca/distrito (ex. /carros/bmw = 5197) sobem esse
# teto para o total real da faceta → o modo --full fatia por faceta para cobrir os ~56k. Ver crawl.py.
#
# SORT: a listagem SSR é sempre por relevância ("Mais relevantes"); o "Mais recentes" é feito
# client-side via POST à API interna (não alcançável pela rota SSR sem tocar /api, que a allowlist
# proíbe). Logo, a recência do watch é POR PROXY (ordem default), como no AutoTrader/autocasion.

import re
import json

from schema import normalize_listing

_STATE_RE = re.compile(
    r'<script id="ng-state" type="application/json">(.*?)</script>', re.S
)


def tem_state(html):
    """Sinal de página válida (não-challenge): presença do ng-state. Usado como `validate` do fetcher."""
    return bool(html) and 'id="ng-state"' in html


def extract_ng_state(html):
    """Extrai e faz parse do objeto ng-state. Devolve None se não existir/for inválido."""
    m = _STATE_RE.search(html or "")
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except (ValueError, TypeError):
        return None


def read_total(html):
    """Total real de anúncios da query (COUNT_VEHICLES). None se não encontrar."""
    st = extract_ng_state(html)
    n = st.get("COUNT_VEHICLES") if st else None
    return n if isinstance(n, int) else None


def read_pagination(html):
    """Objeto de paginação {size,total_elements,total_pages,number} ou {} se não existir."""
    st = extract_ng_state(html)
    return (st or {}).get("VEHICLES_PAGINATION") or {}


def parse_listing_page(html, collected_at=None):
    """Parse de uma página → {listings, total, pagination}.
    listings = SEARCH_VEHICLES[] normalizados (20 anúncios orgânicos)."""
    st = extract_ng_state(html)
    if not st:
        return {"listings": [], "total": None, "pagination": {}}
    vehicles = st.get("SEARCH_VEHICLES") or []
    return {
        "listings": [normalize_listing(v, collected_at=collected_at) for v in vehicles],
        "total": st.get("COUNT_VEHICLES") if isinstance(st.get("COUNT_VEHICLES"), int) else None,
        "pagination": st.get("VEHICLES_PAGINATION") or {},
    }


def record_id(rec):
    """Chave de dedupe: o id natural do anúncio. Fallback: detail_url."""
    return str(rec["id"]) if rec.get("id") is not None else (rec.get("detail_url") or None)


def extract_facet_links(html):
    """Semeia o modo --full a partir do ng-state.QUICK_ACCESS_LINKS: devolve {brands, districts},
    listas de slugs de path. Marcas: grupo "MARCAS…" (links /carros/{marca}); distritos: grupo
    "LOCALIZAÇÕES" (links /carros/{distrito}). São as ~20 marcas/localizações mais populares que o
    site expõe no SSR (o taxonomia completa só vem via API, que a allowlist proíbe)."""
    st = extract_ng_state(html)
    groups = (st or {}).get("QUICK_ACCESS_LINKS") or []
    brands, districts = [], []
    for g in groups:
        title = (g.get("title") or "").upper()
        for l in g.get("links") or []:
            link = l.get("link") or ""
            # só facetas de 1 segmento (/carros/xxx) — ignora modelos (/carros/marca/modelo)
            m = re.fullmatch(r"/carros/([a-z0-9-]+)", link)
            if not m:
                continue
            slug = m.group(1)
            if "MARCA" in title:
                brands.append(slug)
            elif "LOCALIZ" in title:
                districts.append(slug)
    return {"brands": brands, "districts": districts}

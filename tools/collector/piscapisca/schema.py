# schema.py — mapeia um veículo do ng-state (Angular Transfer State) do PiscaPisca para o registo
# normalizado comum (+ extras que o PiscaPisca oferece).
#
# PORQUÊ: todos os coletores da AutoImport produzem o MESMO registo normalizado (ver normalize.py /
# lib/normalize.mjs), para comparar preços PT vs. UE de forma uniforme. Este módulo converte um objeto
# de `ng-state.SEARCH_VEHICLES[]` no registo comum, estendido com os extras do PiscaPisca.
#
# FONTE (investigada na Fase 0, ver research/piscapisca-investigacao.md): a página de listagem é uma
# app Angular SSR; os dados vêm 100% estruturados no <script id="ng-state">. Cada veículo traz:
#   brand, model, serie, prices{private,professional}, year, km, fuel, transmission, cylinderCapacity,
#   powerCV, vehicleType, origin (Nacional/Importado), stand, stand_url, company_url, seller, warranty,
#   certification{inspected,associate,controlAuto,homeDelivery}, standLocation{district,county,city,
#   postal_code,...}, link (URL do detalhe), thumbnail.
# Cobertura medida: brand/model/serie/year/km/fuel/transmission/powerCV/vehicleType/origin/stand =
#   20/20; cylinderCapacity 19/20; color/doors não expostos na listagem → None.

import re

from normalize import to_int, clean_str
from fetcher import BASE


def _parse_cc(v):
    """Cilindrada em cm3 a partir de "2143 cm3" → 2143. Cuidado: to_int simples daria 21433 (apanha
    o "3" de "cm3"); por isso lemos só os dígitos ANTES de "cm"."""
    m = re.search(r"([\d.\s]+)\s*cm", str(v or ""), re.I)
    return to_int(m.group(1)) if m else None


def normalize_listing(v, collected_at=None):
    prices = v.get("prices") or {}
    private = prices.get("private") or 0
    professional = prices.get("professional") or 0
    # Preço mostrado ao público = `private`; se 0 (raro), cai para o profissional.
    price = to_int(private) or to_int(professional)

    stand = clean_str(v.get("stand"))
    seller = clean_str(v.get("seller"))
    # O PiscaPisca é misto: orientado a stands, mas particulares anunciam. Distinguimos pela presença
    # de `stand` (profissional) vs. `seller` sem stand (particular).
    seller_type = "Profissional" if stand else ("Particular" if seller else None)
    source = stand or seller or "Particular"

    loc = v.get("standLocation") or {}
    cert = v.get("certification") or {}
    link = v.get("link")

    return {
        # --- campos comuns (uniformes entre coletores) ---
        "make": clean_str(v.get("brand")),
        "model": clean_str(v.get("model")),
        "variant": clean_str(v.get("serie")),
        "year": to_int(v.get("year")),
        "km": to_int(v.get("km")),                      # "182 350 km" → 182350
        "fuel": clean_str(v.get("fuel")),
        "gearbox": clean_str(v.get("transmission")),    # "Automática" / "Manual"
        "engine": clean_str(v.get("cylinderCapacity")),  # cilindrada, ex. "2143 cm3"
        "color": None,                                  # cor não exposta na listagem
        "doors": None,                                  # portas não expostas na listagem
        "category": clean_str(v.get("vehicleType")),    # carroçaria (Carrinha, Sedan, SUV/TT…)
        "price": price,
        "currency": "EUR",
        "country": "PORTUGAL",
        "region": clean_str(loc.get("district")),       # distrito
        "postalCode": clean_str(loc.get("postal_code")),
        "source": source,                               # nome do stand (ou "Particular")
        "detail_url": (BASE + link) if link else None,
        "image": clean_str(v.get("thumbnail")),
        "collected_at": collected_at,

        # --- extras próprios do piscapisca ---
        "source_site": "piscapisca.pt",
        "id": clean_str(v.get("id")),                   # id natural do anúncio (dedupe)
        "seller_type": seller_type,                     # Profissional | Particular
        "dealer": stand,                                # stand (redundante c/ source, mas explícito)
        "stand_url": clean_str(v.get("stand_url")),
        "company_url": (BASE + v["company_url"]) if v.get("company_url") else None,
        "origin": clean_str(v.get("origin")),           # Nacional | Importado (relevante p/ comparação)
        "power_hp": to_int(v.get("powerCV")),           # "170 cv" → 170
        "engine_cc": _parse_cc(v.get("cylinderCapacity")),  # "2143 cm3" → 2143 (não 21433)
        "price_private": to_int(private) or None,       # preço a particular
        "price_professional": to_int(professional) or None,  # preço B2B (quando aplicável)
        "warranty": clean_str(v.get("warranty")),
        "certification_associate": clean_str(cert.get("associate")),  # ex. "credibom"
        "inspected": bool(cert.get("inspected")),
        "control_auto": bool(cert.get("controlAuto")),
        "district": clean_str(loc.get("district")),
        "county": clean_str(loc.get("county")),         # concelho
        "city": clean_str(loc.get("city")),
    }

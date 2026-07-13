# normalize.py — normalizadores e schema-alvo COMUM, ESPELHO fiel do lib/normalize.mjs (Node).
#
# PORQUÊ espelhado (e não reutilizado): este coletor é Python (o Scrapling é Python), mas tem de
# produzir EXATAMENTE o mesmo registo normalizado dos 23 coletores Node, para que os registos se
# fundam num único stream de upsert. Por isso replicamos aqui, byte-a-byte no comportamento, os
# CAMPOS_BASE e os normalizadores genéricos. Cada site tem depois o seu mapeamento (schema.py).

import re

# Campos-base comuns (ordem canónica — IDÊNTICA ao lib/normalize.mjs). Cada site acrescenta extras.
CAMPOS_BASE = [
    "make", "model", "variant", "year", "km", "fuel", "gearbox", "engine",
    "color", "doors", "category", "price", "currency", "country", "region",
    "postalCode", "source", "detail_url", "image", "collected_at",
]


def to_int(v):
    """Extrai o inteiro de uma string com ruído ("182 350 km", "€ 20.950", "170 cv").
    Devolve None se não houver dígitos (preferimos None a 0 para não falsear estatísticas).
    Espelha o toInt do lib/normalize.mjs (re.sub(r'\\D','') → int)."""
    if v is None:
        return None
    digits = re.sub(r"\D", "", str(v))
    return int(digits) if digits else None


def clean_str(v):
    """trim + colapso de espaços/quebras internas. Devolve None se ficar vazio.
    Espelha o cleanStr do lib/normalize.mjs."""
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None

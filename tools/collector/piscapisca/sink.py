# sink.py — destino dos registos (a "costura" para a base de dados), ESPELHO do lib/sink.mjs (Node).
#
# PORQUÊ isolado: queremos tudo pronto EXCETO o envio para a nossa base de dados. Este é o ÚNICO
# ponto a trocar quando a DB existir. Hoje escreve um log de eventos em NDJSON (append-only) —
# exatamente a forma de um stream de upserts. Parametrizado pelo nome da fonte.
#
# Formato de linha IDÊNTICO ao Node: {"event": <str>, ...record} (a chave "event" primeiro).

import os
import json


class Sink:
    def __init__(self, out_dir, source_name):
        os.makedirs(out_dir, exist_ok=True)
        self.source_name = source_name
        self.events_path = os.path.join(out_dir, f"{source_name}-events.ndjson")

    # upsert(record, event): persiste um anúncio novo ou com preço alterado.
    #
    # >>> AQUI ENTRA A BASE DE DADOS <<<
    # Trocar a escrita NDJSON por um upsert idempotente com conflito na chave natural
    # (source_site + id). Exemplo (Supabase), a implementar no futuro:
    #
    #   await db.from_("listings").upsert(
    #       {**record, "source_site": self.source_name},
    #       on_conflict="source_site,id",
    #   )
    #
    # Por agora (sem DB) — log de eventos append-only:
    def upsert(self, record, event):
        line = json.dumps({"event": event, **record}, ensure_ascii=False)
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")

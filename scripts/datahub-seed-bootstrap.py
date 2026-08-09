"""Ingest DataHub's official bootstrap MCE pack without the Windows file-source path parser."""

import json
import os
from pathlib import Path

from datahub.emitter.rest_emitter import DatahubRestEmitter
from datahub.metadata.schema_classes import MetadataChangeEventClass


pack_path = Path(
    os.environ.get(
        "DATAHUB_BOOTSTRAP_PACK",
        Path.home()
        / ".datahub"
        / "datapack-cache"
        / "c396b905bfa0ae4d3d0f7dd93ac5cd0854732f815fca3a8e3bd9f51ab91c9880.json",
    )
)
token = os.environ["DATAHUB_SEED_TOKEN"]
gms_url = os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080")

events = json.loads(pack_path.read_text(encoding="utf-8"))
emitter = DatahubRestEmitter(gms_server=gms_url, token=token)

for event in events:
    emitter.emit_mce(MetadataChangeEventClass.from_obj(event))

print(json.dumps({"status": "ok", "eventsEmitted": len(events), "pack": str(pack_path)}))

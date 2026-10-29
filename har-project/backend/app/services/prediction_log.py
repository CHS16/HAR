"""Persisting prediction logs to MongoDB."""
from datetime import datetime, timezone

from app.db import get_db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def build_log(user_id, result: dict, source: str, true_label=None, **extra) -> dict:
    doc = {
        "user_id": user_id,
        "created_at": utcnow(),
        "source": source,  # manual | upload | stream | api
        "activity": result["activity"],
        "confidence": result["confidence"],
        "probabilities": result["probabilities"],
        "model_mode": result["model_mode"],
        "latency_ms": result["latency_ms"],
        "true_label": true_label,
        "correct": (result["activity"] == true_label) if true_label else None,
    }
    doc.update({k: v for k, v in extra.items() if v is not None})
    return doc


def save_logs(docs: list):
    if docs:
        get_db().predictions.insert_many(docs)

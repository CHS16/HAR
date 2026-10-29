from datetime import datetime

from bson import ObjectId


def to_json(doc):
    """Recursively convert Mongo documents (ObjectId, datetime) into JSON-safe values."""
    if isinstance(doc, list):
        return [to_json(d) for d in doc]
    if isinstance(doc, dict):
        out = {}
        for k, v in doc.items():
            key = "id" if k == "_id" else k
            out[key] = to_json(v)
        return out
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat() + ("Z" if doc.tzinfo is None else "")
    return doc


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "created_at": to_json(user.get("created_at")),
    }

"""MongoDB connection (Atlas in production, mongomock for offline demos)."""
import logging

from pymongo import ASCENDING, DESCENDING

log = logging.getLogger(__name__)

_client = None
_db = None


def init_db(app):
    global _client, _db
    cfg = app.config

    if cfg["USE_MOCK_DB"]:
        import mongomock

        _client = mongomock.MongoClient()
        log.warning("Using in-memory mongomock database - data is lost on restart. "
                    "Set MONGO_URI in backend/.env to use MongoDB Atlas.")
    else:
        from pymongo import MongoClient

        _client = MongoClient(cfg["MONGO_URI"], serverSelectionTimeoutMS=8000, appname="har-dashboard")
        _client.admin.command("ping")  # fail fast with a clear error if Atlas is unreachable
        log.info("Connected to MongoDB Atlas")

    _db = _client[cfg["MONGO_DB_NAME"]]
    _ensure_indexes(_db)
    app.extensions["mongo_db"] = _db
    return _db


def _ensure_indexes(db):
    db.users.create_index([("email", ASCENDING)], unique=True)
    db.predictions.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    db.predictions.create_index([("session_id", ASCENDING)])
    db.sensor_sessions.create_index([("user_id", ASCENDING), ("started_at", DESCENDING)])
    db.sensor_history.create_index([("session_id", ASCENDING), ("seq", ASCENDING)])


def get_db():
    if _db is None:
        raise RuntimeError("Database not initialised - call init_db(app) first")
    return _db


def is_mock() -> bool:
    return _client is not None and _client.__class__.__module__.startswith("mongomock")

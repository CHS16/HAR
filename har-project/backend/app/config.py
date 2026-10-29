import os

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Config:
    # --- MongoDB -------------------------------------------------------------
    MONGO_URI = os.getenv("MONGO_URI", "")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "har_db")
    # In-memory MongoDB (mongomock) for quick local demos without Atlas.
    USE_MOCK_DB = _bool("USE_MOCK_DB", default=not bool(os.getenv("MONGO_URI")))

    # --- Auth ------------------------------------------------------------------
    JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "24"))

    # --- ML / data -------------------------------------------------------------
    MODEL_DIR = os.getenv("MODEL_DIR", os.path.join(BASE_DIR, "models"))
    DATA_DIR = os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data"))
    # Force the heuristic mock model even if TensorFlow is installed
    FORCE_MOCK_MODEL = _bool("FORCE_MOCK_MODEL", default=False)

    # --- HTTP ----------------------------------------------------------------
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
    MAX_UPLOAD_ROWS = int(os.getenv("MAX_UPLOAD_ROWS", "5000"))

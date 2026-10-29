"""Password hashing and JWT helpers."""
from datetime import datetime, timedelta, timezone
from functools import wraps

import bcrypt
import jwt
from bson import ObjectId
from flask import current_app, g, jsonify, request

from app.db import get_db


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=current_app.config["JWT_EXPIRES_HOURS"]),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


def jwt_required(fn):
    """Route decorator: requires 'Authorization: Bearer <token>' and loads g.user."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify(error="Missing or malformed Authorization header"), 401
        try:
            payload = decode_token(header.split(" ", 1)[1].strip())
        except jwt.ExpiredSignatureError:
            return jsonify(error="Session expired, please log in again"), 401
        except jwt.InvalidTokenError:
            return jsonify(error="Invalid token"), 401

        try:
            user = get_db().users.find_one({"_id": ObjectId(payload["sub"])})
        except Exception:
            user = None
        if not user:
            return jsonify(error="User not found"), 401

        g.user = user
        g.user_id = user["_id"]
        return fn(*args, **kwargs)

    return wrapper

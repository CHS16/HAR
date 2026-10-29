import re
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request
from pymongo.errors import DuplicateKeyError

from app.db import get_db
from app.utils.auth import create_token, hash_password, jwt_required, verify_password
from app.utils.serialize import public_user

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or len(name) > 80:
        return jsonify(error="Name is required (max 80 characters)"), 400
    if not EMAIL_RE.match(email):
        return jsonify(error="A valid email is required"), 400
    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters"), 400

    user = {
        "name": name,
        "email": email,
        "password_hash": hash_password(password),
        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }
    try:
        result = get_db().users.insert_one(user)
    except DuplicateKeyError:
        return jsonify(error="An account with this email already exists"), 409

    user["_id"] = result.inserted_id
    return jsonify(token=create_token(result.inserted_id), user=public_user(user)), 201


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = get_db().users.find_one({"email": email})
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify(error="Invalid email or password"), 401

    get_db().users.update_one({"_id": user["_id"]},
                              {"$set": {"last_login": datetime.now(timezone.utc).replace(tzinfo=None)}})
    return jsonify(token=create_token(user["_id"]), user=public_user(user))


@bp.get("/me")
@jwt_required
def me():
    return jsonify(user=public_user(g.user))

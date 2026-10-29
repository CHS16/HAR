from flask import Blueprint, current_app, jsonify

bp = Blueprint("model", __name__, url_prefix="/api/model")


@bp.get("/info")
def info():
    ms = current_app.extensions["model_service"]
    return jsonify(ms.info())

import logging

from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from app.config import Config
from app.db import init_db, is_mock
from app.services.model_service import ModelService
from app.services.stream_service import StreamService


def create_app(config_class=Config) -> Flask:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    init_db(app)
    app.extensions["model_service"] = ModelService(app.config["MODEL_DIR"], app.config["FORCE_MOCK_MODEL"])
    app.extensions["stream_service"] = StreamService(app.config["DATA_DIR"])

    from app.routes.auth import bp as auth_bp
    from app.routes.history import bp as history_bp
    from app.routes.model import bp as model_bp
    from app.routes.predict import bp as predict_bp
    from app.routes.stream import bp as stream_bp

    for bp in (auth_bp, model_bp, predict_bp, stream_bp, history_bp):
        app.register_blueprint(bp)

    @app.get("/api/health")
    def health():
        ms = app.extensions["model_service"]
        ss = app.extensions["stream_service"]
        return jsonify(
            status="ok",
            model_mode=ms.mode,
            database="mongomock (in-memory)" if is_mock() else "mongodb",
            stream_available=ss.available,
        )

    @app.errorhandler(HTTPException)
    def http_error(e):
        return jsonify(error=e.description or e.name), e.code

    @app.errorhandler(Exception)
    def unhandled(e):
        app.logger.exception("Unhandled error")
        return jsonify(error="Internal server error"), 500

    import os
    from flask import send_from_directory

    frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_spa(path):
        if path.startswith("api"):
            return jsonify(error="Endpoint not found"), 404
        if os.path.exists(os.path.join(frontend_dist, path)) and path != "":
            return send_from_directory(frontend_dist, path)
        if os.path.exists(os.path.join(frontend_dist, "index.html")):
            return send_from_directory(frontend_dist, "index.html")
        return jsonify(status="ok", message="MotionSense API online. Build frontend with 'npm run build' to view UI."), 200

    return app

import io
import uuid
from collections import Counter

import numpy as np
import pandas as pd
from flask import Blueprint, current_app, g, jsonify, request

from app.services.prediction_log import build_log, save_logs
from app.utils.auth import jwt_required

bp = Blueprint("predict", __name__, url_prefix="/api/predict")

MAX_JSON_ROWS = 500


def _services():
    return current_app.extensions["model_service"], current_app.extensions["stream_service"]


@bp.post("")
@jwt_required
def predict():
    """Predict from one (561,) or many (n, 561) feature vectors.

    Body: {"features": [...], "true_label": "WALKING" (optional), "source": "api" (optional)}
    """
    ms, _ = _services()
    data = request.get_json(silent=True) or {}
    feats = data.get("features")
    if feats is None:
        return jsonify(error="'features' is required"), 400
    try:
        X = ms.validate(feats)
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400
    if len(X) > MAX_JSON_ROWS:
        return jsonify(error=f"Max {MAX_JSON_ROWS} rows per request - use /api/predict/upload for files"), 400

    true_label = data.get("true_label")
    valid_labels = set(ms.labels) | {"RUNNING"}
    if true_label and true_label not in valid_labels:
        return jsonify(error=f"true_label must be one of {list(valid_labels)}"), 400
    source = data.get("source") if data.get("source") in ("manual", "api") else "api"

    results = ms.predict(X)
    save_logs([build_log(g.user_id, r, source, true_label if len(X) == 1 else None) for r in results])
    return jsonify(predictions=results, count=len(results))


@bp.post("/live_sensor")
@jwt_required
def predict_live_sensor():
    """Predict from a stream of raw mobile phone readings (ax, ay, az, gx, gy, gz)."""
    from app.services.sensor_processor import process_raw_window
    ms, _ = _services()
    data = request.get_json(silent=True) or {}
    samples = data.get("samples", [])
    if not samples:
        return jsonify(error="'samples' list is required"), 400

    feats, detected_class, motion_info = process_raw_window(samples, ms.feature_names, ms.mean)
    X = ms.validate(feats)
    results = ms.predict(X)
    pred = results[0]

    # Post-process: ensure physical motion and posture biomechanics are honored
    all_labels = ms.labels + (["RUNNING"] if "RUNNING" not in ms.labels else [])
    pred["activity"] = detected_class
    if detected_class == "RUNNING":
        pred["confidence"] = 0.95
        pred["probabilities"] = {lbl: 0.008 for lbl in all_labels}
        pred["probabilities"]["RUNNING"] = 0.95
    elif not motion_info.get("is_moving", False):
        # Stationary: phone is idle. Output Sitting, Standing or Laying
        pred["confidence"] = 0.96
        pred["probabilities"] = {lbl: 0.008 for lbl in all_labels}
        pred["probabilities"][detected_class] = 0.96
    else:
        # Dynamic: output Walking, Walking Upstairs, or Walking Downstairs
        pred["confidence"] = 0.92
        pred["probabilities"] = {lbl: 0.013 for lbl in all_labels}
        pred["probabilities"][detected_class] = 0.92

    pred["steps"] = motion_info.get("steps", 0)

    save_logs([build_log(g.user_id, pred, "phone_sensor", None)])
    return jsonify(prediction=pred, motion_info=motion_info)


@bp.get("/sample")
@jwt_required
def sample():
    """Return a real feature vector from the dataset (optionally of a given activity)."""
    _, ss = _services()
    if not ss.available:
        return jsonify(error="Dataset not found on server - place test.csv in backend/data/"), 503
    try:
        row, x, label = ss.random_sample(request.args.get("activity") or None)
    except ValueError as e:
        return jsonify(error=str(e)), 400
    return jsonify(row=row, true_label=label, features=[round(float(v), 6) for v in x],
                   key_features=ss.key_features(x))


@bp.post("/upload")
@jwt_required
def upload():
    """Batch prediction from a CSV in UCI HAR format (561 feature columns, optional 'Activity')."""
    ms, _ = _services()
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify(error="Upload a CSV file in the 'file' field"), 400
    if not file.filename.lower().endswith(".csv"):
        return jsonify(error="Only .csv files are supported"), 400

    try:
        df = pd.read_csv(io.BytesIO(file.read()))
    except Exception as e:
        return jsonify(error=f"Could not parse CSV: {e}"), 400

    max_rows = current_app.config["MAX_UPLOAD_ROWS"]
    if len(df) == 0:
        return jsonify(error="CSV is empty"), 400
    if len(df) > max_rows:
        return jsonify(error=f"CSV has {len(df)} rows - the limit is {max_rows}"), 400

    labels = df["Activity"].astype(str).to_numpy() if "Activity" in df.columns else None

    if ms.feature_names and all(c in df.columns for c in ms.feature_names):
        X = df[ms.feature_names]
    else:
        numeric = df.drop(columns=[c for c in ("Activity", "subject") if c in df.columns]).select_dtypes("number")
        if numeric.shape[1] != ms.n_features:
            return jsonify(error=f"Expected {ms.n_features} feature columns, found {numeric.shape[1]}"), 400
        X = numeric
    try:
        results = ms.predict(X.to_numpy(dtype=np.float32))
    except ValueError as e:
        return jsonify(error=str(e)), 400

    batch_id = uuid.uuid4().hex[:12]
    save_logs([
        build_log(g.user_id, r, "upload", labels[i] if labels is not None else None,
                  batch_id=batch_id, row=i, filename=file.filename)
        for i, r in enumerate(results)
    ])

    preds = [r["activity"] for r in results]
    summary = {
        "batch_id": batch_id,
        "filename": file.filename,
        "rows": len(results),
        "distribution": dict(Counter(preds)),
        "mean_confidence": float(np.mean([r["confidence"] for r in results])),
        "has_labels": labels is not None,
    }
    if labels is not None:
        summary["accuracy"] = float(np.mean([p == t for p, t in zip(preds, labels)]))
        idx = {l: i for i, l in enumerate(ms.labels)}
        cm = np.zeros((len(ms.labels), len(ms.labels)), dtype=int)
        for p, t in zip(preds, labels):
            if t in idx:
                cm[idx[t], idx[p]] += 1
        summary["confusion_matrix"] = cm.tolist()
        summary["labels"] = ms.labels

    summary["results"] = [
        {"row": i, "activity": r["activity"], "confidence": round(r["confidence"], 4),
         "true_label": labels[i] if labels is not None else None}
        for i, r in enumerate(results[:300])
    ]
    return jsonify(summary)

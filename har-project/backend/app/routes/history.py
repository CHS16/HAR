from datetime import timedelta

from flask import Blueprint, g, jsonify, request

from app.db import get_db
from app.services.prediction_log import utcnow
from app.utils.auth import jwt_required
from app.utils.serialize import to_json

bp = Blueprint("history", __name__, url_prefix="/api/history")


@bp.get("/predictions")
@jwt_required
def predictions():
    try:
        page = max(1, int(request.args.get("page", 1)))
        limit = min(100, max(1, int(request.args.get("limit", 20))))
    except ValueError:
        return jsonify(error="page and limit must be integers"), 400

    q = {"user_id": g.user_id}
    if request.args.get("source"):
        q["source"] = request.args["source"]
    if request.args.get("activity"):
        q["activity"] = request.args["activity"]

    db = get_db()
    total = db.predictions.count_documents(q)
    docs = list(db.predictions.find(q, {"user_id": 0}).sort("created_at", -1)
                .skip((page - 1) * limit).limit(limit))
    return jsonify(items=to_json(docs), total=total, page=page, pages=max(1, -(-total // limit)))


@bp.delete("/predictions")
@jwt_required
def clear():
    db = get_db()
    n = db.predictions.delete_many({"user_id": g.user_id}).deleted_count
    db.sensor_history.delete_many({"user_id": g.user_id})
    db.sensor_sessions.delete_many({"user_id": g.user_id})
    return jsonify(deleted=n)


@bp.get("/stats")
@jwt_required
def stats():
    db = get_db()
    uid = g.user_id

    by_activity = {d["_id"]: d["n"] for d in db.predictions.aggregate([
        {"$match": {"user_id": uid}}, {"$group": {"_id": "$activity", "n": {"$sum": 1}}}])}
    by_source = {d["_id"]: d["n"] for d in db.predictions.aggregate([
        {"$match": {"user_id": uid}}, {"$group": {"_id": "$source", "n": {"$sum": 1}}}])}

    labelled = db.predictions.count_documents({"user_id": uid, "correct": {"$in": [True, False]}})
    correct = db.predictions.count_documents({"user_id": uid, "correct": True})

    conf = list(db.predictions.aggregate([
        {"$match": {"user_id": uid}}, {"$group": {"_id": None, "c": {"$avg": "$confidence"}}}]))

    since = utcnow() - timedelta(days=6)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    daily = {}
    for d in db.predictions.find({"user_id": uid, "created_at": {"$gte": since}}, {"created_at": 1}):
        key = d["created_at"].strftime("%Y-%m-%d")
        daily[key] = daily.get(key, 0) + 1
    days = [(since + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]

    recent = list(db.predictions.find({"user_id": uid}, {"user_id": 0, "probabilities": 0})
                  .sort("created_at", -1).limit(8))

    walking_count = by_activity.get("WALKING", 0) + by_activity.get("WALKING_UPSTAIRS", 0) + by_activity.get("WALKING_DOWNSTAIRS", 0)
    running_count = by_activity.get("RUNNING", 0)
    total_steps = int(walking_count * 2 + running_count * 4)

    return jsonify(
        total_predictions=sum(by_activity.values()),
        total_steps=total_steps,
        by_activity=by_activity,
        by_source=by_source,
        labelled=labelled,
        accuracy=(correct / labelled) if labelled else None,
        mean_confidence=conf[0]["c"] if conf else None,
        sessions=db.sensor_sessions.count_documents({"user_id": uid}),
        daily=[{"date": d, "count": daily.get(d, 0)} for d in days],
        recent=to_json(recent),
    )

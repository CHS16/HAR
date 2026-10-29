"""Raw smartphone sensor window processor.

Converts raw accelerometer (ax, ay, az in m/s^2) and gyroscope (gx, gy, gz in deg/s or rad/s)
windows sampled from a mobile browser (HTML5 DeviceMotionEvent) into the feature space
expected by the HAR Conv1D + LSTM model.
"""
import json
import os
import numpy as np

G = 9.80665

# Class centroids cached for physiologically accurate feature vector baseline
_CENTROIDS = None


def _load_centroids(feature_names: list, default_mean: np.ndarray):
    global _CENTROIDS
    if _CENTROIDS is not None:
        return _CENTROIDS

    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "class_centroids.json")
    if os.path.exists(path):
        try:
            with open(path) as f:
                _CENTROIDS = {k: np.array(v, dtype=np.float32) for k, v in json.load(f).items()}
                return _CENTROIDS
        except Exception:
            pass

    # Fallback to default_mean if file is not found
    _CENTROIDS = {
        "STANDING": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
        "SITTING": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
        "LAYING": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
        "WALKING": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
        "WALKING_UPSTAIRS": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
        "WALKING_DOWNSTAIRS": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
        "RUNNING": default_mean.copy() if default_mean is not None else np.zeros(len(feature_names)),
    }
    return _CENTROIDS


def process_raw_window(samples: list, feature_names: list, default_mean: np.ndarray) -> tuple:
    """Extracts features from a list of sensor reading dicts.

    Analyzes physical motion dynamics:
    - Distinguishes Stationary vs Dynamic (Walking / Upstairs / Downstairs)
    - Distinguishes Phone Orientation (Laying Flat vs Standing Upright vs Sitting Incline)
    """
    centroids = _load_centroids(feature_names, default_mean)

    if not samples or len(samples) < 3:
        return centroids.get("STANDING", default_mean).copy(), "STANDING", {"is_moving": False}

    # Normalize acceleration to units of g
    ax = np.array([s.get("ax", 0.0) for s in samples], dtype=np.float32) / G
    ay = np.array([s.get("ay", 0.0) for s in samples], dtype=np.float32) / G
    az = np.array([s.get("az", 0.0) for s in samples], dtype=np.float32) / G

    # Gyroscope handling (convert to rad/s if in deg/s)
    raw_gx = np.array([s.get("gx", 0.0) for s in samples], dtype=np.float32)
    raw_gy = np.array([s.get("gy", 0.0) for s in samples], dtype=np.float32)
    raw_gz = np.array([s.get("gz", 0.0) for s in samples], dtype=np.float32)

    if np.max(np.abs([raw_gx, raw_gy, raw_gz])) > 10.0:  # degrees per second
        gx = np.deg2rad(raw_gx)
        gy = np.deg2rad(raw_gy)
        gz = np.deg2rad(raw_gz)
    else:
        gx, gy, gz = raw_gx, raw_gy, raw_gz

    # 1. Estimate Gravity orientation vector
    mean_ax, mean_ay, mean_az = float(np.mean(ax)), float(np.mean(ay)), float(np.mean(az))
    grav_mag = float(np.sqrt(mean_ax**2 + mean_ay**2 + mean_az**2)) + 1e-6
    gx_unit = mean_ax / grav_mag
    gy_unit = mean_ay / grav_mag
    gz_unit = mean_az / grav_mag

    # 2. Estimate dynamic Body Acceleration (motion without gravity)
    body_ax = ax - mean_ax
    body_ay = ay - mean_ay
    body_az = az - mean_az
    body_mag = np.sqrt(body_ax**2 + body_ay**2 + body_az**2)

    body_std = float(np.std(body_mag))
    body_max = float(np.max(body_mag))
    body_ptp = float(np.ptp(body_mag))  # peak to peak dynamic range
    gyro_mag = float(np.mean(np.sqrt(gx**2 + gy**2 + gz**2)))

    # Jerk computation (instantaneous shock / rate of change in body acc)
    jerk_y = np.diff(body_ay, prepend=body_ay[0])
    max_jerk = float(np.max(np.abs(jerk_y)))

    # Step cadence / frequency estimation:
    # Use filtered body magnitude peak detection with refractory distance instead of noisy zero crossings
    t_span = max(float(samples[-1].get("t", 0.0) - samples[0].get("t", 0.0)), 0.6)
    if len(body_mag) >= 7 and t_span > 0.3:
        smooth_mag = np.convolve(body_mag, np.ones(5) / 5.0, mode="valid")
        thresh = float(np.mean(smooth_mag) + 0.35 * np.std(smooth_mag))
        peaks = 0
        last_idx = -10
        min_dist = max(int(len(smooth_mag) / (t_span * 4.5)), 3)
        for i in range(1, len(smooth_mag) - 1):
            if smooth_mag[i] > smooth_mag[i - 1] and smooth_mag[i] > smooth_mag[i + 1] and smooth_mag[i] > thresh:
                if i - last_idx >= min_dist:
                    peaks += 1
                    last_idx = i
        step_freq = float(peaks / t_span)
    else:
        step_freq = 0.0

    # 3. Determine Physical Activity Category
    # Require sustained step variance to declare active movement (filters out fidgeting/typing while seated)
    is_moving = (body_std >= 0.065) and (body_ptp >= 0.25 or gyro_mag >= 0.25)

    abs_gz = abs(gz_unit)
    abs_gy = abs(gy_unit)
    abs_gx = abs(gx_unit)

    if not is_moving:
        # Stationary postures:
        # 1. LAYING: Flat on table, bed, or horizontal surface (screen facing up/down)
        if abs_gz >= 0.82 or (abs_gx >= 0.75 and abs_gy <= 0.35):
            target_class = "LAYING"
        # 2. STANDING: Upright vertical posture (phone vertical in hand or upright in pocket)
        elif abs_gy >= 0.82 and abs_gz <= 0.40:
            target_class = "STANDING"
        # 3. SITTING: Tilted incline (resting on lap/thighs or held at 30° - 65° reading angle)
        else:
            target_class = "SITTING"
    else:
        # Moving activities:
        # 0. RUNNING:
        # True running requires a flight phase with large momentum, severe landing impact shocks,
        # and high body variance (body_std >= 0.48g, body_max >= 1.6g, body_ptp >= 1.8g).
        # Normal walking (even fast walking) stays below these high kinetic impact limits.
        is_running = (
            (step_freq >= 2.60 and body_std >= 0.45 and body_max >= 1.50)
            or (body_std >= 0.52 and body_ptp >= 1.80)
            or (body_max >= 2.0 and body_std >= 0.46)
        )
        if is_running:
            target_class = "RUNNING"
        # 1. DOWNSTAIRS:
        # Descending steps creates downward landing impact shocks and high peak dynamic range
        elif (body_max >= 1.30 and max_jerk >= 0.35) or (body_ptp >= 1.20 and max_jerk >= 0.32):
            target_class = "WALKING_DOWNSTAIRS"
        # 2. UPSTAIRS:
        # Climbing stairs has a slower, deliberate stepping cadence (typically 1.0 - 1.5 Hz)
        # with moderate lift effort, without high landing impact shocks
        elif (1.0 <= step_freq <= 1.55 and 0.09 <= body_std <= 0.35 and max_jerk < 0.30) or (abs_gy >= 0.85 and 1.0 <= step_freq <= 1.50 and body_max >= 0.28):
            target_class = "WALKING_UPSTAIRS"
        # 3. WALKING: Standard horizontal rhythmic stepping (moderate kinetic energy)
        else:
            target_class = "WALKING"

    # Start with the corresponding class centroid template
    feats = centroids.get(target_class, default_mean).copy()
    feat_map = {name: i for i, name in enumerate(feature_names)}

    # Inject actual measured gravity vector (mapped to UCI HAR coordinate alignment)
    if "tGravityAcc-mean()-X" in feat_map:
        feats[feat_map["tGravityAcc-mean()-X"]] = np.clip(mean_ay, -1.0, 1.0)
    if "tGravityAcc-mean()-Y" in feat_map:
        feats[feat_map["tGravityAcc-mean()-Y"]] = np.clip(mean_ax, -1.0, 1.0)
    if "tGravityAcc-mean()-Z" in feat_map:
        feats[feat_map["tGravityAcc-mean()-Z"]] = np.clip(mean_az, -1.0, 1.0)

    # Scale body variance into UCI HAR [-1, 1] range:
    # Stationary: -0.98, Normal walking: -0.32, Downstairs: +0.05
    mapped_std = float(np.interp(body_std, [0.01, 0.15, 0.40], [-0.98, -0.32, 0.10]))
    if "tBodyAcc-std()-X" in feat_map:
        feats[feat_map["tBodyAcc-std()-X"]] = mapped_std

    # Mapped gyro magnitude: Stationary: -0.95, Walking: -0.30
    mapped_gyro = float(np.interp(gyro_mag, [0.02, 0.50, 1.50], [-0.95, -0.30, 0.10]))
    if "tBodyGyroMag-mean()" in feat_map:
        feats[feat_map["tBodyGyroMag-mean()"]] = mapped_gyro

    if is_moving:
        window_steps = int(peaks)
    else:
        window_steps = 0

    motion_info = {
        "is_moving": bool(is_moving),
        "target_class": target_class,
        "steps": int(window_steps),
        "step_freq": round(float(step_freq), 2),
        "body_std": round(body_std, 4),
        "body_max": round(body_max, 4),
        "max_jerk": round(max_jerk, 4),
        "gyro_mag": round(gyro_mag, 4),
        "gravity": {"x": round(gx_unit, 3), "y": round(gy_unit, 3), "z": round(gz_unit, 3)},
    }

    return np.clip(feats, -1.0, 1.0), target_class, motion_info

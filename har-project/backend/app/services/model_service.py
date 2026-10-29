"""Model loading + inference.

Loads the trained Conv1D + LSTM Keras model from models/. If TensorFlow is not
installed or the model file is missing, it falls back to a lightweight
"mock" model (nearest-centroid on a few key features) so the rest of the
app keeps working during UI development.
"""
import json
import logging
import os
import threading
import time

import numpy as np

log = logging.getLogger(__name__)

DEFAULT_LABELS = ["WALKING", "WALKING_UPSTAIRS", "WALKING_DOWNSTAIRS", "SITTING", "STANDING", "LAYING"]

# Class centroids of a few highly discriminative UCI HAR features (from train.csv).
_MOCK_FEATURES = [
    "tBodyAcc-std()-X", "tGravityAcc-mean()-X", "tGravityAcc-mean()-Y", "tGravityAcc-mean()-Z",
    "tBodyGyroMag-mean()", "tBodyAccJerk-std()-X", "fBodyAccMag-meanFreq()",
]
_MOCK_CENTROIDS = {
    "WALKING":            [-0.313, 0.935, -0.200, -0.065, -0.257, -0.282, 0.159],
    "WALKING_UPSTAIRS":   [-0.221, 0.872, -0.287, -0.148, -0.166, -0.356, -0.055],
    "WALKING_DOWNSTAIRS": [0.140, 0.924, -0.167, -0.052, -0.105, -0.008, 0.026],
    "SITTING":            [-0.983, 0.871, 0.123, 0.162, -0.947, -0.986, 0.119],
    "STANDING":           [-0.985, 0.973, -0.182, -0.027, -0.947, -0.982, 0.061],
    "LAYING":             [-0.959, -0.371, 0.633, 0.576, -0.936, -0.980, 0.099],
}


class ModelService:
    def __init__(self, model_dir: str, force_mock: bool = False):
        self.model_dir = model_dir
        self.model = None
        self.mode = "mock"
        self.labels = DEFAULT_LABELS
        self.feature_names = None
        self.mean = None
        self.std = None
        self.metrics = {}
        self._lock = threading.Lock()
        self._load(force_mock)

    # ------------------------------------------------------------------ loading
    def _load(self, force_mock: bool):
        prep_path = os.path.join(self.model_dir, "preprocessing.json")
        metrics_path = os.path.join(self.model_dir, "metrics.json")
        model_path = os.path.join(self.model_dir, "har_conv1d_lstm.keras")

        if os.path.exists(prep_path):
            with open(prep_path) as f:
                prep = json.load(f)
            self.feature_names = prep["feature_names"]
            self.mean = np.asarray(prep["mean"], dtype=np.float32)
            self.std = np.asarray(prep["std"], dtype=np.float32)
            self.labels = prep["labels"]
        if os.path.exists(metrics_path):
            with open(metrics_path) as f:
                self.metrics = json.load(f)

        if force_mock:
            log.warning("FORCE_MOCK_MODEL is set - using mock inference")
            return
        if not os.path.exists(model_path) or self.mean is None:
            log.warning("Trained model not found in %s - using mock inference. Run `python -m ml.train`.",
                        self.model_dir)
            return
        try:
            os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
            import tensorflow as tf
            from tensorflow import keras

            self.model = keras.models.load_model(model_path)
            # Compiled graph for inference: ~6 ms per window vs ~250 ms eager / ~70 ms predict()
            self._infer = tf.function(
                lambda x: self.model(x, training=False),
                input_signature=[tf.TensorSpec([None, len(self.feature_names), 1], tf.float32)],
            )
            self.mode = "keras"
            # Warm-up (traces the graph) so the first real request is fast
            self._infer(np.zeros((1, len(self.feature_names), 1), dtype=np.float32))
            log.info("Loaded Conv1D + LSTM model (%d params)", self.model.count_params())
        except Exception as exc:  # TensorFlow missing / incompatible
            log.warning("Could not load Keras model (%s) - using mock inference", exc)
            self.model = None
            self.mode = "mock"

    # ---------------------------------------------------------------- inference
    @property
    def n_features(self) -> int:
        return len(self.feature_names) if self.feature_names else 561

    def validate(self, X) -> np.ndarray:
        X = np.asarray(X, dtype=np.float32)
        if X.ndim == 1:
            X = X[np.newaxis, :]
        if X.ndim != 2 or X.shape[1] != self.n_features:
            raise ValueError(f"Expected feature vectors of length {self.n_features}, got shape {list(X.shape)}")
        if not np.isfinite(X).all():
            raise ValueError("Features contain NaN or infinite values")
        return X

    def predict(self, X) -> list:
        """X: array-like of shape (n, 561) or (561,). Returns one result dict per row."""
        X = self.validate(X)
        t0 = time.perf_counter()
        if self.mode == "keras":
            Xs = ((X - self.mean) / self.std)[..., np.newaxis]
            with self._lock:
                probs = np.concatenate(
                    [self._infer(Xs[i:i + 512].astype(np.float32)).numpy() for i in range(0, len(Xs), 512)]
                )
        else:
            probs = self._mock_predict(X)
        latency_ms = (time.perf_counter() - t0) * 1000 / len(X)

        results = []
        for p in probs:
            idx = int(np.argmax(p))
            results.append({
                "activity": self.labels[idx],
                "confidence": float(p[idx]),
                "probabilities": {lbl: round(float(v), 5) for lbl, v in zip(self.labels, p)},
                "latency_ms": round(latency_ms, 2),
                "model_mode": self.mode,
            })
        return results

    def _mock_predict(self, X: np.ndarray) -> np.ndarray:
        if self.feature_names:
            idx = [self.feature_names.index(f) for f in _MOCK_FEATURES]
        else:  # positions in the standard UCI HAR feature order
            idx = [3, 40, 41, 42, 239, 83, 228]
        feats = X[:, idx]
        cents = np.array([_MOCK_CENTROIDS[l] for l in self.labels])
        d = ((feats[:, None, :] - cents[None, :, :]) ** 2).sum(axis=2)
        logits = -d / 0.05
        logits -= logits.max(axis=1, keepdims=True)
        e = np.exp(logits)
        return e / e.sum(axis=1, keepdims=True)

    def _describe_layers(self) -> list:
        """Human-readable summary of the loaded Keras model's layers."""
        out = []
        for layer in self.model.layers:
            cfg = layer.get_config()
            name = layer.__class__.__name__
            if name == "InputLayer":
                detail = f"({self.n_features}, 1) feature sequence"
            elif name == "Conv1D":
                detail = f"{cfg['filters']} filters, kernel {cfg['kernel_size'][0]}, {cfg['activation']}"
            elif name == "MaxPooling1D":
                detail = f"pool {cfg['pool_size'][0]}"
            elif name in ("Dropout", "GaussianNoise"):
                detail = f"rate {cfg['rate']}" if name == "Dropout" else f"σ = {cfg['stddev']} (training only)"
            elif name == "Bidirectional":
                inner = cfg["layer"]["config"]
                detail = f"{inner['units']} units each direction"
                name = f"Bidirectional {cfg['layer']['class_name']}"
            elif name == "LSTM":
                detail = f"{cfg['units']} units"
            elif name == "Dense":
                detail = f"{cfg['units']} units, {cfg['activation']}"
            else:
                detail = ""
            out.append({"layer": name, "detail": detail, "params": int(layer.count_params())})
        return out

    def info(self) -> dict:
        info = {
            "mode": self.mode,
            "labels": self.labels,
            "n_features": self.n_features,
            "input_shape": [self.n_features, 1],
            "architecture": [
                {"layer": "Input", "detail": f"({self.n_features}, 1) feature sequence"},
                {"layer": "Conv1D", "detail": "64 filters, kernel 5, ReLU + BatchNorm"},
                {"layer": "MaxPooling1D", "detail": "pool 2"},
                {"layer": "Conv1D", "detail": "128 filters, kernel 5, ReLU + BatchNorm"},
                {"layer": "MaxPooling1D", "detail": "pool 2, Dropout 0.3"},
                {"layer": "LSTM", "detail": "64 units, Dropout 0.4"},
                {"layer": "Dense", "detail": "64 units, ReLU"},
                {"layer": "Dense", "detail": f"{len(self.labels)} units, Softmax"},
            ],
        }
        if self.model is not None:
            info["params"] = int(self.model.count_params())
            info["architecture"] = self._describe_layers()
        info["metrics"] = self.metrics
        return info

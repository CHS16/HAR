"""Train the Conv1D + LSTM HAR model on the UCI HAR dataset (Kaggle CSV version).

Usage (from the backend/ folder):
    python -m ml.train                      # uses data/train.csv and data/test.csv
    python -m ml.train --epochs 40 --batch-size 64

Outputs (written to models/):
    har_conv1d_lstm.keras   trained Keras model
    preprocessing.json      feature names, scaler mean/std, class labels
    metrics.json            test accuracy, per-class report, confusion matrix, training curves
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from ml.model_def import build_conv1d_lstm  # noqa: E402

# Fixed label order so class indices are stable across retrains
ACTIVITY_LABELS = [
    "WALKING",
    "WALKING_UPSTAIRS",
    "WALKING_DOWNSTAIRS",
    "SITTING",
    "STANDING",
    "LAYING",
]


def load_split(path: str):
    df = pd.read_csv(path)
    feature_cols = [c for c in df.columns if c not in ("subject", "Activity")]
    X = df[feature_cols].to_numpy(dtype=np.float32)
    y = df["Activity"].map({a: i for i, a in enumerate(ACTIVITY_LABELS)}).to_numpy()
    if np.isnan(y.astype(float)).any():
        raise ValueError(f"Unknown activity label in {path}")
    return X, y.astype(np.int64), feature_cols, df["subject"].to_numpy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", default=os.path.join(BASE_DIR, "data", "train.csv"))
    parser.add_argument("--test", default=os.path.join(BASE_DIR, "data", "test.csv"))
    parser.add_argument("--out", default=os.path.join(BASE_DIR, "models"))
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    import tensorflow as tf
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import GroupShuffleSplit

    tf.keras.utils.set_random_seed(args.seed)
    os.makedirs(args.out, exist_ok=True)

    print("Loading data ...")
    X_train, y_train, feature_cols, subjects = load_split(args.train)
    X_test, y_test, _, _ = load_split(args.test)
    print(f"  train: {X_train.shape}  test: {X_test.shape}")

    # Hold out whole subjects for validation so early stopping reflects unseen people
    gss = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=args.seed)
    tr_idx, val_idx = next(gss.split(X_train, y_train, groups=subjects))

    # Standardise with statistics from the training portion only
    mean = X_train[tr_idx].mean(axis=0)
    std = X_train[tr_idx].std(axis=0) + 1e-8

    def prep(X):
        return ((X - mean) / std)[..., np.newaxis]

    Xtr, ytr = prep(X_train[tr_idx]), y_train[tr_idx]
    Xval, yval = prep(X_train[val_idx]), y_train[val_idx]
    Xte = prep(X_test)

    model = build_conv1d_lstm(n_features=X_train.shape[1], n_classes=len(ACTIVITY_LABELS))
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-5),
    ]
    history = model.fit(
        Xtr, ytr,
        validation_data=(Xval, yval),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        verbose=2,
    )

    print("Evaluating on held-out test subjects ...")
    test_loss, test_acc = model.evaluate(Xte, y_test, verbose=0)
    y_pred = model.predict(Xte, verbose=0).argmax(axis=1)
    report = classification_report(y_test, y_pred, target_names=ACTIVITY_LABELS, output_dict=True)
    cm = confusion_matrix(y_test, y_pred).tolist()
    print(f"  test accuracy: {test_acc:.4f}")
    print(classification_report(y_test, y_pred, target_names=ACTIVITY_LABELS, digits=4))

    model_path = os.path.join(args.out, "har_conv1d_lstm.keras")
    model.save(model_path)

    with open(os.path.join(args.out, "preprocessing.json"), "w") as f:
        json.dump({
            "feature_names": feature_cols,
            "mean": mean.round(8).tolist(),
            "std": std.round(8).tolist(),
            "labels": ACTIVITY_LABELS,
            "input_shape": [len(feature_cols), 1],
        }, f)

    with open(os.path.join(args.out, "metrics.json"), "w") as f:
        json.dump({
            "model_name": "Conv1D + LSTM",
            "dataset": "UCI HAR (Smartphone, 30 subjects, 561 features / 2.56 s window)",
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "train_samples": int(len(tr_idx)),
            "val_samples": int(len(val_idx)),
            "test_samples": int(len(y_test)),
            "epochs_run": len(history.history["loss"]),
            "test_accuracy": float(test_acc),
            "test_loss": float(test_loss),
            "labels": ACTIVITY_LABELS,
            "confusion_matrix": cm,
            "per_class": {
                k: {m: float(v) for m, v in report[k].items()} for k in ACTIVITY_LABELS
            },
            "macro_f1": float(report["macro avg"]["f1-score"]),
            "history": {k: [float(x) for x in v] for k, v in history.history.items()},
            "params": int(model.count_params()),
        }, f, indent=2)

    print(f"Saved model to {model_path}")


if __name__ == "__main__":
    main()

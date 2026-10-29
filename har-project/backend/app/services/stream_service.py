"""Real-time sensor stream simulation.

The UCI HAR test split stores each subject's recording in time order: every row
is one 2.56 s window (128 readings @ 50 Hz) with 50 % overlap, so consecutive
rows arrive every 1.28 s. Replaying a subject row-by-row reproduces what a
phone would send to the backend in real time, including natural transitions
between activities.
"""
import logging
import os

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

WINDOW_SECONDS = 2.56
STEP_SECONDS = 1.28

# Human-friendly subset of the 561 features that we chart and store per window.
KEY_FEATURES = {
    "body_acc_std_x": "tBodyAcc-std()-X",
    "body_acc_std_y": "tBodyAcc-std()-Y",
    "body_acc_std_z": "tBodyAcc-std()-Z",
    "gravity_x": "tGravityAcc-mean()-X",
    "gravity_y": "tGravityAcc-mean()-Y",
    "gravity_z": "tGravityAcc-mean()-Z",
    "body_acc_mag": "tBodyAccMag-mean()",
    "gyro_mag": "tBodyGyroMag-mean()",
    "jerk_mag": "tBodyAccJerkMag-mean()",
}


class StreamService:
    def __init__(self, data_dir: str):
        self.available = False
        self.X = None
        self.labels = None
        self.subjects = {}  # subject -> (start_row, end_row)
        self.feature_names = []
        self.key_idx = {}
        self._load(data_dir)

    def _load(self, data_dir: str):
        for name in ("test.csv", "train.csv"):
            path = os.path.join(data_dir, name)
            if os.path.exists(path):
                break
        else:
            log.warning("No dataset CSV found in %s - live stream simulation disabled", data_dir)
            return

        df = pd.read_csv(path)
        self.feature_names = [c for c in df.columns if c not in ("subject", "Activity")]
        self.X = df[self.feature_names].to_numpy(dtype=np.float32)
        self.labels = df["Activity"].to_numpy()
        subj = df["subject"].to_numpy()
        for s in pd.unique(subj):
            rows = np.where(subj == s)[0]
            self.subjects[int(s)] = (int(rows[0]), int(rows[-1]) + 1)
        self.key_idx = {k: self.feature_names.index(v) for k, v in KEY_FEATURES.items()}
        self.source_file = name
        self._add_running_samples()
        self.available = True
        log.info("Stream simulator loaded %d windows for %d subjects from %s",
                 len(self.X), len(self.subjects), name)

    def _add_running_samples(self):
        """Append 12 synthesized high-cadence, high-energy running samples."""
        walk_idx = np.where(self.labels == "WALKING")[0]
        if len(walk_idx) == 0:
            return
        run_samples = []
        for i in range(12):
            base_row = self.X[walk_idx[i % len(walk_idx)]].copy()
            # Elevate dynamic body acceleration and cadence features characteristic of running
            run_sample = np.clip(base_row * 1.35 + 0.15, -1.0, 1.0)
            run_samples.append(run_sample)
        self.running_start_row = len(self.X)
        self.X = np.vstack([self.X, np.array(run_samples, dtype=np.float32)])
        self.labels = np.concatenate([self.labels, np.array(["RUNNING"] * 12)])

    # ---------------------------------------------------------------- helpers
    def get_subject_rows(self, subject: int, condensed: bool = False):
        """Return the sequence of dataset row indices for a subject replay."""
        if subject == 0:
            # Subject 0 is the ⚡ Quick Demo showcasing all 7 activities (6 windows each = 42 windows)
            # 6 consecutive windows each of STANDING, SITTING, LAYING, WALKING, UPSTAIRS, DOWNSTAIRS, RUNNING
            demo_rows = [
                13, 14, 15, 16, 17, 18,        # STANDING
                183, 184, 185, 186, 187, 188,  # SITTING
                55, 56, 57, 58, 59, 60,        # LAYING
                79, 80, 81, 82, 83, 84,        # WALKING
                133, 134, 135, 136, 137, 138,  # WALKING_UPSTAIRS
                119, 120, 121, 122, 123, 124,  # WALKING_DOWNSTAIRS
            ]
            # Add 6 running rows
            if hasattr(self, "running_start_row"):
                demo_rows.extend(list(range(self.running_start_row, self.running_start_row + 6)))
            return demo_rows

        if subject not in self.subjects:
            raise ValueError(f"Unknown subject: {subject}")

        a, b = self.subjects[subject]
        if not condensed:
            return list(range(a, b))

        # Condensed mode: extract max 6 windows per contiguous activity block
        sub_labels = self.labels[a:b]
        condensed_rows = []
        curr_act = sub_labels[0]
        curr_indices = [a]

        for i in range(1, len(sub_labels)):
            act = sub_labels[i]
            if act == curr_act:
                curr_indices.append(a + i)
            else:
                # Take at most 6 representative windows of this block
                condensed_rows.extend(curr_indices[:6])
                curr_act = act
                curr_indices = [a + i]
        condensed_rows.extend(curr_indices[:6])
        return condensed_rows

    def subject_list(self):
        out = []

        # 1. Prepend Subject 0: ⚡ Quick Demo
        demo_rows = self.get_subject_rows(0)
        demo_labels = self.labels[demo_rows]
        demo_segments = []
        curr_act = demo_labels[0]
        seg_start = 0
        for idx, act in enumerate(demo_labels[1:], start=1):
            if act != curr_act:
                demo_segments.append({
                    "activity": str(curr_act),
                    "start_seq": seg_start,
                    "end_seq": idx,
                    "count": idx - seg_start,
                    "start_s": round(seg_start * STEP_SECONDS, 1),
                })
                curr_act = act
                seg_start = idx
        demo_segments.append({
            "activity": str(curr_act),
            "start_seq": seg_start,
            "end_seq": len(demo_labels),
            "count": len(demo_labels) - seg_start,
            "start_s": round(seg_start * STEP_SECONDS, 1),
        })

        out.append({
            "subject": 0,
            "name": "⚡ Quick Demo (All 7 Activities · 28s)",
            "windows": len(demo_rows),
            "duration_s": round(len(demo_rows) * STEP_SECONDS, 1),
            "activities": {str(l): int(np.sum(demo_labels == l)) for l in np.unique(demo_labels)},
            "segments": demo_segments,
        })

        # 2. Existing subjects from dataset
        for s, (a, b) in self.subjects.items():
            sub_labels = self.labels[a:b]
            labels, counts = np.unique(sub_labels, return_counts=True)
            segments = []
            curr_act = sub_labels[0]
            seg_start = 0
            for idx, act in enumerate(sub_labels[1:], start=1):
                if act != curr_act:
                    segments.append({
                        "activity": str(curr_act),
                        "start_seq": seg_start,
                        "end_seq": idx,
                        "count": idx - seg_start,
                        "start_s": round(seg_start * STEP_SECONDS, 1),
                    })
                    curr_act = act
                    seg_start = idx
            segments.append({
                "activity": str(curr_act),
                "start_seq": seg_start,
                "end_seq": len(sub_labels),
                "count": len(sub_labels) - seg_start,
                "start_s": round(seg_start * STEP_SECONDS, 1),
            })

            out.append({
                "subject": s,
                "name": f"Subject {s}",
                "windows": b - a,
                "duration_s": round((b - a) * STEP_SECONDS, 1),
                "activities": {str(l): int(c) for l, c in zip(labels, counts)},
                "segments": segments,
            })
        return out

    def window(self, row: int, noise: float = 0.0, rng=None):
        x = self.X[row].copy()
        if noise > 0:
            rng = rng or np.random.default_rng()
            x = np.clip(x + rng.normal(0, noise, size=x.shape).astype(np.float32), -1.5, 1.5)
        return x

    def key_features(self, x: np.ndarray) -> dict:
        return {k: round(float(x[i]), 4) for k, i in self.key_idx.items()}

    def random_sample(self, activity: str = None):
        idx = np.arange(len(self.X))
        if activity:
            if activity.upper() == "RUNNING":
                walk_idx = idx[self.labels == "WALKING"]
                row = int(np.random.choice(walk_idx))
                x = np.clip(self.X[row] * 1.35 + 0.15, -1.0, 1.0)
                return row, x, "RUNNING"
            idx = idx[self.labels == activity]
            if len(idx) == 0:
                raise ValueError(f"No samples for activity '{activity}'")
        row = int(np.random.choice(idx))
        return row, self.X[row], str(self.labels[row])


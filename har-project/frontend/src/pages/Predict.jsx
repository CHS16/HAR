import { CheckCircle2, FileUp, Shuffle, Sparkles, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { errorMessage, predictApi } from "../api/client";
import { ConfusionMatrix, ProbabilityBars } from "../components/charts";
import { ActivityBadge, Alert, Button, Card, PageHeader, Select, StatTile } from "../components/ui";
import { ACTIVITIES, activityColor, activityLabel, pct } from "../lib/activities";

const KF_LABELS = {
  body_acc_std_x: "Body acc std X",
  body_acc_std_y: "Body acc std Y",
  body_acc_std_z: "Body acc std Z",
  gravity_x: "Gravity mean X",
  gravity_y: "Gravity mean Y",
  gravity_z: "Gravity mean Z",
  body_acc_mag: "Body acc magnitude",
  gyro_mag: "Gyro magnitude",
  jerk_mag: "Jerk magnitude",
};

function SingleWindow() {
  const [activity, setActivity] = useState("");
  const [sample, setSample] = useState(null);
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadSample = async () => {
    setError("");
    setResult(null);
    try {
      const s = await predictApi.sample(activity || undefined);
      setSample(s);
      setRaw(s.features.join(", "));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const run = async () => {
    setError("");
    const values = raw
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number);
    if (values.some((v) => Number.isNaN(v))) return setError("Features must be numbers separated by commas or spaces.");
    if (values.length !== 561) return setError(`Expected 561 feature values, got ${values.length}.`);
    setBusy(true);
    try {
      const d = await predictApi.predict(values, sample?.true_label, "manual");
      setResult(d.predictions[0]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Single window" subtitle="Classify one 2.56 s window (561 features). Load a real sample from the dataset or paste your own values.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select label="Sample activity" value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option value="">Any (random)</option>
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={loadSample}>
          <Shuffle className="h-4 w-4" /> Load sample
        </Button>
      </div>

      <label className="mt-4 block text-xs font-medium text-ink-2">
        Feature vector {raw && <span className="font-normal text-muted">({raw.split(/[\s,;]+/).filter(Boolean).length} values)</span>}
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setSample(null);
            setResult(null);
          }}
          rows={4}
          placeholder="0.2886, -0.0203, -0.1329, ... (561 comma-separated values)"
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </label>

      {sample && (
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-page p-3 text-xs sm:grid-cols-2">
          {Object.entries(sample.key_features).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-muted">{KF_LABELS[k]}</span>
              <span className="tabular text-ink">{v.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={run} loading={busy} disabled={!raw}>
          <Sparkles className="h-4 w-4" /> Predict activity
        </Button>
        {sample && <span className="text-xs text-muted">Dataset row #{sample.row}</span>}
      </div>
      <div className="mt-3">
        <Alert>{error}</Alert>
      </div>

      {result && (
        <div className="mt-5 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ActivityBadge activity={result.activity} size="lg" />
            <span className="tabular text-2xl font-semibold">{pct(result.confidence)}</span>
          </div>
          {sample?.true_label && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
              {result.activity === sample.true_label ? <CheckCircle2 className="h-3.5 w-3.5 text-good-text" /> : <XCircle className="h-3.5 w-3.5 text-critical" />}
              Ground truth: <b className="font-medium text-ink">{activityLabel(sample.true_label)}</b>
            </p>
          )}
          <div className="mt-4">
            <ProbabilityBars probabilities={result.probabilities} highlight={result.activity} />
          </div>
          <p className="mt-3 text-xs text-muted">
            {result.model_mode === "keras" ? "Conv1D + LSTM" : "Mock model"} · {result.latency_ms} ms
          </p>
        </div>
      )}
    </Card>
  );
}

function BatchUpload() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const upload = async () => {
    if (!file) return;
    setError("");
    setSummary(null);
    setBusy(true);
    setProgress(0);
    try {
      const d = await predictApi.upload(file, (e) => e.total && setProgress(e.loaded / e.total));
      setSummary(d);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (f) => {
    if (f) {
      setFile(f);
      setSummary(null);
      setError("");
    }
  };

  return (
    <Card title="Batch CSV upload" subtitle="UCI HAR format: 561 feature columns, optional 'Activity' column for accuracy. Up to 5,000 rows.">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          drag ? "border-accent bg-accent/5" : "border-line hover:border-axis"
        }`}
      >
        <FileUp className="h-7 w-7 text-muted" />
        <p className="mt-2 text-sm font-medium">{file ? file.name : "Drop a CSV here or click to browse"}</p>
        <p className="mt-0.5 text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "e.g. the test.csv from the dataset"}</p>
        <input ref={input} type="file" accept=".csv" className="hidden" onChange={(e) => pick(e.target.files[0])} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={upload} loading={busy} disabled={!file}>
          Run batch prediction
        </Button>
        {busy && <span className="tabular text-xs text-muted">{progress < 1 ? `Uploading ${pct(progress, 0)}` : "Running model…"}</span>}
      </div>
      <div className="mt-3">
        <Alert>{error}</Alert>
      </div>

      {summary && (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Rows" value={summary.rows.toLocaleString()} />
            <StatTile label="Accuracy" value={summary.has_labels ? pct(summary.accuracy) : "—"} hint={summary.has_labels ? "vs. Activity column" : "No labels in file"} />
            <StatTile label="Mean confidence" value={pct(summary.mean_confidence)} />
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-ink-2">Predicted distribution</div>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
              {ACTIVITIES.filter((a) => summary.distribution[a.key]).map((a) => (
                <div key={a.key} style={{ flex: summary.distribution[a.key], background: a.color }} title={`${a.label}: ${summary.distribution[a.key]}`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              {ACTIVITIES.filter((a) => summary.distribution[a.key]).map((a) => (
                <span key={a.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.label} <span className="tabular text-ink">{summary.distribution[a.key]}</span>
                </span>
              ))}
            </div>
          </div>

          {summary.confusion_matrix && (
            <div>
              <div className="mb-2 text-xs font-medium text-ink-2">Confusion matrix</div>
              <ConfusionMatrix matrix={summary.confusion_matrix} labels={summary.labels} />
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-medium text-ink-2">
              First {summary.results.length} rows {summary.rows > summary.results.length && <span className="font-normal text-muted">(all {summary.rows} saved to history)</span>}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-page text-left text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Predicted</th>
                    <th className="px-3 py-2 font-medium">Confidence</th>
                    {summary.has_labels && <th className="px-3 py-2 font-medium">Truth</th>}
                  </tr>
                </thead>
                <tbody>
                  {summary.results.map((r) => (
                    <tr key={r.row} className="border-t border-line/60">
                      <td className="tabular px-3 py-1.5 text-muted">{r.row}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: activityColor(r.activity) }} />
                          {activityLabel(r.activity)}
                        </span>
                      </td>
                      <td className="tabular px-3 py-1.5">{pct(r.confidence)}</td>
                      {summary.has_labels && (
                        <td className={`px-3 py-1.5 ${r.true_label === r.activity ? "text-ink-2" : "font-medium text-critical"}`}>{activityLabel(r.true_label)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Predict() {
  return (
    <>
      <PageHeader title="Predict" description="Run the Conv1D + LSTM model on a single sensor window or a whole CSV file. Every prediction is logged to your history." />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SingleWindow />
        <BatchUpload />
      </div>
    </>
  );
}

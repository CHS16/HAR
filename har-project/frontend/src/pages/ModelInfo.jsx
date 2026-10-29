import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage, modelApi } from "../api/client";
import { AXIS, ChartTooltip, ConfusionMatrix, GRID, Legend } from "../components/charts";
import { Alert, Card, PageHeader, Spinner, StatTile } from "../components/ui";
import { ACTIVITIES, activityColor, activityLabel, pct } from "../lib/activities";

const CURVE = [
  { key: "accuracy", label: "Train accuracy", color: "#6250d6" },
  { key: "val_accuracy", label: "Validation accuracy", color: "#e34948" },
];

export default function ModelInfo() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    modelApi
      .info()
      .then(setInfo)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!info) return <Spinner className="mx-auto mt-20" />;
  const m = info.metrics || {};
  const curve = (m.history?.accuracy || []).map((_, i) => ({
    epoch: i + 1,
    accuracy: m.history.accuracy[i],
    val_accuracy: m.history.val_accuracy?.[i],
  }));

  return (
    <>
      <PageHeader title="Model" description={m.dataset || "Conv1D + LSTM activity classifier"} />

      {info.mode !== "keras" && (
        <div className="mb-6">
          <Alert tone="warn">
            The backend is running the mock (nearest-centroid) model. Install TensorFlow and make sure backend/models/har_conv1d_lstm.keras exists, or run
            <code className="mx-1 rounded bg-white/70 px-1">python -m ml.train</code>.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Test accuracy" value={pct(m.test_accuracy)} hint={`${m.test_samples?.toLocaleString() ?? "—"} windows, unseen subjects`} />
        <StatTile label="Macro F1" value={pct(m.macro_f1)} />
        <StatTile label="Parameters" value={(info.params ?? m.params)?.toLocaleString() ?? "—"} />
        <StatTile label="Epochs trained" value={m.epochs_run ?? "—"} hint={m.trained_at ? new Date(m.trained_at).toLocaleDateString() : ""} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Architecture" subtitle={`Input ${info.input_shape?.join(" × ")}`}>
          <ol className="relative space-y-3 border-l border-line pl-5">
            {info.architecture.map((l, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-accent ring-1 ring-accent" />
                <div className="text-sm font-medium">{l.layer}</div>
                <div className="text-xs text-muted">{l.detail}</div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Training curve" subtitle="Accuracy per epoch" className="lg:col-span-2" action={<Legend items={CURVE.map((c) => ({ ...c, line: true }))} />} bodyClass="pt-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="epoch" {...AXIS} />
                <YAxis {...AXIS} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip cursor={{ stroke: "#c3c2b7" }} content={<ChartTooltip labelFormatter={(e) => `Epoch ${e}`} valueFormatter={(v) => pct(v)} />} />
                {CURVE.map((c) => (
                  <Line key={c.key} dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="Confusion matrix" subtitle="Test set · rows = true activity" className="lg:col-span-3">
          <ConfusionMatrix matrix={m.confusion_matrix} labels={m.labels || info.labels} />
        </Card>
        <Card title="Per-class metrics" className="lg:col-span-2" bodyClass="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Activity</th>
                <th className="px-3 py-2 text-right font-medium">Precision</th>
                <th className="px-3 py-2 text-right font-medium">Recall</th>
                <th className="px-5 py-2 text-right font-medium">F1</th>
              </tr>
            </thead>
            <tbody>
              {ACTIVITIES.filter((a) => m.per_class?.[a.key]).map(({ key: k }) => [k, m.per_class[k]]).map(([k, v]) => (
                <tr key={k} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: activityColor(k) }} />
                      {activityLabel(k)}
                    </span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{pct(v.precision)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{pct(v.recall)}</td>
                  <td className="tabular px-5 py-2.5 text-right font-medium">{pct(v["f1-score"])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

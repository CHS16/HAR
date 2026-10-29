import { ArrowLeft, Footprints } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage, streamApi } from "../api/client";
import { AXIS, ChartTooltip, GRID, Legend } from "../components/charts";
import { Alert, Card, PageHeader, Spinner, StatTile } from "../components/ui";
import { ACTIVITIES, activityColor, activityLabel, fmtTime, pct } from "../lib/activities";

const SERIES = [
  { key: "body_acc_mag", label: "Body acc magnitude", color: "#6250d6" },
  { key: "gyro_mag", label: "Gyro magnitude", color: "#e34948" },
];

export default function SessionDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    streamApi
      .session(id)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const perClass = useMemo(() => {
    if (!data) return [];
    return ACTIVITIES.map((a) => {
      const rows = data.history.filter((h) => h.true_label === a.key);
      const ok = rows.filter((h) => h.activity === a.key).length;
      return { ...a, n: rows.length, acc: rows.length ? ok / rows.length : null };
    }).filter((r) => r.n);
  }, [data]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner className="mx-auto mt-20" />;
  const { session, history } = data;
  const totalSteps = session.total_steps || history.reduce((acc, h) => acc + (h.activity === "RUNNING" ? 3 : (h.activity && h.activity.includes("WALK") ? 2 : 0)), 0);

  return (
    <>
      <Link to="/history" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
        <ArrowLeft className="h-3 w-3" /> Back to history
      </Link>
      <PageHeader title={`Session · Subject ${session.subject}`} description={`Started ${fmtTime(session.started_at)} · status ${session.status} · noise σ ${session.noise}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Estimated steps" value={`${totalSteps.toLocaleString()} steps`} hint={`~${((totalSteps * 0.75) / 1000).toFixed(2)} km`} icon={Footprints} />
        <StatTile label="Windows" value={session.windows} />
        <StatTile label="Accuracy" value={pct(session.accuracy)} />
        <StatTile label="Simulated duration" value={`${Math.round(session.windows * 1.28)} s`} />
        <StatTile label="Stored sensor rows" value={history.length} hint="sensor_history collection" />
      </div>

      <Card className="mt-6" title="Predicted vs ground truth" subtitle="Whole session · one cell per 1.28 s window" action={<Legend items={ACTIVITIES.map((a) => ({ label: a.label, color: a.color }))} />}>
        {["activity", "true_label"].map((field) => (
          <div key={field} className="mb-2 grid grid-cols-[84px_1fr] items-center gap-3">
            <span className="text-xs text-ink-2">{field === "activity" ? "Predicted" : "Ground truth"}</span>
            <div className="flex h-6 overflow-hidden rounded">
              {history.map((h) => (
                <div key={h.seq} className="flex-1" style={{ background: activityColor(h[field]) }} title={`t=${h.t}s · ${activityLabel(h[field])}`} />
              ))}
            </div>
          </div>
        ))}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Signal magnitude over the session" className="lg:col-span-2" action={<Legend items={SERIES.map((s) => ({ ...s, line: true }))} />} bodyClass="pt-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" {...AXIS} tickFormatter={(t) => `${Math.round(t)}s`} minTickGap={50} />
                <YAxis {...AXIS} domain={[-1, 1]} />
                <Tooltip
                  cursor={{ stroke: "#c3c2b7" }}
                  content={<ChartTooltip labelFormatter={(t, p) => `t = ${t}s · ${activityLabel(p?.[0]?.payload?.activity)}`} valueFormatter={(v) => v?.toFixed(3)} />}
                />
                {SERIES.map((s) => (
                  <Line key={s.key} dataKey={`key_features.${s.key}`} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Accuracy per activity" subtitle="Within this session">
          <div className="space-y-3">
            {perClass.map((r) => (
              <div key={r.key}>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ink-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                    {r.label} <span className="text-muted">({r.n})</span>
                  </span>
                  <span className="tabular font-medium">{pct(r.acc)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-page">
                  <div className="h-2 rounded-full" style={{ width: `${(r.acc ?? 0) * 100}%`, background: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

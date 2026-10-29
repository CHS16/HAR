import { Activity, ArrowRight, Footprints, Gauge, Radio, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage, historyApi, modelApi } from "../api/client";
import { AXIS, ChartTooltip, GRID } from "../components/charts";
import { ActivityBadge, Alert, Button, Card, Empty, PageHeader, Spinner, StatTile } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ACTIVITIES, fmtTime, pct } from "../lib/activities";
import DailyTargetsCard from "../components/DailyTargetsCard";

const SOURCE_LABEL = { stream: "Live stream", upload: "CSV upload", manual: "Manual", api: "API" };

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([historyApi.stats(), modelApi.info()])
      .then(([s, m]) => {
        setStats(s);
        setModel(m);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!stats) return <Spinner className="mx-auto mt-20" />;

  const byActivity = ACTIVITIES.map((a) => ({ name: a.label, key: a.key, value: stats.by_activity[a.key] || 0, fill: a.color }));
  const daily = stats.daily.map((d) => ({ ...d, label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }) }));
  const testAcc = model?.metrics?.test_accuracy;
  const totalSteps = stats.total_steps || 0;

  return (
    <>
      <PageHeader title={`Hello, ${user?.name?.split(" ")[0] ?? "there"}`} description="Overview of your activity predictions and sensor sessions.">
        <Link to="/live">
          <Button>
            <Radio className="h-4 w-4" /> Start live stream
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          label="Total steps tracked"
          value={totalSteps.toLocaleString()}
          hint={`~${((totalSteps * 0.75) / 1000).toFixed(2)} km walked / run`}
          icon={Footprints}
        />
        <StatTile label="Total predictions" value={stats.total_predictions.toLocaleString()} hint={`${stats.sessions} stream sessions`} icon={Activity} />
        <StatTile label="Accuracy on labelled data" value={pct(stats.accuracy)} hint={`${stats.labelled.toLocaleString()} labelled windows`} icon={Target} />
        <StatTile label="Mean confidence" value={pct(stats.mean_confidence)} hint="Softmax probability of top class" icon={Gauge} />
        <StatTile
          label="Model test accuracy"
          value={pct(testAcc)}
          hint={model?.mode === "keras" ? "Conv1D + LSTM · unseen subjects" : "Mock model active"}
          icon={Target}
        />
      </div>

      <DailyTargetsCard
        totalSteps={totalSteps}
        walkingCount={(stats.by_activity?.WALKING || 0) + (stats.by_activity?.WALKING_UPSTAIRS || 0) + (stats.by_activity?.WALKING_DOWNSTAIRS || 0)}
        runningCount={stats.by_activity?.RUNNING || 0}
      />

      {stats.total_predictions === 0 ? (
        <Card className="mt-6">
          <Empty icon={Radio} title="No predictions yet">
            Start a live stream or upload a CSV of sensor windows to see your activity breakdown here.
          </Empty>
          <div className="flex justify-center gap-2">
            <Link to="/live">
              <Button>Open Live Monitor</Button>
            </Link>
            <Link to="/predict">
              <Button variant="secondary">Upload CSV</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Predicted activities" subtitle="All-time count per class" className="lg:col-span-2" bodyClass="pt-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byActivity} margin={{ top: 16, right: 8, left: -10, bottom: 0 }} barCategoryGap="28%">
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="name" {...AXIS} />
                    <YAxis {...AXIS} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip valueFormatter={(v) => v.toLocaleString()} />} />
                    <Bar dataKey="value" name="Predictions" radius={[4, 4, 0, 0]} label={{ position: "top", fill: "#52514e", fontSize: 11 }}>
                      {byActivity.map((d) => (
                        <Cell key={d.key} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Predictions by source">
              <div className="space-y-3">
                {Object.entries(stats.by_source).map(([src, n]) => (
                  <div key={src}>
                    <div className="flex justify-between text-xs">
                      <span className="text-ink-2">{SOURCE_LABEL[src] ?? src}</span>
                      <span className="tabular font-medium">{n.toLocaleString()}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-page">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${(n / stats.total_predictions) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-line pt-4">
                <div className="text-xs font-medium text-ink-2">Last 7 days</div>
                <div className="mt-2 h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
                      <XAxis dataKey="label" {...AXIS} />
                      <YAxis {...AXIS} allowDecimals={false} tickCount={3} />
                      <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip labelFormatter={(_, p) => p?.[0]?.payload?.date} />} />
                      <Bar dataKey="count" name="Predictions" fill="#2a78d6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          <Card
            className="mt-6"
            title="Recent predictions"
            action={
              <Link to="/history" className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
            bodyClass="px-0 pb-2"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-5 py-2 font-medium">Time</th>
                    <th className="px-5 py-2 font-medium">Predicted</th>
                    <th className="px-5 py-2 font-medium">Confidence</th>
                    <th className="px-5 py-2 font-medium">Ground truth</th>
                    <th className="px-5 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((p) => (
                    <tr key={p.id} className="border-b border-line/60 last:border-0">
                      <td className="tabular whitespace-nowrap px-5 py-2.5 text-ink-2">{fmtTime(p.created_at)}</td>
                      <td className="px-5 py-2.5">
                        <ActivityBadge activity={p.activity} />
                      </td>
                      <td className="tabular px-5 py-2.5">{pct(p.confidence)}</td>
                      <td className="px-5 py-2.5 text-ink-2">{p.true_label ? <ActivityBadge activity={p.true_label} /> : "—"}</td>
                      <td className="px-5 py-2.5 text-ink-2">{SOURCE_LABEL[p.source] ?? p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

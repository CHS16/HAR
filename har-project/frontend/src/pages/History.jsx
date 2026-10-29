import { ChevronLeft, ChevronRight, ListX, Radio, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, historyApi, streamApi } from "../api/client";
import { ActivityBadge, Alert, Button, Card, Empty, PageHeader, Select, Spinner } from "../components/ui";
import { ACTIVITIES, activityColor, activityLabel, fmtTime, pct } from "../lib/activities";

const SOURCES = { stream: "Live stream", upload: "CSV upload", manual: "Manual", api: "API" };

function PredictionsTab() {
  const [filters, setFilters] = useState({ source: "", activity: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    setError("");
    historyApi
      .predictions({ page, limit: 20, source: filters.source || undefined, activity: filters.activity || undefined })
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [page, filters]);

  useEffect(load, [load]);

  const clearAll = async () => {
    await historyApi.clear().catch((e) => setError(errorMessage(e)));
    setConfirming(false);
    setPage(1);
    load();
  };

  return (
    <Card bodyClass="p-0">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-3">
          <Select label="Source" value={filters.source} onChange={(e) => (setPage(1), setFilters({ ...filters, source: e.target.value }))}>
            <option value="">All sources</option>
            {Object.entries(SOURCES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select label="Predicted activity" value={filters.activity} onChange={(e) => (setPage(1), setFilters({ ...filters, activity: e.target.value }))}>
            <option value="">All activities</option>
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-2">Delete all predictions, sessions and sensor history?</span>
            <Button variant="danger" onClick={clearAll}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)} disabled={!data?.total}>
            <Trash2 className="h-4 w-4" /> Clear history
          </Button>
        )}
      </div>

      <div className="p-4">
        <Alert>{error}</Alert>
      </div>

      {!data ? (
        <Spinner className="mx-auto my-10" />
      ) : data.total === 0 ? (
        <Empty icon={ListX} title="No predictions match">
          Predictions from the live monitor, manual input and CSV uploads are logged here.
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-page text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Predicted</th>
                  <th className="px-4 py-2 font-medium">Confidence</th>
                  <th className="px-4 py-2 font-medium">Ground truth</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="tabular whitespace-nowrap px-4 py-2.5 text-ink-2">{fmtTime(p.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <ActivityBadge activity={p.activity} />
                    </td>
                    <td className="tabular px-4 py-2.5">{pct(p.confidence)}</td>
                    <td className="px-4 py-2.5 text-ink-2">{p.true_label ? activityLabel(p.true_label) : "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {p.correct == null ? (
                        <span className="text-muted">—</span>
                      ) : p.correct ? (
                        <span className="text-good-text">Correct</span>
                      ) : (
                        <span className="text-critical">Wrong</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">
                      {p.session_id ? (
                        <Link className="text-accent hover:underline" to={`/history/sessions/${p.session_id}`}>
                          {SOURCES[p.source]}
                        </Link>
                      ) : (
                        <>
                          {SOURCES[p.source] ?? p.source}
                          {p.filename && <span className="text-muted"> · {p.filename}</span>}
                        </>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-muted">{p.latency_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-xs text-ink-2">
            <span className="tabular">
              {data.total.toLocaleString()} predictions · page {data.page} of {data.pages}
            </span>
            <div className="flex gap-1">
              <Button variant="secondary" className="px-2 py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="secondary" className="px-2 py-1.5" disabled={page >= data.pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function SessionsTab() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    streamApi
      .sessions()
      .then((d) => setSessions(d.sessions))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!sessions) return <Spinner className="mx-auto my-10" />;
  if (!sessions.length)
    return (
      <Card>
        <Empty icon={Radio} title="No stream sessions yet">
          Sessions you run in the Live Monitor are stored with their full sensor history.
        </Empty>
      </Card>
    );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sessions.map((s) => {
        const total = Object.values(s.activity_counts || {}).reduce((a, b) => a + b, 0);
        return (
          <Link key={s.id} to={`/history/sessions/${s.id}`} className="block rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">Subject {s.subject}</div>
                <div className="text-xs text-muted">{fmtTime(s.started_at)}</div>
              </div>
              <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium capitalize text-ink-2">{s.status}</span>
            </div>
            <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full bg-page">
              {ACTIVITIES.filter((a) => s.activity_counts?.[a.key]).map((a) => (
                <div key={a.key} style={{ flex: s.activity_counts[a.key], background: activityColor(a.key) }} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 text-xs">
              <div>
                <div className="text-muted">Windows</div>
                <div className="tabular font-medium">{s.windows}</div>
              </div>
              <div>
                <div className="text-muted">Accuracy</div>
                <div className="tabular font-medium">{pct(s.accuracy)}</div>
              </div>
              <div>
                <div className="text-muted">Noise σ</div>
                <div className="tabular font-medium">{s.noise}</div>
              </div>
            </div>
            {total === 0 && <div className="mt-2 text-xs text-muted">No windows processed</div>}
          </Link>
        );
      })}
    </div>
  );
}

export default function History() {
  const [tab, setTab] = useState("predictions");
  return (
    <>
      <PageHeader title="History" description="Every prediction and sensor session stored in MongoDB for your account." />
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-1" role="tablist">
        {[
          ["predictions", "Prediction logs"],
          ["sessions", "Sensor sessions"],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-side text-white" : "text-ink-2 hover:bg-page"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "predictions" ? <PredictionsTab /> : <SessionsTab />}
    </>
  );
}

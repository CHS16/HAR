import { ACTIVITIES, activityLabel, pct } from "../lib/activities";

export const AXIS = { stroke: "#c3c2b7", tick: { fill: "#898781", fontSize: 11 }, tickLine: false };
export const GRID = { stroke: "#e1e0d9", strokeDasharray: "0", vertical: false };

/** Recharts tooltip in the app's style. Text stays in ink colours; a swatch carries identity. */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
            {p.name}
          </span>
          <span className="tabular font-medium text-ink">{valueFormatter(p.value, p)}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal probability bars for the 6 classes, sorted by fixed activity order. */
export function ProbabilityBars({ probabilities, highlight }) {
  return (
    <div className="space-y-2.5">
      {ACTIVITIES.map((a) => {
        const v = probabilities?.[a.key] ?? 0;
        return (
          <div key={a.key} className="grid grid-cols-[88px_1fr_52px] items-center gap-3 text-xs">
            <span className={highlight === a.key ? "font-semibold text-ink" : "text-ink-2"}>{a.label}</span>
            <div className="h-2 rounded-full bg-page" role="meter" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={a.label}>
              <div className="h-2 rounded-full transition-[width] duration-500" style={{ width: `${Math.max(v * 100, 0.5)}%`, background: a.color }} />
            </div>
            <span className="tabular text-right text-ink">{pct(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Confusion matrix heat-table: rows = true label, cols = predicted. Sequential blue ramp. */
const RAMP = ["#fcfcfb", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export function ConfusionMatrix({ matrix, labels }) {
  if (!matrix?.length) return null;
  const rowTotals = matrix.map((r) => r.reduce((a, b) => a + b, 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr>
            <th className="p-1 text-left font-normal text-muted">True ↓ / Pred →</th>
            {labels.map((l) => (
              <th key={l} className="p-1 font-medium text-ink-2">
                {activityLabel(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th className="p-1 pr-2 text-left font-medium text-ink-2">{activityLabel(labels[i])}</th>
              {row.map((v, j) => {
                const share = rowTotals[i] ? v / rowTotals[i] : 0;
                const step = v === 0 ? 0 : Math.min(RAMP.length - 1, 1 + Math.floor(share * (RAMP.length - 1)));
                const dark = step >= 4;
                return (
                  <td
                    key={j}
                    title={`True ${activityLabel(labels[i])}, predicted ${activityLabel(labels[j])}: ${v} (${pct(share)})`}
                    className={`tabular rounded p-2 text-center ${dark ? "text-white" : "text-ink"} ${i === j ? "font-semibold" : ""}`}
                    style={{ background: RAMP[step] }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={it.line ? "h-0.5 w-3 rounded" : "h-2 w-2 rounded-full"} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

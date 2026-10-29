import { AlertCircle, Loader2 } from "lucide-react";
import { ACTIVITY_MAP, activityLabel } from "../lib/activities";

export function Card({ title, subtitle, action, children, className = "", bodyClass = "" }) {
  return (
    <section className={`rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`p-5 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-muted" aria-hidden />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Button({ variant = "primary", className = "", loading, children, ...props }) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-dark disabled:bg-accent/50",
    secondary: "border border-line bg-white text-ink hover:bg-page disabled:text-muted",
    danger: "border border-line bg-white text-critical hover:bg-red-50",
    ghost: "text-ink-2 hover:bg-page",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Alert({ children, tone = "error" }) {
  if (!children) return null;
  const s = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${s}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function Spinner({ className = "" }) {
  return <Loader2 className={`h-6 w-6 animate-spin text-muted ${className}`} aria-label="Loading" />;
}

export function ActivityBadge({ activity, size = "sm" }) {
  const a = ACTIVITY_MAP[activity];
  const Icon = a?.icon;
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-white font-medium text-ink ${pad}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: a?.color ?? "#898781" }} aria-hidden />
      {Icon && size === "lg" && <Icon className="h-4 w-4 text-ink-2" aria-hidden />}
      {activityLabel(activity)}
    </span>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-axis" aria-hidden />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs text-muted">{children}</p>}
    </div>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      <select
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

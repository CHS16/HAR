import { Activity } from "lucide-react";
import { ACTIVITIES } from "../lib/activities";

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-side p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent">
            <Activity className="h-5 w-5" />
          </div>
          <span className="font-semibold">MotionSense</span>
        </div>

        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Recognise human activity from smartphone motion sensors.
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/60">
            A Conv1D + LSTM network reads accelerometer and gyroscope features every 1.28 seconds and classifies what the person is doing.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-2">
            {ACTIVITIES.map(({ key, label, icon: Icon, color }) => (
              <div key={key} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-xs text-white/80">
                <Icon className="h-4 w-4" style={{ color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">Trained on the UCI HAR smartphone dataset · 30 subjects · 6 activities</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-ink-2">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        {...props}
      />
    </label>
  );
}

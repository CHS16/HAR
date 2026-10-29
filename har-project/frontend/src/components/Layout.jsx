import { Activity, BrainCircuit, History, LayoutDashboard, LogOut, Menu, Radio, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { modelApi } from "../api/client";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/live", label: "Live Monitor", icon: Radio },
  { to: "/predict", label: "Predict", icon: Upload },
  { to: "/history", label: "History", icon: History },
  { to: "/model", label: "Model", icon: BrainCircuit },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent">
        <Activity className="h-4 w-4 text-white" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">MotionSense</div>
        <div className="text-[11px] text-white/50">Activity Recognition</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    modelApi.health().then(setHealth).catch(() => setHealth({ status: "down" }));
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col bg-side px-3 py-5">
      <Brand />
      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive ? "bg-white/10 font-medium text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        {health && (
          <div className="rounded-lg bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-white/60">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${health.status === "ok" ? "bg-good" : "bg-critical"}`} />
              <span className="text-white/80">{health.status === "ok" ? "Backend online" : "Backend offline"}</span>
            </div>
            {health.status === "ok" && (
              <>
                <div>Model: {health.model_mode === "keras" ? "Conv1D + LSTM" : "mock (fallback)"}</div>
                <div>DB: {health.database}</div>
              </>
            )}
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg px-2 py-1">
          <div className="min-w-0">
            <div className="truncate text-sm text-white">{user?.name}</div>
            <div className="truncate text-[11px] text-white/50">{user?.email}</div>
          </div>
          <button onClick={logout} className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          <button onClick={() => setOpen(false)} className="absolute left-64 top-3 ml-2 rounded-md bg-white p-1.5" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-page" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">MotionSense</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

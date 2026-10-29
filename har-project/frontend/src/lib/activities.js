import { Footprints, TrendingUp, TrendingDown, Armchair, PersonStanding, BedDouble, Flame } from "lucide-react";

// Fixed categorical order (validated colour-blind-safe palette, slots 1-7).
// Colour follows the activity everywhere in the app, never its rank.
export const ACTIVITIES = [
  { key: "WALKING", label: "Walking", color: "#2a78d6", icon: Footprints, moving: true },
  { key: "RUNNING", label: "Running", color: "#e11d48", icon: Flame, moving: true },
  { key: "WALKING_UPSTAIRS", label: "Upstairs", color: "#eb6834", icon: TrendingUp, moving: true },
  { key: "WALKING_DOWNSTAIRS", label: "Downstairs", color: "#1baf7a", icon: TrendingDown, moving: true },
  { key: "SITTING", label: "Sitting", color: "#eda100", icon: Armchair, moving: false },
  { key: "STANDING", label: "Standing", color: "#e87ba4", icon: PersonStanding, moving: false },
  { key: "LAYING", label: "Laying", color: "#008300", icon: BedDouble, moving: false },
];

export const ACTIVITY_MAP = Object.fromEntries(ACTIVITIES.map((a) => [a.key, a]));

export const activityLabel = (key) => ACTIVITY_MAP[key]?.label ?? key ?? "—";
export const activityColor = (key) => ACTIVITY_MAP[key]?.color ?? "#898781";

export const pct = (v, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

export const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

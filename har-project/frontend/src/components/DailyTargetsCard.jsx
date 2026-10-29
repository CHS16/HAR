import {
  Award,
  ChevronRight,
  Flame,
  Footprints,
  HeartPulse,
  Info,
  Plus,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Timer,
  UserCheck,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AGE_TIERS, estimateCaloriesBurned, getTierByAge } from "../lib/ageTargets";
import { announceRep, pulseHaptic } from "../lib/repCounter";

export default function DailyTargetsCard({ totalSteps = 0 }) {
  // Load saved profile or defaults
  const [age, setAge] = useState(() => {
    const saved = localStorage.getItem("motionsense_user_age");
    return saved ? Number(saved) : 25;
  });

  const [weightKg, setWeightKg] = useState(() => {
    const saved = localStorage.getItem("motionsense_user_weight");
    return saved ? Number(saved) : 68;
  });

  // Real exercise repetitions stored across sessions
  const [repsData, setRepsData] = useState(() => {
    try {
      const saved = localStorage.getItem("motionsense_exercise_reps");
      return saved
        ? JSON.parse(saved)
        : { squats: 0, jumping_jacks: 0, chair_stands: 0, posture_breaks: 0 };
    } catch {
      return { squats: 0, jumping_jacks: 0, chair_stands: 0, posture_breaks: 0 };
    }
  });

  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Calculate active age tier
  const tier = getTierByAge(age);

  // Persistence
  useEffect(() => {
    localStorage.setItem("motionsense_user_age", String(age));
    localStorage.setItem("motionsense_user_weight", String(weightKg));
  }, [age, weightKg]);

  useEffect(() => {
    localStorage.setItem("motionsense_exercise_reps", JSON.stringify(repsData));
  }, [repsData]);

  // Sync when storage is updated from LiveMonitor page
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "motionsense_exercise_reps" && e.newValue) {
        try {
          setRepsData(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Derived metrics from user activity
  const activeCalories = estimateCaloriesBurned(totalSteps, weightKg, age);
  const activeMinutes = Math.round(totalSteps / 115); // ~115 steps/min average brisk movement

  // Get real repetition count based on age tier focus
  const getExerciseKeyForTier = () => {
    if (tier.id === "kids") return "jumping_jacks";
    if (tier.id === "young_adult") return "squats";
    if (tier.id === "middle_aged") return "posture_breaks";
    return "chair_stands";
  };

  const currentExerciseKey = getExerciseKeyForTier();
  const focusValue = repsData[currentExerciseKey] || 0;

  // Add a repetition manually (or from test button)
  const handleAddRep = () => {
    const newCount = focusValue + 1;
    setRepsData((prev) => ({
      ...prev,
      [currentExerciseKey]: newCount,
    }));
    if (voiceEnabled) {
      announceRep(newCount);
    }
    pulseHaptic();
  };

  const handleResetReps = () => {
    setRepsData((prev) => ({
      ...prev,
      [currentExerciseKey]: 0,
    }));
  };

  // Progress percentages (capped at 100% for display bar)
  const stepsPct = Math.min(100, Math.round((totalSteps / tier.targets.steps) * 100));
  const calPct = Math.min(100, Math.round((activeCalories / tier.targets.calories) * 100));
  const timePct = Math.min(100, Math.round((activeMinutes / tier.targets.activeMinutes) * 100));
  const focusPct = Math.min(100, Math.round((focusValue / tier.targets.focusTarget) * 100));

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Header & Age Tier Selector */}
      <div className="flex flex-col gap-4 border-b border-line/70 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: tier.theme.light, color: tier.theme.text, border: `1px solid ${tier.theme.border}` }}
            >
              <Sparkles className="h-3 w-3" />
              {tier.label} Mode ({tier.ageRange})
            </span>
            <span className="text-xs text-muted">Daily Targets</span>
          </div>
          <h2 className="mt-1 text-base font-semibold text-ink">{tier.tagline}</h2>
          <p className="mt-0.5 text-xs text-ink-2">{tier.guideline}</p>
        </div>

        {/* Quick Age Tier Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {AGE_TIERS.map((t) => {
            const isSelected = tier.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setAge(t.defaultAge)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-side text-white shadow-sm"
                    : "border border-line bg-surface text-ink-2 hover:bg-page hover:text-ink"
                }`}
              >
                <span>{t.label.split("&")[0].trim()}</span>
                <span className={`text-[10px] ${isSelected ? "text-white/70" : "text-muted"}`}>{t.ageRange}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile Adjuster Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-page px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-3.5 w-3.5 text-accent" />
            <span className="font-medium text-ink">Exact Age:</span>
            <input
              type="range"
              min="8"
              max="90"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-accent"
            />
            <span className="tabular font-semibold text-ink">{age} yrs</span>
          </div>

          <div className="flex items-center gap-2">
            <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
            <span className="font-medium text-ink">Body Weight:</span>
            <input
              type="number"
              min="20"
              max="200"
              value={weightKg}
              onChange={(e) => setWeightKg(Math.max(20, Number(e.target.value)))}
              className="w-14 rounded border border-line bg-white px-1.5 py-0.5 text-center text-xs font-semibold tabular text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-muted">kg</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoiceEnabled((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-ink-2 hover:text-ink"
            title="Toggle voice coach counting aloud"
          >
            {voiceEnabled ? <Volume2 className="h-3.5 w-3.5 text-accent" /> : <VolumeX className="h-3.5 w-3.5 text-muted" />}
            <span>Voice Coach: {voiceEnabled ? "On" : "Off"}</span>
          </button>
        </div>
      </div>

      {/* 4 Interactive Daily Target Cards */}
      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Target 1: Steps */}
        <div className="relative overflow-hidden rounded-xl border border-line/80 bg-surface p-4 transition-all hover:border-line">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink-2">Daily Steps Goal</span>
            <Footprints className="h-4 w-4 text-accent" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tabular text-2xl font-bold text-ink">{totalSteps.toLocaleString()}</span>
            <span className="text-xs text-muted">/ {tier.targets.steps.toLocaleString()}</span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-page">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${stepsPct}%`,
                background: stepsPct >= 100 ? "#0ca30c" : tier.theme.accent,
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="tabular font-medium text-ink-2">{stepsPct}% achieved</span>
            <span className="text-muted">
              {totalSteps >= tier.targets.steps
                ? "Target met! 🎯"
                : `${(tier.targets.steps - totalSteps).toLocaleString()} to go`}
            </span>
          </div>
        </div>

        {/* Target 2: Active Calories */}
        <div className="relative overflow-hidden rounded-xl border border-line/80 bg-surface p-4 transition-all hover:border-line">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink-2">Active Calorie Burn</span>
            <Flame className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tabular text-2xl font-bold text-ink">{activeCalories}</span>
            <span className="text-xs text-muted">/ {tier.targets.calories} kcal</span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-page">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${calPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="tabular font-medium text-ink-2">{calPct}% of daily burn</span>
            <span className="text-muted">MET calibrated</span>
          </div>
        </div>

        {/* Target 3: Active Minutes */}
        <div className="relative overflow-hidden rounded-xl border border-line/80 bg-surface p-4 transition-all hover:border-line">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink-2">Active Movement Time</span>
            <Timer className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tabular text-2xl font-bold text-ink">{activeMinutes}</span>
            <span className="text-xs text-muted">/ {tier.targets.activeMinutes} mins</span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-page">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${timePct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="tabular font-medium text-ink-2">{timePct}% daily goal</span>
            <span className="text-muted">{tier.targets.activeMinutes - activeMinutes > 0 ? `${tier.targets.activeMinutes - activeMinutes}m left` : "Achieved!"}</span>
          </div>
        </div>

        {/* Target 4: Age-Specific Exercise Repetition Target (Interactive & Real-Time) */}
        <div
          className="relative flex flex-col justify-between overflow-hidden rounded-xl border p-4 transition-all"
          style={{ borderColor: tier.theme.border, background: tier.theme.light }}
        >
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold" style={{ color: tier.theme.text }}>
                {tier.targets.focusName}
              </span>
              <Award className="h-4 w-4" style={{ color: tier.theme.accent }} />
            </div>

            <div className="mt-2 flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="tabular text-2xl font-bold" style={{ color: tier.theme.text }}>
                  {focusValue}
                </span>
                <span className="text-xs opacity-70" style={{ color: tier.theme.text }}>
                  / {tier.targets.focusTarget} {tier.targets.focusUnit}
                </span>
              </div>

              {/* Quick interactive test / rep counter buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleAddRep}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-xs transition-transform active:scale-95"
                  style={{ background: tier.theme.accent }}
                  title="Add repetition (speaks rep count out loud)"
                >
                  <Plus className="h-3 w-3" />
                  <span>Rep</span>
                </button>
                {focusValue > 0 && (
                  <button
                    type="button"
                    onClick={handleResetReps}
                    className="rounded-md p-1 text-[10px] text-muted hover:text-ink"
                    title="Reset exercise reps"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${focusPct}%`, background: tier.theme.accent }}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2 text-[10px]" style={{ color: tier.theme.text }}>
            <span>{focusPct}% completed</span>
            <Link to="/live" className="inline-flex items-center gap-0.5 font-semibold hover:underline">
              <Smartphone className="h-3 w-3" /> Live Phone Auto-Count <ChevronRight className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Biomechanical Standards & Coach Advice */}
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-line/60 bg-page/70 p-3.5 sm:grid-cols-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white shadow-xs">
            <Zap className="h-4 w-4 text-accent" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted">Target Cadence</div>
            <div className="text-xs font-semibold tabular text-ink">{tier.biomechanics.targetCadence}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white shadow-xs">
            <ShieldAlert className="h-4 w-4 text-critical" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted">Max Joint Shock Ceiling</div>
            <div className="text-xs font-semibold tabular text-ink">
              ≤ {tier.biomechanics.maxSafeImpactG} g impact
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white shadow-xs">
            <Award className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted">Daily Age Tip</div>
            <div className="line-clamp-1 text-xs text-ink-2" title={tier.biomechanics.focusAdvice}>
              {tier.biomechanics.focusAdvice}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

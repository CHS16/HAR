import {
  Activity,
  Award,
  ChevronRight,
  Dumbbell,
  Flame,
  HeartPulse,
  Info,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";

export const EXERCISE_GUIDE_DATA = [
  {
    id: "squats",
    title: "Squats (Standard & Deep)",
    badge: "Hypertrophy & Lower Body",
    themeColor: "#2a78d6",
    phonePlacement: "Front trouser pocket (ideal) or held flat with two hands against your sternum/chest.",
    targetMuscles: "Quadriceps, Gluteus Maximus, Hamstrings, Core Stabilizers",
    cadenceGuidance: "2.0 – 3.5 seconds per repetition (controlled 2s descent, 1s drive up)",
    safeImpactCeiling: "≤ 2.5 g (smooth reversal, no sudden dropping)",
    howSensorsDetectIt: [
      {
        phase: "Phase 1: Eccentric Dip",
        kinematics: "Acceleration drops below gravity baseline (< 8.9 m/s²)",
        description: "As your hips descend into the squat, the body momentarily unweights.",
      },
      {
        phase: "Phase 2: Bottom Turnaround",
        kinematics: "Acceleration bottoms out and reverses upwards",
        description: "Phone reaches maximum depth (thighs parallel to floor). Transition from descent to ascent.",
      },
      {
        phase: "Phase 3: Concentric Drive",
        kinematics: "Acceleration surges above baseline (> 10.8 m/s²)",
        description: "Your quads and glutes fire to push your mass vertically upwards against gravity.",
      },
      {
        phase: "Phase 4: Top Lockout",
        kinematics: "Returns to stable 9.8 m/s² baseline",
        description: "Standing fully erect with hips extended. Rep is counted and logged!",
      },
    ],
    formTips: [
      "Keep feet shoulder-width apart with toes flared slightly outward (15°–30°).",
      "Drive knees outward over toes during descent — avoid letting knees cave inward.",
      "Push forcefully through your mid-foot and heels on the way up.",
    ],
  },
  {
    id: "jumping_jacks",
    title: "Jumping Jacks (Cardio Bursts)",
    badge: "Cardiovascular & Bone Density",
    themeColor: "#10b981",
    phonePlacement: "Held securely in hand, in a snug pocket, or attached via an athletic armband.",
    targetMuscles: "Calves, Deltoids, Hip Abductors (Gluteus Medius), Cardiovascular System",
    cadenceGuidance: "0.8 – 1.4 seconds per jump cycle (rhythmic cadence)",
    safeImpactCeiling: "≤ 3.2 g (pliant knee landings to protect joints)",
    howSensorsDetectIt: [
      {
        phase: "Phase 1: Takeoff Impulse",
        kinematics: "High dynamic acceleration spike (> 12.5 m/s²)",
        description: "Feet push off the ground while arms swing upward.",
      },
      {
        phase: "Phase 2: Flight Unweighting",
        kinematics: "Brief unweighting as legs spread outwards",
        description: "Feet land shoulder-width apart with arms fully overhead.",
      },
      {
        phase: "Phase 3: Rebound & Return",
        kinematics: "Landing impact and cyclical reversal",
        description: "Feet spring back together as arms lower back to your sides.",
      },
    ],
    formTips: [
      "Land softly on the balls of your feet with knees slightly bent to absorb impact shocks.",
      "Keep your core lightly braced to maintain balance and rhythm.",
      "Achieve full arm extension above head height on each repetition.",
    ],
  },
  {
    id: "chair_stands",
    title: "Chair Stands (Sit-to-Stand)",
    badge: "CDC STEADI Mobility Standard",
    themeColor: "#8b5cf6",
    phonePlacement: "Front pocket or held securely against your hip / thigh while seated.",
    targetMuscles: "Quadriceps, Glutes, Hip Flexors, Functional Core Independence",
    cadenceGuidance: "1.5 – 3.0 seconds per stand (steady, balanced pace)",
    safeImpactCeiling: "≤ 1.8 g (gentle sit-down with no hard chair impact)",
    howSensorsDetectIt: [
      {
        phase: "Phase 1: Forward Lean",
        kinematics: "Forward pitch angular rotation + slight weight shift",
        description: "Upper body leans forward slightly from seated position to center mass over feet.",
      },
      {
        phase: "Phase 2: Upward Stand Drive",
        kinematics: "Vertical acceleration surge (> 10.8 m/s²)",
        description: "Legs push the body up out of the chair into full standing extension.",
      },
      {
        phase: "Phase 3: Upright Lockout",
        kinematics: "Stabilizes in vertical upright standing pose",
        description: "User stands tall for at least 0.3s before smoothly returning to sit.",
      },
    ],
    formTips: [
      "Sit on a sturdy, armless chair with feet flat on the floor.",
      "Cross your arms across your chest (avoid pushing off with your hands).",
      "Stand up all the way until knees and hips are fully straight, then sit back down under control.",
    ],
  },
  {
    id: "general",
    title: "General Reps & Tempo Training",
    badge: "Universal Strength & TUT",
    themeColor: "#f59e0b",
    phonePlacement: "Attached to the moving limb (wrist/armband for curls/presses, pocket for lunges).",
    targetMuscles: "Adaptable to Bicep Curls, Dumbbell Presses, Lunges, or Step-ups",
    cadenceGuidance: "1.0 – 4.0 seconds per repetition depending on exercise",
    safeImpactCeiling: "≤ 2.5 g",
    howSensorsDetectIt: [
      {
        phase: "Phase 1: Concentric Motion",
        kinematics: "Filtered body magnitude crosses dynamic acceleration threshold (> 11.0 m/s²)",
        description: "The lifting phase of the repetition begins against gravity.",
      },
      {
        phase: "Phase 2: Peak Contraction",
        kinematics: "Momentum reversal at maximum displacement",
        description: "The muscle reaches peak tension at the top of the range of motion.",
      },
      {
        phase: "Phase 3: Eccentric Return",
        kinematics: "Controlled return settling back to baseline",
        description: "The weight returns to starting position, completing 1 full repetition.",
      },
    ],
    formTips: [
      "Prioritize Time Under Tension (TUT): a 2s lowering phase stimulates maximum muscle fibers.",
      "Avoid using momentum or swinging to cheat the weight up.",
      "Exhale on exertion (push/pull), inhale on the return phase.",
    ],
  },
];

export default function ExerciseGuide({ activeExerciseId = "squats", onSelectExercise }) {
  const [selectedId, setSelectedId] = useState(activeExerciseId);

  const currentExercise =
    EXERCISE_GUIDE_DATA.find((e) => e.id === selectedId) || EXERCISE_GUIDE_DATA[0];

  const handleSelect = (id) => {
    setSelectedId(id);
    if (onSelectExercise) onSelectExercise(id);
  };

  return (
    <div className="rounded-xl border border-line bg-white shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-line/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
              <Dumbbell className="h-3 w-3" /> Exercise Form & Sensor Guide
            </span>
            <span className="text-xs text-muted">Biomechanical Standards</span>
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-ink">
            How Smartphone Accelerometers Track Repetitions
          </h3>
        </div>

        {/* Exercise Quick Switcher Tabs */}
        <div className="flex flex-wrap gap-1">
          {EXERCISE_GUIDE_DATA.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => handleSelect(ex.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                selectedId === ex.id
                  ? "bg-side text-white shadow-xs"
                  : "border border-line bg-page text-ink-2 hover:bg-surface hover:text-ink"
              }`}
            >
              {ex.title.split("(")[0].trim()}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Banner with Target Muscles & Phone Placement */}
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-line/60 bg-page/70 p-3 sm:grid-cols-2 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white shadow-xs">
              <Smartphone className="h-4 w-4 text-accent" />
            </div>
            <div>
              <span className="font-semibold text-ink">Best Phone Placement</span>
              <p className="mt-0.5 text-ink-2 leading-relaxed">{currentExercise.phonePlacement}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white shadow-xs">
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <span className="font-semibold text-ink">Target Muscles & Focus</span>
              <p className="mt-0.5 text-ink-2 leading-relaxed">{currentExercise.targetMuscles}</p>
            </div>
          </div>
        </div>

        {/* Step-by-Step Kinematic Sensor Pipeline */}
        <div>
          <h4 className="text-xs font-semibold text-ink flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-accent" /> Sensor Kinematics (How Each Rep Is Counted)
          </h4>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {currentExercise.howSensorsDetectIt.map((step, idx) => (
              <div key={idx} className="rounded-lg border border-line bg-surface p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">{step.phase}</span>
                  <span className="text-[10px] font-mono text-muted">Step {idx + 1}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] font-semibold text-accent">
                  {step.kinematics}
                </div>
                <p className="mt-1 text-[11px] text-ink-2 leading-normal">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form Cues & Joint Protection Safety */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
          <div className="rounded-lg border border-line bg-surface p-3 text-xs sm:col-span-2">
            <span className="font-semibold text-ink flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Proper Form Coaching Cues
            </span>
            <ul className="mt-2 space-y-1 text-ink-2">
              {currentExercise.formTips.map((tip, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-[11px]">
                  <span className="text-accent font-bold">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line bg-surface p-3 text-xs space-y-2">
            <div>
              <span className="font-semibold text-ink flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-critical" /> Safe Impact Ceiling
              </span>
              <p className="mt-1 font-mono text-[11px] font-semibold text-critical">
                {currentExercise.safeImpactCeiling}
              </p>
            </div>
            <div className="border-t border-line/60 pt-2">
              <span className="font-semibold text-ink flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Target Rep Cadence
              </span>
              <p className="mt-1 text-[11px] text-ink-2">{currentExercise.cadenceGuidance}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

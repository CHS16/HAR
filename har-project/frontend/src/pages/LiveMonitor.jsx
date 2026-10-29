import { CheckCircle2, Dumbbell, Footprints, Pause, Play, Plus, Radio, RotateCcw, Smartphone, Sparkles, Square, Volume2, VolumeX, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage, predictApi, streamApi } from "../api/client";
import { AXIS, ChartTooltip, GRID, Legend, ProbabilityBars } from "../components/charts";
import { ActivityBadge, Alert, Button, Card, Empty, PageHeader, Select, StatTile } from "../components/ui";
import { ACTIVITIES, activityColor, activityLabel, pct } from "../lib/activities";
import { EXERCISES, RepCounterEngine, announceRep, pulseHaptic } from "../lib/repCounter";
import ExerciseGuide from "../components/ExerciseGuide";

const BUFFER = 60; // windows kept on screen (~77 s of signal)
const STEP_MS = 1280; // real-time cadence of UCI HAR windows (50 % overlap of 2.56 s)
const AXIS_COLORS = { x: "#6250d6", y: "#e34948", z: "#52514e" };

function SignalChart({ data, keys, title, subtitle, domain }) {
  const names = { x: "X axis", y: "Y axis", z: "Z axis" };
  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={<Legend items={Object.entries(keys).map(([axis]) => ({ label: names[axis], color: AXIS_COLORS[axis], line: true }))} />}
      bodyClass="pt-2"
    >
      <div className="h-52">
        {data.length === 0 ? (
          <Empty title="Waiting for sensor data" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} tickFormatter={(t) => `${Math.round(t)}s`} minTickGap={40} />
              <YAxis {...AXIS} domain={domain} tickCount={5} />
              <Tooltip
                content={<ChartTooltip labelFormatter={(t) => `t = ${t}s`} valueFormatter={(v) => v?.toFixed(3)} />}
                cursor={{ stroke: "#c3c2b7" }}
              />
              {Object.entries(keys).map(([axis, key]) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={`key_features.${key}`}
                  name={names[axis]}
                  stroke={AXIS_COLORS[axis]}
                  strokeWidth={2}
                  strokeDasharray={axis === "z" ? "4 3" : undefined}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function Timeline({ windows }) {
  const Row = ({ label, field }) => (
    <div className="grid grid-cols-[72px_1fr] items-center gap-3">
      <span className="text-xs text-ink-2">{label}</span>
      <div className="flex h-6 gap-[2px]">
        {Array.from({ length: BUFFER }).map((_, i) => {
          const w = windows[windows.length - BUFFER + i];
          return (
            <div
              key={i}
              className="flex-1 rounded-[3px]"
              style={{ background: w ? activityColor(w[field]) : "#f0efec" }}
              title={w ? `t=${w.t}s · ${label}: ${activityLabel(w[field])}` : ""}
            />
          );
        })}
      </div>
    </div>
  );
  return (
    <Card
      title="Activity timeline"
      subtitle={`Last ${BUFFER} windows · each cell = 1.28 s`}
      action={<Legend items={ACTIVITIES.map((a) => ({ label: a.label, color: a.color }))} />}
    >
      <div className="space-y-2">
        <Row label="Predicted" field="activity" />
        <Row label="Smoothed" field="smoothed_activity" />
        <Row label="Ground truth" field="true_label" />
      </div>
    </Card>
  );
}

export default function LiveMonitor() {
  const [monitorMode, setMonitorMode] = useState("device"); // "device" or "replay"

  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [noise, setNoise] = useState(0);
  const [speed, setSpeed] = useState(4);
  const [condensed, setCondensed] = useState(true);
  const [session, setSession] = useState(null);
  const [stats, setStats] = useState(null);
  const [windows, setWindows] = useState([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const sessionRef = useRef(null);
  const runningRef = useRef(false);
  const speedRef = useRef(speed);
  const replayTimer = useRef(null);

  // Phone hardware live sensors state
  const [deviceStreaming, setDeviceStreaming] = useState(false);
  const [deviceReadings, setDeviceReadings] = useState({ ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 });
  const [devicePrediction, setDevicePrediction] = useState(null);
  const [deviceWindowsCount, setDeviceWindowsCount] = useState(0);
  const [deviceSteps, setDeviceSteps] = useState(0);
  const [motionInfo, setMotionInfo] = useState(null);
  const samplesBuffer = useRef([]);
  const recentPreds = useRef([]);
  const deviceTimer = useRef(null);
  const pedometerRef = useRef({
    filteredAcc: null,
    baselineAcc: 9.806,
    lastStepTime: 0,
    candidateTime: 0,
    isPeak: false,
    peakValue: 0,
  });

  // User-chosen tracking mode: Normal Activity (Default) vs Workout / Exercise Reps Mode
  const [workoutMode, setWorkoutMode] = useState(false);
  const workoutModeRef = useRef(workoutMode);
  workoutModeRef.current = workoutMode;

  // Exercise repetition state
  const [activeExercise, setActiveExercise] = useState("squats");
  const activeExerciseRef = useRef(activeExercise);
  activeExerciseRef.current = activeExercise;

  const [exerciseReps, setExerciseReps] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("motionsense_exercise_reps") || "{}");
      return saved["squats"] || 0;
    } catch {
      return 0;
    }
  });
  const [exercisePhase, setExercisePhase] = useState("Ready");
  const [exerciseTempo, setExerciseTempo] = useState("0.0");
  const [voiceCoach, setVoiceCoach] = useState(true);
  const voiceCoachRef = useRef(voiceCoach);
  voiceCoachRef.current = voiceCoach;

  const repEngineRef = useRef(new RepCounterEngine("squats"));

  const handleSelectExercise = (id) => {
    setActiveExercise(id);
    repEngineRef.current.setExercise(id);
    try {
      const saved = JSON.parse(localStorage.getItem("motionsense_exercise_reps") || "{}");
      setExerciseReps(saved[id] || 0);
    } catch {
      setExerciseReps(0);
    }
    setExercisePhase("Ready");
  };

  const handleManualRep = () => {
    const next = exerciseReps + 1;
    setExerciseReps(next);
    if (voiceCoach) announceRep(next);
    pulseHaptic();
    try {
      const saved = JSON.parse(localStorage.getItem("motionsense_exercise_reps") || "{}");
      saved[activeExercise] = next;
      localStorage.setItem("motionsense_exercise_reps", JSON.stringify(saved));
    } catch {}
  };

  const handleResetExerciseReps = () => {
    repEngineRef.current.reset();
    setExerciseReps(0);
    setExercisePhase("Ready");
    try {
      const saved = JSON.parse(localStorage.getItem("motionsense_exercise_reps") || "{}");
      saved[activeExercise] = 0;
      localStorage.setItem("motionsense_exercise_reps", JSON.stringify(saved));
    } catch {}
  };

  // Keep speedRef synced with speed state without resetting loops
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const loadSubjects = useCallback(() => {
    streamApi
      .subjects()
      .then((d) => {
        if (d?.subjects?.length) {
          setSubjects(d.subjects);
          setSubject((curr) => (curr ? curr : String(d.subjects[0].subject)));
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    loadSubjects();
    return () => {
      runningRef.current = false;
      if (replayTimer.current) clearTimeout(replayTimer.current);
      if (deviceTimer.current) clearInterval(deviceTimer.current);
      window.removeEventListener("devicemotion", onMotion, true);
    };
  }, [loadSubjects]);

  // --- Real-Time Phone Sensor Listener & Precision Pedometer ---
  const onMotion = useCallback((event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    const rot = event.rotationRate;
    if (!acc) return;
    const ax = Number(acc.x || 0);
    const ay = Number(acc.y || 0);
    const az = Number(acc.z || 0);
    const now = performance.now();
    const reading = {
      ax,
      ay,
      az,
      gx: Number(rot?.alpha || 0),
      gy: Number(rot?.beta || 0),
      gz: Number(rot?.gamma || 0),
      t: now / 1000,
    };
    setDeviceReadings(reading);
    samplesBuffer.current.push(reading);
    if (samplesBuffer.current.length > 250) {
      samplesBuffer.current.shift();
    }

    // High-precision biomechanical pedometer
    let mag = Math.sqrt(ax * ax + ay * ay + az * az);
    if (mag > 0.05 && mag < 3.5) {
      mag *= 9.80665; // normalize from g to m/s^2 if device reports in g units
    }

    const p = pedometerRef.current;
    if (p.filteredAcc === null) {
      p.filteredAcc = mag;
      p.baselineAcc = mag;
    } else {
      // Single-pole IIR low-pass filter (cutoff ~3.5 Hz to isolate gait from tremor)
      p.filteredAcc = p.filteredAcc * 0.78 + mag * 0.22;
      // Dynamic baseline tracker (tracks phone tilt & orientation shifts)
      p.baselineAcc = p.baselineAcc * 0.985 + p.filteredAcc * 0.015;
    }

    const diff = p.filteredAcc - p.baselineAcc;
    const stepThreshold = 1.15; // m/s^2 (~0.12g impact threshold above gravity baseline)

    if (!p.isPeak) {
      if (diff > stepThreshold) {
        p.isPeak = true;
        p.peakValue = diff;
      }
    } else {
      if (diff > p.peakValue) {
        p.peakValue = diff;
      } else if (diff < 0.25) {
        // Foot strike completed & wave crossed back towards baseline
        p.isPeak = false;
        const timeSinceLast = now - p.lastStepTime;

        if (timeSinceLast >= 240) {
          if (timeSinceLast <= 2200) {
            // Sustained rhythmic stepping cadence: count step immediately
            p.lastStepTime = now;
            setDeviceSteps((s) => s + 1);
          } else {
            // New stepping sequence: require 2-step validation to filter isolated bumps / phone handling
            const timeSinceCandidate = now - p.candidateTime;
            if (p.candidateTime > 0 && timeSinceCandidate >= 240 && timeSinceCandidate <= 2200) {
              p.lastStepTime = now;
              p.candidateTime = 0;
              setDeviceSteps((s) => s + 2);
            } else {
              p.candidateTime = now;
            }
          }
        }
      }
    }

    // Biomechanical Exercise Repetition Tracking (Squats, Jumping Jacks, Chair Stands)
    // Only processed when the user explicitly chooses Workout / Exercise Mode!
    if (workoutModeRef.current) {
      const repResult = repEngineRef.current.processFrame(ax, ay, az, now);
      setExercisePhase(repResult.phase);
      if (Number(repResult.tempoSec) > 0) {
        setExerciseTempo(repResult.tempoSec);
      }

      if (repResult.repCompleted) {
        setExerciseReps(repResult.repCount);
        if (voiceCoachRef.current) {
          announceRep(repResult.repCount);
        }
        pulseHaptic();

        try {
          const saved = JSON.parse(localStorage.getItem("motionsense_exercise_reps") || "{}");
          saved[activeExerciseRef.current] = repResult.repCount;
          localStorage.setItem("motionsense_exercise_reps", JSON.stringify(saved));
        } catch {}
      }
    }
  }, []);

  const startDeviceStream = async () => {
    setError("");
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setError("DeviceMotionEvent is not supported on this browser / device.");
      return;
    }

    // iOS 13+ permission dialog
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== "granted") {
          setError("Motion sensor permission was denied by the browser.");
          return;
        }
      } catch (err) {
        setError("Error requesting sensor permission: " + err.message);
        return;
      }
    }

    samplesBuffer.current = [];
    pedometerRef.current = {
      filteredAcc: null,
      baselineAcc: 9.806,
      lastStepTime: 0,
      candidateTime: 0,
      isPeak: false,
      peakValue: 0,
    };
    window.addEventListener("devicemotion", onMotion, true);
    setDeviceStreaming(true);

    deviceTimer.current = setInterval(async () => {
      if (samplesBuffer.current.length < 5) return;
      // Slice the most recent ~1.3-1.5s of readings (avoids stale sample lag)
      const snapshot = samplesBuffer.current.slice(-80);
      try {
        const res = await predictApi.predictLiveSensor(snapshot);
        if (res?.prediction) {
          recentPreds.current.push(res.prediction.activity);
          if (recentPreds.current.length > 3) recentPreds.current.shift();

          // 3-window majority vote to eliminate single-sample jitter
          const voteCounts = {};
          recentPreds.current.forEach((a) => (voteCounts[a] = (voteCounts[a] || 0) + 1));
          const smoothed = Object.keys(voteCounts).reduce((a, b) => (voteCounts[a] >= voteCounts[b] ? a : b));

          setDevicePrediction({
            ...res.prediction,
            smoothed_activity: smoothed,
          });
          setMotionInfo(res.motion_info || null);
          setDeviceWindowsCount((c) => c + 1);
        }
      } catch (err) {
        console.error("Live sensor inference failed:", err);
      }
    }, 1250);
  };

  const stopDeviceStream = () => {
    window.removeEventListener("devicemotion", onMotion, true);
    if (deviceTimer.current) clearInterval(deviceTimer.current);
    setDeviceStreaming(false);
  };

  // --- Robust Dataset Replay Loop ---
  const startReplay = async (initialOffset = 0) => {
    setError("");
    const offset = typeof initialOffset === "number" ? Math.max(0, initialOffset) : 0;
    setStarting(true);
    if (replayTimer.current) clearTimeout(replayTimer.current);

    try {
      const subjId = Number(subject) || (subjects.length > 0 ? Number(subjects[0].subject) : 0);
      const d = await streamApi.start(subjId, noise, offset, condensed);
      setSession(d.session);
      sessionRef.current = d.session;
      setWindows([]);
      setStats(d.session);
      runningRef.current = true;
      setRunning(true);
      setStarting(false);

      // Dedicated tick loop independent of React renders
      const runReplayTick = async () => {
        if (!runningRef.current || !sessionRef.current) return;
        try {
          const res = await streamApi.next(sessionRef.current.id, 1);
          if (!runningRef.current) return;

          setWindows((prev) => [...prev, ...res.windows].slice(-BUFFER * 2));
          setStats(res.session);

          if (res.session.status !== "active") {
            runningRef.current = false;
            setRunning(false);
            return;
          }
        } catch (err) {
          if (!runningRef.current) return;
          setError(errorMessage(err));
          runningRef.current = false;
          setRunning(false);
          return;
        }

        if (runningRef.current) {
          replayTimer.current = setTimeout(runReplayTick, Math.max(30, Math.round(STEP_MS / (speedRef.current || 4))));
        }
      };

      runReplayTick();
    } catch (e) {
      setError(errorMessage(e));
      runningRef.current = false;
      setRunning(false);
      setStarting(false);
    }
  };

  const seekToOffset = async (offset) => {
    const validOffset = typeof offset === "number" ? Math.max(0, offset) : 0;
    if (!runningRef.current || !sessionRef.current) {
      startReplay(validOffset);
      return;
    }
    try {
      await streamApi.seek(sessionRef.current.id, validOffset);
      setWindows([]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const stopReplay = async () => {
    runningRef.current = false;
    setRunning(false);
    if (replayTimer.current) clearTimeout(replayTimer.current);
    if (sessionRef.current) {
      await streamApi.stop(sessionRef.current.id).catch(() => { });
    }
    setStats((s) => (s ? { ...s, status: "stopped" } : null));
  };

  const latest = windows[windows.length - 1];
  const visible = windows.slice(-BUFFER);
  const subj = subjects.find((s) => String(s.subject) === subject);

  return (
    <>
      <PageHeader
        title="Live Monitor"
        description="Classify human activity in real time — using your phone's physical motion sensors or replaying UCI HAR test recordings."
      />

      {/* Mode Switcher */}
      <div className="mb-6 flex gap-2 border-b border-line pb-3">
        <button
          onClick={() => {
            stopReplay();
            setMonitorMode("device");
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${monitorMode === "device" ? "bg-accent text-white shadow-sm" : "bg-card text-ink-2 hover:text-ink border border-line"
            }`}
        >
          <Smartphone className="h-4 w-4" />
          📱 My Phone Real Sensors
        </button>
        <button
          onClick={() => {
            stopDeviceStream();
            setMonitorMode("replay");
            if (subjects.length === 0) loadSubjects();
          }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${monitorMode === "replay" ? "bg-accent text-white shadow-sm" : "bg-card text-ink-2 hover:text-ink border border-line"
            }`}
        >
          <Radio className="h-4 w-4" />
          📼 Dataset Replay Simulator
        </button>
      </div>

      <div className="mb-4">
        <Alert>{error}</Alert>
      </div>

      {monitorMode === "device" ? (
        /* Real Device Sensors View */
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">Physical Phone Motion Stream</h3>
                <p className="text-xs text-ink-2">
                  Captures real-time accelerometer and gyroscope motion directly from your phone's hardware.
                </p>
              </div>
              <div>
                {!deviceStreaming ? (
                  <Button onClick={startDeviceStream} className="w-full sm:w-auto">
                    <Play className="h-4 w-4" />
                    Start Phone Tracking
                  </Button>
                ) : (
                  <Button variant="danger" onClick={stopDeviceStream} className="w-full sm:w-auto">
                    <Square className="h-4 w-4" />
                    Stop Phone Tracking
                  </Button>
                )}
              </div>
            </div>

            {/* Tracking Mode Switcher: User Chooses Normal Activity vs Workout Mode */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">Mode:</span>
                <div className="inline-flex rounded-lg border border-line bg-page p-1">
                  <button
                    type="button"
                    onClick={() => setWorkoutMode(false)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      !workoutMode
                        ? "bg-white text-ink shadow-xs border border-line/60"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    <Footprints className="h-3.5 w-3.5 text-accent" />
                    <span>🚶 Normal Activity Mode (Default)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWorkoutMode(true)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      workoutMode
                        ? "bg-accent text-white shadow-xs"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    <Dumbbell className="h-3.5 w-3.5" />
                    <span>🏋️ Exercise / Workout Mode</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-muted">
                {!workoutMode
                  ? "Standard: Pedometer, gait, sitting, standing, and running"
                  : "Active: Counting squats, jumping jacks, chair-stands & tempo"}
              </div>
            </div>

            {/* Real-Time Exercise Repetition Counter & Form Coach (Rendered only when Workout Mode is chosen) */}
            {workoutMode ? (
              <div className="mt-5 rounded-xl border border-accent/40 bg-accent/5 p-4 shadow-xs ring-1 ring-accent/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                        <Dumbbell className="h-3.5 w-3.5" /> Biomechanical Rep Counter
                      </span>
                      <span className="text-xs text-muted">Workout Mode Active</span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-ink">
                      Smart Exercise Repetition & Form Coach
                    </h3>
                  </div>

                  {/* Voice Coach Toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVoiceCoach((v) => !v)}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-page hover:text-ink cursor-pointer"
                    >
                      {voiceCoach ? <Volume2 className="h-3.5 w-3.5 text-accent" /> : <VolumeX className="h-3.5 w-3.5 text-muted" />}
                      <span>Voice Coach: {voiceCoach ? "On" : "Off"}</span>
                    </button>
                  </div>
                </div>

                {/* Exercise Selector Pills */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {EXERCISES.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => handleSelectExercise(ex.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                        activeExercise === ex.id
                          ? "bg-side text-white shadow-xs"
                          : "border border-line bg-white text-ink-2 hover:bg-page hover:text-ink"
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 text-[11px] text-muted italic">
                  💡 {EXERCISES.find((e) => e.id === activeExercise)?.hint}
                </div>

                {/* Rep Count & Live Motion Phase Grid */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {/* Reps Display */}
                  <div className="rounded-lg border border-accent/40 bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-accent">Completed Reps</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleManualRep}
                          className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-2xs hover:bg-accent-dark active:scale-95 cursor-pointer"
                          title="Simulate / Add rep"
                        >
                          + Rep
                        </button>
                        {exerciseReps > 0 && (
                          <button
                            type="button"
                            onClick={handleResetExerciseReps}
                            className="text-[10px] text-muted hover:text-ink cursor-pointer"
                            title="Reset counter"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 font-mono text-3xl font-extrabold text-ink">
                      {exerciseReps}
                    </div>
                  </div>

                  {/* Live Phase */}
                  <div className="rounded-lg border border-line bg-white p-3.5">
                    <span className="text-xs font-medium text-ink-2">Motion Phase</span>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-page px-2.5 py-1 text-xs font-semibold text-ink">
                      {exercisePhase}
                    </div>
                  </div>

                  {/* Tempo */}
                  <div className="rounded-lg border border-line bg-white p-3.5">
                    <span className="text-xs font-medium text-ink-2">Rep Tempo / TUT</span>
                    <div className="mt-1 font-mono text-2xl font-bold text-ink">
                      {exerciseTempo} <span className="text-xs font-normal text-muted">s / rep</span>
                    </div>
                  </div>

                  {/* Est. Energy Burn */}
                  <div className="rounded-lg border border-line bg-white p-3.5">
                    <span className="text-xs font-medium text-ink-2">Est. Work Calories</span>
                    <div className="mt-1 font-mono text-2xl font-bold text-amber-600">
                      {Math.round(exerciseReps * 0.42 * 10) / 10} <span className="text-xs font-normal text-muted">kcal</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Normal Activity Mode Banner */
              <div className="mt-4 flex items-center justify-between rounded-xl border border-line/70 bg-page/60 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-ink-2">
                  <span className="h-2 w-2 rounded-full bg-good" />
                  <span>
                    Active in <b>Normal Activity Mode</b> — classifies walking, running, stairs, sitting, and standing.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkoutMode(true)}
                  className="flex items-center gap-1 font-semibold text-accent hover:underline cursor-pointer"
                >
                  <Dumbbell className="h-3.5 w-3.5" />
                  <span>Switch to Exercise Rep Mode</span>
                </button>
              </div>
            )}

            {/* Live Readout Gauges */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="col-span-2 sm:col-span-1 rounded-lg border border-accent/40 bg-accent/10 p-3 ring-1 ring-accent/30 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-accent flex items-center gap-1.5">
                    <Footprints className="h-4 w-4" /> Steps Count
                  </span>
                  {deviceSteps > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeviceSteps(0);
                        pedometerRef.current = { filteredAcc: null, baselineAcc: 9.806, lastStepTime: 0, candidateTime: 0, isPeak: false, peakValue: 0 };
                      }}
                      className="text-[10px] text-accent/80 hover:text-accent underline font-medium cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-ink">{deviceSteps.toLocaleString()}</span>
                  <span className="text-[10px] text-ink-2 font-mono">
                    (~{((deviceSteps * 0.75) / 1000).toFixed(2)} km)
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-3">
                <span className="text-xs text-ink-2">Motion State</span>
                <div className="mt-1 flex items-center gap-2 font-semibold">
                  {deviceStreaming && (
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${motionInfo?.is_moving ? "bg-good-text animate-pulse" : "bg-warning"
                        }`}
                    />
                  )}
                  <span className="text-sm">
                    {deviceStreaming
                      ? motionInfo?.is_moving
                        ? "Active (Moving)"
                        : "Stationary (Idle)"
                      : "Inactive"}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-3">
                <span className="text-xs text-ink-2">Gravity Pose</span>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {motionInfo?.target_class
                    ? activityLabel(motionInfo.target_class)
                    : "Calibrating..."}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-3">
                <span className="text-xs text-ink-2">Cadence (Step Rate)</span>
                <div className="mt-1 font-mono text-xs font-semibold text-ink">
                  {motionInfo?.step_freq ? `${motionInfo.step_freq} steps/s` : "0.0 steps/s"}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-3">
                <span className="text-xs text-ink-2">Impact Intensity</span>
                <div className="mt-1 font-mono text-xs font-semibold text-ink">
                  {motionInfo?.body_max ? `${motionInfo.body_max} g` : "0.00 g"}
                </div>
              </div>
            </div>
          </Card>

          {/* Real-time Classification Results */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Current Live Activity" subtitle="Real-time Conv1D + LSTM inference" className="lg:col-span-1">
              {devicePrediction ? (
                <>
                  <div className="flex items-center justify-between">
                    <ActivityBadge activity={devicePrediction.smoothed_activity || devicePrediction.activity} size="lg" />
                    <span className="tabular text-2xl font-semibold">{pct(devicePrediction.confidence)}</span>
                  </div>
                  <div className="mt-3 text-xs text-ink-2">
                    Inference latency: <b className="text-ink">{devicePrediction.latency_ms} ms</b> · Smoothed: <b className="text-ink">{activityLabel(devicePrediction.smoothed_activity || devicePrediction.activity)}</b>
                  </div>
                  <div className="mt-5">
                    <ProbabilityBars probabilities={devicePrediction.probabilities} highlight={devicePrediction.smoothed_activity || devicePrediction.activity} />
                  </div>
                </>
              ) : (
                <Empty icon={Smartphone} title={deviceStreaming ? "Buffering initial sensor samples..." : "Phone tracking stopped"}>
                  {deviceStreaming
                    ? "Keep moving or hold position. First prediction arrives in ~2 seconds."
                    : "Tap 'Start Phone Tracking' above to start classifying your movements."}
                </Empty>
              )}
            </Card>

            <div className="lg:col-span-2">
              {workoutMode ? (
                <ExerciseGuide
                  activeExerciseId={activeExercise}
                  onSelectExercise={handleSelectExercise}
                />
              ) : (
                <Card
                  title="Activity Testing Guide"
                  subtitle="How each of the 7 daily activities is detected"
                  action={
                    <button
                      type="button"
                      onClick={() => setWorkoutMode(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline cursor-pointer"
                    >
                      <Dumbbell className="h-3.5 w-3.5" />
                      <span>View Exercise Guide</span>
                    </button>
                  }
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-lg border border-line p-3">
                      <b className="text-ink">🏃 Running (Fast Cadence)</b>
                      <p className="mt-1 text-ink-2">Run or jog in place with high step rate (&gt; 2.25 steps/s) and energetic dynamic acceleration.</p>
                    </div>
                    <div className="rounded-lg border border-line p-3">
                      <b className="text-ink">🚶 Walking (Normal)</b>
                      <p className="mt-1 text-ink-2">Walk across the room at normal pace. Rhythmic stepping (1.6–2.2 steps/s) triggers regular walking.</p>
                    </div>
                    <div className="rounded-lg border border-line p-3">
                      <b className="text-ink">🪜 Walking Upstairs</b>
                      <p className="mt-1 text-ink-2">Step upstairs with deliberate upward body lifting motion against gravity.</p>
                    </div>
                    <div className="rounded-lg border border-line p-3">
                      <b className="text-ink">🪜 Walking Downstairs</b>
                      <p className="mt-1 text-ink-2">Step downstairs with firm downward landing impacts.</p>
                    </div>
                    <div className="rounded-lg border border-line p-3">
                      <b className="text-ink">🪑 Sitting</b>
                      <p className="mt-1 text-ink-2">Sit in a chair/sofa and hold the phone at a natural reading angle (35°–65°) or rest on your lap.</p>
                    </div>
                    <div className="rounded-lg border border-line p-3">
                      <b className="text-ink">🧍 Standing</b>
                      <p className="mt-1 text-ink-2">Stand upright with the phone held vertically in hand or upright in your front pocket.</p>
                    </div>
                    <div className="rounded-lg border border-line p-3 sm:col-span-2">
                      <b className="text-ink">🛌 Laying</b>
                      <p className="mt-1 text-ink-2">Place the phone flat on a table, bed, or desk (screen facing up or down).</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Original Dataset Replay View */
        <>
          <Card className="mb-6" bodyClass="flex flex-col gap-4">
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Test subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={running}>
                {subjects.map((s) => (
                  <option key={s.subject} value={s.subject}>
                    {s.name || `Subject ${s.subject} · ${s.windows} windows (${Math.round(s.duration_s / 60)} min)`}
                  </option>
                ))}
              </Select>
              <Select label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={1}>1× real time (1.28 s / window)</option>
                <option value={2}>2× (640 ms)</option>
                <option value={4}>4× Fast (320 ms) · Recommended</option>
                <option value={8}>8× Super Fast (160 ms)</option>
                <option value={16}>16× Ultra Fast (80 ms)</option>
              </Select>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                Sensor noise (σ = {noise.toFixed(2)})
                <input type="range" min={0} max={0.3} step={0.01} value={noise} disabled={running} onChange={(e) => setNoise(Number(e.target.value))} className="mt-2.5 accent-accent" />
              </label>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-line">
              <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={condensed}
                  disabled={running}
                  onChange={(e) => setCondensed(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                />
                <span>⚡ Fast Cycle Replay (Auto-transitions after ~6 windows/activity for rapid demo)</span>
              </label>
              <div className="flex gap-2">
                {!running ? (
                  <>
                    <Button onClick={() => startReplay(0)} disabled={subjects.length === 0} loading={starting}>
                      {session ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {session ? "Restart stream" : "Start stream"}
                    </Button>
                    {subjects.length === 0 && (
                      <Button variant="secondary" onClick={loadSubjects}>
                        <RotateCcw className="h-4 w-4" />
                        Reload Subjects
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="danger" onClick={stopReplay}>
                    <Square className="h-4 w-4" />
                    Stop stream
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {subj && (
            <div className="mb-6 rounded-xl border border-line bg-card p-4 shadow-2xs">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">
                    {subj.subject === 0 ? "⚡ Quick Demo (All 7 Activities Sequence)" : `Subject ${subj.subject} Recording Sequence & Activity Jump`}
                  </h4>
                  <p className="mt-0.5 text-xs text-muted">
                    {subj.subject === 0
                      ? "High-accuracy curated showcase across all 7 activities (6 windows each). Click any activity button to jump straight to it:"
                      : "Click any activity below to instantly jump to that segment with zero lag:"}
                  </p>
                </div>
              </div>

              {/* Segment Jump Buttons */}
              <div className="mt-3 flex flex-wrap gap-2">
                {(subj.segments || []).map((seg, idx) => {
                  const isCurrent =
                    latest && latest.seq >= seg.start_seq && latest.seq < seg.end_seq;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => seekToOffset(seg.start_seq)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${isCurrent
                          ? "border-accent bg-accent/10 text-accent font-semibold ring-2 ring-accent/30 shadow-xs"
                          : "border-line bg-page text-ink-2 hover:border-ink-2 hover:text-ink hover:bg-white"
                        }`}
                      title={`Jump to window #${seg.start_seq + 1} (${seg.start_s}s)`}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: activityColor(seg.activity) }}
                      />
                      <span>{activityLabel(seg.activity)}</span>
                      <span className="text-[10px] text-muted font-mono">
                        {seg.start_s}s ({seg.count}w)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile
              label="Status"
              value={
                <span className="flex items-center gap-2 text-lg">
                  {running && <span className="live-dot h-2.5 w-2.5 rounded-full bg-critical" />}
                  {running ? "Streaming" : stats?.status === "completed" ? "Completed" : session ? (stats?.status === "stopped" ? "Stopped" : "Paused") : "Idle"}
                </span>
              }
              hint={session ? `Subject ${session.subject}` : "Start a stream"}
              icon={Radio}
            />
            <StatTile
              label="Steps Count"
              value={`${(stats?.total_steps ?? 0).toLocaleString()} steps`}
              hint={stats?.total_steps ? `~${(((stats.total_steps || 0) * 0.75) / 1000).toFixed(2)} km` : "Walking & running steps"}
              icon={Footprints}
            />
            <StatTile label="Windows processed" value={stats?.windows ?? 0} hint={stats ? `${pct(stats.progress, 0)} of recording` : "—"} />
            <StatTile label="Running accuracy" value={pct(stats?.accuracy)} hint="vs. ground-truth labels" />
            <StatTile label="Simulated time" value={latest ? `${Math.round(latest.t + 2.56)} s` : "0 s"} hint={latest ? `${latest.latency_ms} ms inference / window` : "—"} />
          </div>

          {stats && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-label="Recording progress">
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${stats.progress * 100}%` }} />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Current activity" subtitle={latest ? `Window #${latest.seq + 1} · t = ${latest.t}s` : "No window yet"}>
              {latest ? (
                <>
                  <div className="flex items-center justify-between">
                    <ActivityBadge activity={latest.activity} size="lg" />
                    <span className="tabular text-2xl font-semibold">{pct(latest.confidence)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
                    <span>
                      Smoothed: <b className="font-medium text-ink">{activityLabel(latest.smoothed_activity)}</b>
                    </span>
                    <span>
                      Window Steps: <b className="font-medium text-ink">+{latest.steps ?? 0}</b>
                    </span>
                    <span className="flex items-center gap-1">
                      Truth: <b className="font-medium text-ink">{activityLabel(latest.true_label)}</b>
                      {latest.activity === latest.true_label ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-good-text" aria-label="correct" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-critical" aria-label="incorrect" />
                      )}
                    </span>
                  </div>
                  <div className="mt-5">
                    <ProbabilityBars probabilities={latest.probabilities} highlight={latest.activity} />
                  </div>
                </>
              ) : (
                <Empty icon={Radio} title="Stream not started">
                  Choose a subject and press Start. Predictions appear here every 1.28 s of simulated time.
                </Empty>
              )}
            </Card>

            <div className="space-y-6 lg:col-span-2">
              <SignalChart
                data={visible}
                title="Body acceleration · standard deviation"
                subtitle="Motion intensity per axis (normalised −1 … 1)"
                keys={{ x: "body_acc_std_x", y: "body_acc_std_y", z: "body_acc_std_z" }}
                domain={[-1, 1]}
              />
              <SignalChart
                data={visible}
                title="Gravity acceleration · mean"
                subtitle="Phone orientation per axis — separates laying from sitting/standing"
                keys={{ x: "gravity_x", y: "gravity_y", z: "gravity_z" }}
                domain={[-1, 1]}
              />
            </div>
          </div>

          <div className="mt-6">
            <Timeline windows={windows} />
          </div>
        </>
      )}
    </>
  );
}

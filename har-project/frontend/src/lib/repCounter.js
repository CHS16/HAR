/**
 * Biomechanical Exercise Repetition Detector
 * Multi-exercise Finite State Machine (FSM) for phone accelerometers.
 *
 * Supports:
 * - SQUATS: Eccentric descent dip, bottom turnaround, concentric upward drive, top lockout
 * - JUMPING_JACKS: High-intensity ballistic jump cycles
 * - CHAIR_STANDS: Sit-to-stand and stand-to-sit transitions for mobility
 * - GENERAL: Adaptive peak-to-valley inflection detection
 */

export const EXERCISES = [
  {
    id: "squats",
    label: "Squats",
    minDurationMs: 800,
    maxDurationMs: 5000,
    refractoryMs: 600,
    hint: "Keep phone in front pocket (best) or held flat against chest",
  },
  {
    id: "jumping_jacks",
    label: "Jumping Jacks",
    minDurationMs: 400,
    maxDurationMs: 2200,
    refractoryMs: 350,
    hint: "Hold phone firmly in hand or wear in pocket / armband",
  },
  {
    id: "chair_stands",
    label: "Chair Stands (Sit-to-Stand)",
    minDurationMs: 900,
    maxDurationMs: 5000,
    refractoryMs: 700,
    hint: "Sit on a sturdy chair, place phone in pocket, stand up fully",
  },
  {
    id: "general",
    label: "General Reps",
    minDurationMs: 600,
    maxDurationMs: 4500,
    refractoryMs: 500,
    hint: "Rhythmic cyclical movement (curls, lunges, presses)",
  },
];

export class RepCounterEngine {
  constructor(exerciseType = "squats") {
    this.setExercise(exerciseType);
    this.reset();
  }

  setExercise(type) {
    this.exercise = EXERCISES.find((e) => e.id === type) || EXERCISES[0];
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.state = "IDLE"; // IDLE, DESCENDING, BOTTOM, ASCENDING
    this.repStartTime = 0;
    this.lastRepTime = 0;
    this.lastRepDurationMs = 0;
    this.filteredMag = 9.806;
    this.baselineMag = 9.806;
    this.minDip = 0;
    this.maxDrive = 0;
    this.phaseFeedback = "Ready";
    this.isGUnits = null; // Latched unit detector to prevent mid-descent scaling glitches
    this.sampleCount = 0;
  }

  /**
   * Process a single raw accelerometer frame.
   * @param {number} ax Accelerometer X in m/s^2 or g
   * @param {number} ay Accelerometer Y in m/s^2 or g
   * @param {number} az Accelerometer Z in m/s^2 or g
   * @param {number} now Timestamp in ms
   * @returns {{ repCount: number, repCompleted: boolean, phase: string, durationMs: number, tempoSec: string }}
   */
  processFrame(ax, ay, az, now) {
    let mag = Math.sqrt(ax * ax + ay * ay + az * az);

    // Unit detection latch: detects if device sends g units (~1.0) vs m/s^2 (~9.8)
    // Latched so low-acceleration unweighting doesn't spuriously multiply mid-rep
    this.sampleCount++;
    if (this.isGUnits === null && this.sampleCount < 40 && mag > 0.1) {
      if (mag < 3.2) {
        this.isGUnits = true;
      } else if (mag > 6.0) {
        this.isGUnits = false;
      }
    }

    if (this.isGUnits === true) {
      mag *= 9.80665;
    }

    // Adaptive smoothing filter
    // Jumps require fast tracking (alpha 0.28), squats require smooth filtering (alpha 0.10)
    const alpha = this.exercise.id === "jumping_jacks" ? 0.28 : 0.10;
    this.filteredMag = this.filteredMag * (1 - alpha) + mag * alpha;

    // Slow baseline tracker (tracks static gravity & gradual tilt)
    this.baselineMag = this.baselineMag * 0.992 + this.filteredMag * 0.008;

    const diff = this.filteredMag - this.baselineMag;
    let repCompleted = false;

    if (this.exercise.id === "squats") {
      repCompleted = this._processSquat(diff, now);
    } else if (this.exercise.id === "jumping_jacks") {
      repCompleted = this._processJumpingJack(diff, now);
    } else if (this.exercise.id === "chair_stands") {
      repCompleted = this._processChairStand(diff, now);
    } else {
      repCompleted = this._processGeneral(diff, now);
    }

    return {
      repCount: this.reps,
      repCompleted,
      phase: this.phaseFeedback,
      durationMs: this.lastRepDurationMs,
      tempoSec: (this.lastRepDurationMs / 1000).toFixed(1),
    };
  }

  _processSquat(diff, now) {
    // Squat dip threshold ~ -0.85 m/s^2 (unloading as body drops)
    // Squat drive threshold ~ +0.95 m/s^2 (concentric upward push)
    const DIP_THRESH = -0.85;
    const DRIVE_THRESH = 0.95;

    // Anti-bounce refractory check
    if (now - this.lastRepTime < this.exercise.refractoryMs) {
      return false;
    }

    switch (this.state) {
      case "IDLE":
        if (diff < DIP_THRESH) {
          this.state = "DESCENDING";
          this.repStartTime = now;
          this.minDip = diff;
          this.maxDrive = 0;
          this.phaseFeedback = "Going Down ⬇️";
        } else {
          this.phaseFeedback = "Ready";
        }
        break;

      case "DESCENDING":
        if (diff < this.minDip) this.minDip = diff;
        // Turnaround / bottom reached when acceleration unweighting recovers towards baseline
        if (diff > -0.25) {
          this.state = "BOTTOM";
          this.phaseFeedback = "Bottom Turn 🛑";
        }
        // Timeout check (if movement aborted or stalled > 5s)
        if (now - this.repStartTime > this.exercise.maxDurationMs) {
          this.state = "IDLE";
          this.phaseFeedback = "Ready";
        }
        break;

      case "BOTTOM":
        // User pushing up from bottom of squat
        if (diff > DRIVE_THRESH) {
          this.state = "ASCENDING";
          this.maxDrive = diff;
          this.phaseFeedback = "Pushing Up ⬆️";
        }
        if (now - this.repStartTime > this.exercise.maxDurationMs) {
          this.state = "IDLE";
          this.phaseFeedback = "Ready";
        }
        break;

      case "ASCENDING":
        if (diff > this.maxDrive) this.maxDrive = diff;
        // User reaches top of squat & locks out back near baseline
        if (Math.abs(diff) < 0.65) {
          const duration = now - this.repStartTime;
          if (duration >= this.exercise.minDurationMs && duration <= this.exercise.maxDurationMs) {
            this.reps += 1;
            this.lastRepTime = now;
            this.lastRepDurationMs = duration;
            this.state = "IDLE";
            this.phaseFeedback = "Rep Complete! ✅";
            return true;
          }
          this.state = "IDLE";
        }
        break;
    }
    return false;
  }

  _processJumpingJack(diff, now) {
    // Ballistic jump impulse > 2.6 m/s^2 above baseline
    const JUMP_THRESH = 2.6;

    if (now - this.lastRepTime < this.exercise.refractoryMs) {
      return false;
    }

    switch (this.state) {
      case "IDLE":
        if (diff > JUMP_THRESH) {
          this.state = "AIRBORNE";
          this.repStartTime = now;
          this.phaseFeedback = "Jump! ⚡";
        } else {
          this.phaseFeedback = "Ready";
        }
        break;

      case "AIRBORNE":
        // Landing and rebound
        if (diff < 0.6) {
          const duration = now - this.repStartTime;
          if (duration >= this.exercise.minDurationMs) {
            this.reps += 1;
            this.lastRepTime = now;
            this.lastRepDurationMs = duration;
            this.state = "IDLE";
            this.phaseFeedback = "Rep Complete! ✅";
            return true;
          }
          this.state = "IDLE";
        }
        break;
    }
    return false;
  }

  _processChairStand(diff, now) {
    // Sit to stand: forward momentum pitch followed by upward thrust
    const DRIVE_THRESH = 1.0;

    if (now - this.lastRepTime < this.exercise.refractoryMs) {
      return false;
    }

    switch (this.state) {
      case "IDLE":
        if (diff > DRIVE_THRESH) {
          this.state = "STANDING_UP";
          this.repStartTime = now;
          this.phaseFeedback = "Standing Up ⬆️";
        } else {
          this.phaseFeedback = "Seated / Ready";
        }
        break;

      case "STANDING_UP":
        // Stand lockout completed
        if (Math.abs(diff) < 0.55) {
          const duration = now - this.repStartTime;
          if (duration >= this.exercise.minDurationMs && duration <= this.exercise.maxDurationMs) {
            this.reps += 1;
            this.lastRepTime = now;
            this.lastRepDurationMs = duration;
            this.state = "IDLE";
            this.phaseFeedback = "Stand Complete! ✅";
            return true;
          }
          this.state = "IDLE";
        }
        break;
    }
    return false;
  }

  _processGeneral(diff, now) {
    const THRESH = 1.1;

    if (now - this.lastRepTime < this.exercise.refractoryMs) {
      return false;
    }

    switch (this.state) {
      case "IDLE":
        if (diff > THRESH) {
          this.state = "PEAK";
          this.repStartTime = now;
          this.phaseFeedback = "In Motion...";
        }
        break;
      case "PEAK":
        if (diff < 0.4) {
          const duration = now - this.repStartTime;
          if (duration >= this.exercise.minDurationMs && duration <= this.exercise.maxDurationMs) {
            this.reps += 1;
            this.lastRepTime = now;
            this.lastRepDurationMs = duration;
            this.state = "IDLE";
            this.phaseFeedback = "Rep Counted! ✅";
            return true;
          }
          this.state = "IDLE";
        }
        break;
    }
    return false;
  }
}

/**
 * Audio voice feedback using browser Web Speech API
 */
export function announceRep(count) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel(); // Cancel any queued speech to avoid backlog
    const utterance = new SpeechSynthesisUtterance(String(count));
    utterance.rate = 1.25;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Fail silently if browser blocks speech
  }
}

/**
 * Haptic vibration pulse
 */
export function pulseHaptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate([40, 25, 50]);
    } catch {
      // Ignore vibration error
    }
  }
}

/**
 * Age-Adaptive Fitness Targets and Biomechanical Standards.
 * Derived from WHO, CDC STEADI, ACSM, and AHA physical activity guidelines.
 */

export const AGE_TIERS = [
  {
    id: "kids",
    label: "Kids & Teens",
    ageRange: "6 – 17 yrs",
    minAge: 6,
    maxAge: 17,
    defaultAge: 14,
    theme: {
      accent: "#10b981", // Emerald
      light: "#ecfdf5",
      border: "#a7f3d0",
      text: "#065f46",
    },
    tagline: "Active Play, Motor Skills & Bone Density",
    guideline: "WHO Guideline: ≥ 60 min moderate-to-vigorous daily play",
    targets: {
      steps: 11000,
      calories: 450,
      activeMinutes: 60,
      focusName: "Play Jumps & Bursts",
      focusTarget: 40,
      focusUnit: "jumps",
      focusDesc: "Plyometric bursts build lifetime bone mineral density and coordination.",
    },
    biomechanics: {
      maxSafeImpactG: 3.5,
      impactDesc: "High dynamic tolerance (growing bones & elastic joints)",
      targetCadence: "130 – 150 spm",
      focusAdvice: "Encourage games, sports, and outdoor movement over sedentary screen time.",
    },
  },
  {
    id: "young_adult",
    label: "Athletes & Young Adults",
    ageRange: "18 – 39 yrs",
    minAge: 18,
    maxAge: 39,
    defaultAge: 25,
    theme: {
      accent: "#2a78d6", // Royal Blue
      light: "#eff6ff",
      border: "#bfdbfe",
      text: "#1e40af",
    },
    tagline: "Hypertrophy, HIIT & Cardiovascular Power",
    guideline: "ACSM Standard: 150-300 min weekly + 2 strength/resistance days",
    targets: {
      steps: 10000,
      calories: 600,
      activeMinutes: 45,
      focusName: "Squats & Strength Reps",
      focusTarget: 30,
      focusUnit: "reps",
      focusDesc: "Deep squats & TUT build functional leg power and protect knees.",
    },
    biomechanics: {
      maxSafeImpactG: 2.8,
      impactDesc: "Optimal athletic ground reaction tolerance",
      targetCadence: "165 – 180 spm",
      focusAdvice: "Maintain high cadence during running to eliminate knee-straining overstriding.",
    },
  },
  {
    id: "middle_aged",
    label: "Middle-Aged Adults",
    ageRange: "40 – 59 yrs",
    minAge: 40,
    maxAge: 59,
    defaultAge: 48,
    theme: {
      accent: "#f59e0b", // Amber
      light: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
    },
    tagline: "Metabolic Longevity, Posture & Joint Preservation",
    guideline: "AHA Guideline: Regular aerobic exercise reduces cardiovascular risk by 35%",
    targets: {
      steps: 8500,
      calories: 420,
      activeMinutes: 35,
      focusName: "Sedentary Posture Resets",
      focusTarget: 8,
      focusUnit: "breaks",
      focusDesc: "Hourly 1-minute movement breaks interrupt prolonged desk compression.",
    },
    biomechanics: {
      maxSafeImpactG: 2.2,
      impactDesc: "Moderate impact ceiling (joint-friendly cushioning)",
      targetCadence: "115 – 135 spm",
      focusAdvice: "Incorporate regular stair-climbing to boost VO2 max with zero joint shock.",
    },
  },
  {
    id: "senior",
    label: "Seniors & Golden Age",
    ageRange: "60+ yrs",
    minAge: 60,
    maxAge: 100,
    defaultAge: 68,
    theme: {
      accent: "#8b5cf6", // Purple / Violet
      light: "#f5f3ff",
      border: "#ddd6fe",
      text: "#5b21b6",
    },
    tagline: "Functional Independence, Balance & Fall Prevention",
    guideline: "CDC STEADI Protocol: Daily mobility prevents fall-related hospitalizations",
    targets: {
      steps: 6000,
      calories: 280,
      activeMinutes: 25,
      focusName: "Chair-Stand Mobility",
      focusTarget: 12,
      focusUnit: "stands",
      focusDesc: "30-second sit-to-stand repetitions preserve quad strength and balance.",
    },
    biomechanics: {
      maxSafeImpactG: 1.8,
      impactDesc: "Strict joint-protection ceiling to safeguard cartilage & hips",
      targetCadence: "95 – 120 spm",
      focusAdvice: "Focus on stable, symmetrical steps and smooth transitions between sitting and standing.",
    },
  },
];

/**
 * Find tier corresponding to an age.
 */
export function getTierByAge(age) {
  const numericAge = Number(age) || 25;
  if (numericAge < 18) return AGE_TIERS[0];
  if (numericAge <= 39) return AGE_TIERS[1];
  if (numericAge <= 59) return AGE_TIERS[2];
  return AGE_TIERS[3];
}

/**
 * Estimate active calories based on step count, age, and weight.
 * Uses MET standard: kcal = MET * 3.5 * weightKg / 200 * durationMinutes
 */
export function estimateCaloriesBurned(steps, weightKg = 70, age = 28) {
  if (!steps || steps <= 0) return 0;
  // Average stride ~0.75m, ~120 steps/min -> ~133 steps per minute of moderate walking
  const minutes = steps / 115;
  // Base MET ~3.6 for brisk walk, scaled slightly by age-adjusted metabolic efficiency
  const ageFactor = age > 60 ? 0.9 : age < 18 ? 1.12 : 1.0;
  const kcal = ((3.6 * 3.5 * weightKg) / 200) * minutes * ageFactor;
  return Math.round(kcal);
}

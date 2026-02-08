// src/randomizer.js
import crypto from "crypto";

/**
 * Default EC subject buckets used in "main" paper generation.
 * Keep these aligned with whatever you show on UI.
 */
import { EC_SUBJECTS } from "./subjects.js";

export const EC_SUBJECTS_DEFAULT = EC_SUBJECTS;

/* -------------------------
   Deterministic RNG (seeded)
------------------------- */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeedInt(seedStr) {
  const h = crypto.createHash("sha256").update(String(seedStr)).digest();
  return h.readUInt32LE(0);
}

/* -------------------------
   Core: Build plan for MAIN paper
   Returns:
   {
     GE: 10,
     EC: { subject: count, ..., EC_MIXED: remainder },
     total: 65,
     ecTotal: 55,
     meta: {...}
   }
------------------------- */
export function buildMainPaperPlan({
  ecSubjects = EC_SUBJECTS_DEFAULT,
  total = 65,
  geCount = 10,
  minPerSubject = 1,
  maxPerSubject = 5,
  seedStr = "default-seed",
  addMixedBucket = true, // if true, fills remainder into EC_MIXED
} = {}) {
  const ecTotal = total - geCount;
  const n = ecSubjects.length;

  // With min=1, each subject included at least 1.
  const minSum = n * minPerSubject;
  const maxSum = n * maxPerSubject;

  // If EC total is more than maxSum, we must add EC_MIXED (or relax maxPerSubject / add more subjects / allow 0-count subjects)
  const needMixed = ecTotal > maxSum;

  if (ecTotal < minSum) {
    throw new Error(
      `Impossible constraints: EC total=${ecTotal}, subjects=${n}, minSum=${minSum}`
    );
  }

  const rng = mulberry32(makeSeedInt(seedStr));

  // Start each subject with minimum
  const counts = ecSubjects.map(() => minPerSubject);
  let assigned = minSum;

  // How much we can still add without exceeding per-subject max
  const capacity = maxSum - minSum;

  // We only distribute up to capacity; any extra remainder goes to EC_MIXED (if enabled)
  let remaining = Math.min(ecTotal - assigned, capacity);

  // Randomly distribute remaining within caps
  while (remaining > 0) {
    const i = Math.floor(rng() * n);
    if (counts[i] < maxPerSubject) {
      counts[i] += 1;
      remaining -= 1;
      assigned += 1;
    }
  }

  const EC = {};
  for (let i = 0; i < n; i++) EC[ecSubjects[i]] = counts[i];

  const remainder = ecTotal - assigned;

  if (remainder > 0) {
    if (!addMixedBucket) {
      throw new Error(
        `EC total=${ecTotal} exceeds max possible=${maxSum}. Either enable addMixedBucket, increase subjects, or raise maxPerSubject.`
      );
    }
    EC["EC_MIXED"] = remainder;
  }

  return {
    GE: geCount,
    EC,
    total,
    ecTotal,
    meta: {
      seedStr,
      minPerSubject,
      maxPerSubject,
      addMixedBucket,
      note:
        remainder > 0
          ? "EC_MIXED added because EC total exceeded max possible under per-subject cap."
          : "All EC questions allocated within per-subject cap.",
      needMixedBucket: needMixed,
      remainder,
    },
  };
}

/* -------------------------
   What your backend should call
   (matches your import: generateSubjectDistribution)
------------------------- */
export function generateSubjectDistribution(opts = {}) {
  // You can pass seedStr from userId+date to make it "cached but changing daily"
  // Example seed: `${userId}:${yyyy-mm-dd}:main`
  return buildMainPaperPlan(opts);
}

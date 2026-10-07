/**
 * Build multi-leg combos whose product of odds falls in a band (2–5).
 * Always ranked by avgConfidence DESC (highest probability first).
 */

import { BAND_META, oddsBandFromCombined } from './oddsBands.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function comboKey(legs) {
  return legs
    .map((l) => l.matchId)
    .slice()
    .sort((a, b) => a - b)
    .join('-');
}

/** Bounded combinations of size k. */
function eachCombo(arr, k, visit) {
  const n = arr.length;
  if (k <= 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    visit(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i -= 1;
    if (i < 0) break;
    idx[i] += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * Per-band defaults.
 * Higher bands need slightly longer legs (or more of them) so the product can land.
 * tipMin is the floor for the confidence-ranked pool (avoids only ~1.20 favorites).
 */
export function comboOptsForBand(band) {
  switch (String(band)) {
    case '2':
      return { minLegs: 2, maxLegs: 3, poolSize: 14, tipMin: 1.18, tipMax: 2.1 };
    case '3':
      return { minLegs: 2, maxLegs: 4, poolSize: 16, tipMin: 1.28, tipMax: 2.2 };
    case '4':
      return { minLegs: 3, maxLegs: 5, poolSize: 18, tipMin: 1.32, tipMax: 2.25 };
    case '5':
      return { minLegs: 3, maxLegs: 6, poolSize: 20, tipMin: 1.35, tipMax: 2.35 };
    default:
      return { minLegs: 2, maxLegs: 4, poolSize: 12, tipMin: 1.22, tipMax: 2.35 };
  }
}

function byConfidenceThenOdds(a, b) {
  if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
  return a.tipOdds - b.tipOdds;
}

/**
 * @param {Array<{ matchId: number, tipOdds: number, confidenceScore?: number }>} candidates
 * @param {string} band
 * @param {{ minLegs?: number, maxLegs?: number, limit?: number, poolSize?: number, tipMin?: number, tipMax?: number }} [opts]
 */
export function buildCombos(candidates, band, opts = {}) {
  const meta = BAND_META[band];
  if (!meta) return [];
  const defaults = comboOptsForBand(band);
  const minLegs = opts.minLegs ?? defaults.minLegs;
  const maxLegs = opts.maxLegs ?? defaults.maxLegs;
  const limit = opts.limit ?? 8;
  const poolSize = opts.poolSize ?? defaults.poolSize;
  let tipMin = opts.tipMin ?? defaults.tipMin;
  const tipMax = opts.tipMax ?? defaults.tipMax;

  const normalized = (candidates || [])
    .map((c) => ({
      ...c,
      matchId: Number(c.matchId),
      tipOdds: num(c.tipOdds),
      confidenceScore: num(c.confidenceScore) ?? 0,
    }))
    .filter((c) => c.matchId && c.tipOdds != null && c.tipOdds <= tipMax);

  // Confidence-first pool inside the band's tip window; relax tipMin if too few legs.
  let eligible = normalized
    .filter((c) => c.tipOdds >= tipMin)
    .sort(byConfidenceThenOdds);
  if (eligible.length < minLegs) {
    const steps = [0.05, 0.1, 0.15, 0.2];
    for (const step of steps) {
      tipMin = Math.max(1.18, (opts.tipMin ?? defaults.tipMin) - step);
      eligible = normalized
        .filter((c) => c.tipOdds >= tipMin)
        .sort(byConfidenceThenOdds);
      if (eligible.length >= minLegs) break;
    }
  }

  const pool = eligible.slice(0, poolSize);
  if (pool.length < minLegs) return [];

  const seen = new Set();
  const out = [];

  function consider(legs) {
    if (legs.length < minLegs || legs.length > maxLegs) return;
    const ids = new Set(legs.map((l) => l.matchId));
    if (ids.size !== legs.length) return;
    let product = 1;
    let confSum = 0;
    for (const l of legs) {
      product *= l.tipOdds;
      confSum += l.confidenceScore;
    }
    if (oddsBandFromCombined(product) !== band) return;
    const key = comboKey(legs);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      combinedOdds: Number(product.toFixed(3)),
      oddsBand: band,
      avgConfidence: Number((confSum / legs.length).toFixed(2)),
      legs: legs.map((l) => ({ ...l })),
      dist: Math.abs(product - meta.center),
    });
  }

  for (let k = minLegs; k <= maxLegs; k += 1) {
    eachCombo(pool, k, consider);
  }

  // Highest average probability first, then drop any combo that reuses a match.
  out.sort((x, y) => {
    if (y.avgConfidence !== x.avgConfidence) return y.avgConfidence - x.avgConfidence;
    if (x.dist !== y.dist) return x.dist - y.dist;
    return x.combinedOdds - y.combinedOdds;
  });

  const picked = [];
  const usedMatches = new Set();
  for (const combo of out) {
    const ids = combo.legs.map((l) => l.matchId);
    if (ids.some((id) => usedMatches.has(id))) continue;
    picked.push(combo);
    for (const id of ids) usedMatches.add(id);
    if (picked.length >= limit) break;
  }
  return picked;
}

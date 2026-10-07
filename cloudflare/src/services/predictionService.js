import * as store from '../db.js';
import { resolveTipOdds, TRIVIAL_GOAL_TIPS } from './oddsBands.js';
import {
  applyCalibrationToCandidates,
  isFamilyBlocked,
  loadTipCalibration,
  tipFamily,
} from './calibration.js';

export { TRIVIAL_GOAL_TIPS };

const MIN_TIP_PROB = 0.55;
const MAX_TIP_PROB = 0.82;
const MIN_VALUE = 0.05;
const MIN_VALUE_OVERRIDE = 0.08;
const MIN_VALUE_OVERRIDE_PROB = 0.58;
const MIN_DRAW_PROB = 0.4;

const CORE_TIP_LABELS = new Set([
  'HOME_WIN',
  'DRAW',
  'AWAY_WIN',
  'OVER_25',
  'UNDER_25',
  'BTTS_YES',
  'BTTS_NO',
]);

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i += 1) r *= i;
  return r;
}

function poissonP(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

function avg(arr, key) {
  if (!arr.length) return null;
  const vals = arr
    .map((x) => x[key])
    .filter((v) => v != null && v !== '' && !Number.isNaN(Number(v)))
    .map((v) => Number(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function hasCornerSamples(stats, min = 3) {
  const n = stats.filter((s) => s.corners_for != null && s.corners_against != null).length;
  return n >= min;
}

function hasCardSamples(stats, min = 3) {
  const n = stats.filter((s) => s.yellows_for != null && s.yellows_against != null).length;
  return n >= min;
}

/** Blend team rate toward league average when sample is small (w = n/5). */
function blendRate(teamAvg, leagueAvg, n, fullN = 5) {
  if (teamAvg == null && leagueAvg == null) return null;
  if (teamAvg == null) return leagueAvg;
  if (leagueAvg == null) return teamAvg;
  const w = Math.min(1, Math.max(0, n) / fullN);
  return w * teamAvg + (1 - w) * leagueAvg;
}

function strength(teamAvg, leagueAvg, fallback = 1) {
  if (teamAvg == null || !leagueAvg) return fallback;
  return teamAvg / leagueAvg;
}

function buildScoreMatrix(homeXg, awayXg, maxGoals = 8) {
  const homeP = [];
  const awayP = [];
  for (let i = 0; i <= maxGoals; i += 1) {
    homeP[i] = poissonP(i, homeXg);
    awayP[i] = poissonP(i, awayXg);
  }
  const matrix = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = homeP[h] * awayP[a];
      matrix[h][a] = p;
      total += p;
    }
  }
  if (total > 0) {
    for (let h = 0; h <= maxGoals; h += 1) {
      for (let a = 0; a <= maxGoals; a += 1) {
        matrix[h][a] /= total;
      }
    }
  }
  return matrix;
}

function sumMatrix(matrix, predicate) {
  let s = 0;
  for (let h = 0; h < matrix.length; h += 1) {
    for (let a = 0; a < matrix[h].length; a += 1) {
      if (predicate(h, a)) s += matrix[h][a];
    }
  }
  return s;
}

function familyOf(label) {
  if (['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(label)) return '1X2';
  if (
    [
      'OVER_15',
      'UNDER_15',
      'OVER_25',
      'UNDER_25',
      'OVER_35',
      'UNDER_35',
      'BTTS_YES',
      'BTTS_NO',
    ].includes(label)
  ) {
    return 'goles';
  }
  if (
    [
      'HOME_OVER_05',
      'HOME_UNDER_05',
      'HOME_OVER_15',
      'HOME_UNDER_15',
      'HOME_OVER_25',
      'HOME_UNDER_25',
      'HOME_OVER_35',
      'HOME_UNDER_35',
      'AWAY_OVER_05',
      'AWAY_UNDER_05',
      'AWAY_OVER_15',
      'AWAY_UNDER_15',
      'AWAY_OVER_25',
      'AWAY_UNDER_25',
      'AWAY_OVER_35',
      'AWAY_UNDER_35',
    ].includes(label)
  ) {
    return 'goles_equipo';
  }
  if (['CORNERS_OVER_85', 'CORNERS_UNDER_85', 'CORNERS_OVER_95', 'CORNERS_UNDER_95', 'CORNERS_OVER_105', 'CORNERS_UNDER_105'].includes(label)) {
    return 'corners';
  }
  if (
    ['CARDS_OVER_35', 'CARDS_UNDER_35', 'CARDS_OVER_45', 'CARDS_UNDER_45'].includes(label)
  ) {
    return 'cards';
  }
  return 'other';
}

function pickBets(candidates, value, calib = null) {
  const nonTrivial = candidates.filter((c) => !TRIVIAL_GOAL_TIPS.has(c.label));
  const familyOk = (c) => {
    if (!calib) return true;
    const fam = tipFamily(c.label);
    // Block weak families except strong value override (handled later)
    return !isFamilyBlocked(calib, fam);
  };
  const usable = nonTrivial.filter((c) => {
    if (c.prob < MIN_TIP_PROB) return false;
    if (c.prob > MAX_TIP_PROB) return false;
    if (c.label === 'DRAW' && c.prob < MIN_DRAW_PROB) return false;
    if (!familyOk(c)) return false;
    return true;
  });
  const coreFallback = nonTrivial
    .filter((c) => CORE_TIP_LABELS.has(c.label))
    .filter((c) => c.label !== 'DRAW' || c.prob >= MIN_DRAW_PROB)
    .filter((c) => c.prob <= MAX_TIP_PROB)
    .filter(familyOk);
  const pool = usable.length
    ? usable
    : coreFallback.length
      ? coreFallback
      : nonTrivial.filter((c) => CORE_TIP_LABELS.has(c.label));
  const usePool = pool.length ? pool : nonTrivial.length ? nonTrivial : candidates;
  let primary = [...usePool].sort((a, b) => b.prob - a.prob)[0];

  if (
    value.value_market &&
    value.value_edge != null &&
    value.value_edge >= MIN_VALUE_OVERRIDE
  ) {
    const valued = nonTrivial.find((c) => c.label === value.value_market);
    if (
      valued &&
      valued.prob >= MIN_VALUE_OVERRIDE_PROB &&
      valued.prob <= MAX_TIP_PROB &&
      (valued.label !== 'DRAW' || valued.prob >= MIN_DRAW_PROB)
    ) {
      primary = valued;
    }
  }

  const secondary =
    nonTrivial
      .filter((c) => c.label !== primary.label)
      .filter(familyOk)
      .sort((a, b) => b.prob - a.prob)
      .find((c) => familyOf(c.label) !== familyOf(primary.label)) ||
    nonTrivial.find((c) => c.label !== primary.label) ||
    null;

  return { primary, secondary };
}

function impliedProb(odds) {
  const o = Number(odds);
  if (!o || o <= 1) return null;
  return 1 / o;
}

function computeValue(candidates, oddsRow) {
  if (!oddsRow) return { value_edge: null, value_market: null };
  const map = {
    HOME_WIN: oddsRow.home_odds,
    DRAW: oddsRow.draw_odds,
    AWAY_WIN: oddsRow.away_odds,
    OVER_25: oddsRow.over25_odds,
    UNDER_25: oddsRow.under25_odds,
  };
  let best = null;
  for (const c of candidates) {
    const imp = impliedProb(map[c.label]);
    if (imp == null) continue;
    const edge = c.prob - imp;
    if (edge >= MIN_VALUE && (!best || edge > best.edge)) {
      best = { edge, market: c.label };
    }
  }
  return best
    ? { value_edge: Number(best.edge.toFixed(4)), value_market: best.market }
    : { value_edge: null, value_market: null };
}

export async function predictMatch(db, matchId) {
  const match = await store.findMatchById(db, matchId);
  if (!match) throw new Error(`Partido ${matchId} no encontrado`);

  const homeStats = await store.lastNForTeam(db, match.homeTeam.id, 5);
  const awayStats = await store.lastNForTeam(db, match.awayTeam.id, 5);
  const league = await store.leagueGoalAverages(db, match.leagueId);

  const nHome = homeStats.length;
  const nAway = awayStats.length;

  const homeScored = blendRate(avg(homeStats, 'goals_scored'), league.avgScored, nHome);
  const homeConceded = blendRate(avg(homeStats, 'goals_conceded'), league.avgConceded, nHome);
  const awayScored = blendRate(avg(awayStats, 'goals_scored'), league.avgScored, nAway);
  const awayConceded = blendRate(avg(awayStats, 'goals_conceded'), league.avgConceded, nAway);

  const homeAttack = strength(homeScored, league.avgScored);
  const homeDefense = strength(homeConceded, league.avgConceded);
  const awayAttack = strength(awayScored, league.avgScored);
  const awayDefense = strength(awayConceded, league.avgConceded);

  const homeXg = homeAttack * awayDefense * league.avgHomeScored;
  const awayXg = awayAttack * homeDefense * league.avgAwayScored;
  const matrix = buildScoreMatrix(homeXg, awayXg, 8);

  const homeWin = sumMatrix(matrix, (h, a) => h > a);
  const draw = sumMatrix(matrix, (h, a) => h === a);
  const awayWin = sumMatrix(matrix, (h, a) => h < a);
  const over15 = sumMatrix(matrix, (h, a) => h + a > 1);
  const under15 = 1 - over15;
  const over25 = sumMatrix(matrix, (h, a) => h + a > 2);
  const under25 = 1 - over25;
  const over35 = sumMatrix(matrix, (h, a) => h + a > 3);
  const under35 = 1 - over35;
  const bttsYes = sumMatrix(matrix, (h, a) => h > 0 && a > 0);
  const bttsNo = 1 - bttsYes;

  // Team totals (solo goles de ese equipo)
  const homeOver05 = sumMatrix(matrix, (h) => h > 0);
  const homeUnder05 = 1 - homeOver05;
  const homeOver15 = sumMatrix(matrix, (h) => h > 1);
  const homeUnder15 = 1 - homeOver15;
  const homeOver25 = sumMatrix(matrix, (h) => h > 2);
  const homeUnder25 = 1 - homeOver25;
  const homeOver35 = sumMatrix(matrix, (h) => h > 3);
  const homeUnder35 = 1 - homeOver35;
  const awayOver05 = sumMatrix(matrix, (_h, a) => a > 0);
  const awayUnder05 = 1 - awayOver05;
  const awayOver15 = sumMatrix(matrix, (_h, a) => a > 1);
  const awayUnder15 = 1 - awayOver15;
  const awayOver25 = sumMatrix(matrix, (_h, a) => a > 2);
  const awayUnder25 = 1 - awayOver25;
  const awayOver35 = sumMatrix(matrix, (_h, a) => a > 3);
  const awayUnder35 = 1 - awayOver35;

  let cornersOver85 = null;
  let cornersUnder85 = null;
  let cornersOver = null;
  let cornersUnder = null;
  let cornersOver105 = null;
  let cornersUnder105 = null;
  const canUseCorners = hasCornerSamples(homeStats) && hasCornerSamples(awayStats);
  const homeCornersFor = canUseCorners ? avg(homeStats, 'corners_for') : null;
  const awayCornersFor = canUseCorners ? avg(awayStats, 'corners_for') : null;
  const homeCornersAgainst = canUseCorners ? avg(homeStats, 'corners_against') : null;
  const awayCornersAgainst = canUseCorners ? avg(awayStats, 'corners_against') : null;

  if (
    canUseCorners &&
    [homeCornersFor, awayCornersFor, homeCornersAgainst, awayCornersAgainst].every((v) => v != null)
  ) {
    const homeCornerAtt = strength(homeCornersFor, league.avgCornersFor);
    const homeCornerDef = strength(homeCornersAgainst, league.avgCornersAgainst);
    const awayCornerAtt = strength(awayCornersFor, league.avgCornersFor);
    const awayCornerDef = strength(awayCornersAgainst, league.avgCornersAgainst);
    const homeCornersX = homeCornerAtt * awayCornerDef * (league.avgCornersFor || 5);
    const awayCornersX = awayCornerAtt * homeCornerDef * (league.avgCornersFor || 5);
    const totalCornersLambda = homeCornersX + awayCornersX;
    let under85 = 0;
    for (let k = 0; k <= 8; k += 1) under85 += poissonP(k, totalCornersLambda);
    cornersUnder85 = under85;
    cornersOver85 = 1 - under85;
    let under95 = 0;
    for (let k = 0; k <= 9; k += 1) under95 += poissonP(k, totalCornersLambda);
    cornersUnder = under95;
    cornersOver = 1 - under95;
    let under105 = 0;
    for (let k = 0; k <= 10; k += 1) under105 += poissonP(k, totalCornersLambda);
    cornersUnder105 = under105;
    cornersOver105 = 1 - under105;
  }

  let cardsOver35 = null;
  let cardsUnder35 = null;
  let cardsOver45 = null;
  let cardsUnder45 = null;
  const canUseCards = hasCardSamples(homeStats) && hasCardSamples(awayStats);
  const homeYellowsFor = canUseCards ? avg(homeStats, 'yellows_for') : null;
  const awayYellowsFor = canUseCards ? avg(awayStats, 'yellows_for') : null;
  const homeYellowsAgainst = canUseCards ? avg(homeStats, 'yellows_against') : null;
  const awayYellowsAgainst = canUseCards ? avg(awayStats, 'yellows_against') : null;
  const homeFoulsFor = canUseCards ? avg(homeStats, 'fouls_for') : null;
  const awayFoulsFor = canUseCards ? avg(awayStats, 'fouls_for') : null;
  const homeRedsFor = canUseCards ? avg(homeStats, 'reds_for') : null;
  const awayRedsFor = canUseCards ? avg(awayStats, 'reds_for') : null;

  function cardRate(yellows, fouls, reds) {
    let rate = yellows;
    if (fouls != null && !Number.isNaN(fouls)) {
      rate = 0.7 * yellows + 0.3 * (fouls / 6);
    }
    if (reds != null && !Number.isNaN(reds)) {
      rate += 2 * reds; // booking points convention
    }
    return rate;
  }

  if (
    canUseCards &&
    [homeYellowsFor, awayYellowsFor, homeYellowsAgainst, awayYellowsAgainst].every((v) => v != null)
  ) {
    const homeCardsFor = cardRate(homeYellowsFor, homeFoulsFor, homeRedsFor);
    const awayCardsFor = cardRate(awayYellowsFor, awayFoulsFor, awayRedsFor);
    const homeCardAtt = strength(homeCardsFor, league.avgYellowsFor);
    const homeCardDef = strength(homeYellowsAgainst, league.avgYellowsAgainst);
    const awayCardAtt = strength(awayCardsFor, league.avgYellowsFor);
    const awayCardDef = strength(awayYellowsAgainst, league.avgYellowsAgainst);
    const homeCardsX = homeCardAtt * awayCardDef * (league.avgYellowsFor || 2);
    const awayCardsX = awayCardAtt * homeCardDef * (league.avgYellowsFor || 2);
    const totalCardsLambda = homeCardsX + awayCardsX;
    let under35Cum = 0;
    for (let k = 0; k <= 3; k += 1) under35Cum += poissonP(k, totalCardsLambda);
    cardsUnder35 = under35Cum;
    cardsOver35 = 1 - under35Cum;
    let under45Cum = 0;
    for (let k = 0; k <= 4; k += 1) under45Cum += poissonP(k, totalCardsLambda);
    cardsUnder45 = under45Cum;
    cardsOver45 = 1 - under45Cum;
  }

  const candidates = [
    { label: 'HOME_WIN', prob: homeWin },
    { label: 'DRAW', prob: draw },
    { label: 'AWAY_WIN', prob: awayWin },
    { label: 'OVER_15', prob: over15 },
    { label: 'UNDER_15', prob: under15 },
    { label: 'OVER_25', prob: over25 },
    { label: 'UNDER_25', prob: under25 },
    { label: 'OVER_35', prob: over35 },
    { label: 'UNDER_35', prob: under35 },
    { label: 'BTTS_YES', prob: bttsYes },
    { label: 'BTTS_NO', prob: bttsNo },
    { label: 'HOME_OVER_05', prob: homeOver05 },
    { label: 'HOME_UNDER_05', prob: homeUnder05 },
    { label: 'HOME_OVER_15', prob: homeOver15 },
    { label: 'HOME_UNDER_15', prob: homeUnder15 },
    { label: 'HOME_OVER_25', prob: homeOver25 },
    { label: 'HOME_UNDER_25', prob: homeUnder25 },
    { label: 'HOME_OVER_35', prob: homeOver35 },
    { label: 'HOME_UNDER_35', prob: homeUnder35 },
    { label: 'AWAY_OVER_05', prob: awayOver05 },
    { label: 'AWAY_UNDER_05', prob: awayUnder05 },
    { label: 'AWAY_OVER_15', prob: awayOver15 },
    { label: 'AWAY_UNDER_15', prob: awayUnder15 },
    { label: 'AWAY_OVER_25', prob: awayOver25 },
    { label: 'AWAY_UNDER_25', prob: awayUnder25 },
    { label: 'AWAY_OVER_35', prob: awayOver35 },
    { label: 'AWAY_UNDER_35', prob: awayUnder35 },
  ];
  if (cornersOver85 != null && cornersUnder85 != null) {
    candidates.push({ label: 'CORNERS_OVER_85', prob: cornersOver85 });
    candidates.push({ label: 'CORNERS_UNDER_85', prob: cornersUnder85 });
  }
  if (cornersOver != null && cornersUnder != null) {
    candidates.push({ label: 'CORNERS_OVER_95', prob: cornersOver });
    candidates.push({ label: 'CORNERS_UNDER_95', prob: cornersUnder });
  }
  if (cornersOver105 != null && cornersUnder105 != null) {
    candidates.push({ label: 'CORNERS_OVER_105', prob: cornersOver105 });
    candidates.push({ label: 'CORNERS_UNDER_105', prob: cornersUnder105 });
  }
  if (cardsOver35 != null && cardsUnder35 != null) {
    candidates.push({ label: 'CARDS_OVER_35', prob: cardsOver35 });
    candidates.push({ label: 'CARDS_UNDER_35', prob: cardsUnder35 });
  }
  if (cardsOver45 != null && cardsUnder45 != null) {
    candidates.push({ label: 'CARDS_OVER_45', prob: cardsOver45 });
    candidates.push({ label: 'CARDS_UNDER_45', prob: cardsUnder45 });
  }

  const oddsRow = await store.getOddsForMatch(db, matchId);
  const value = computeValue(candidates, oddsRow);
  const calib = await loadTipCalibration(db);
  const calibrated = applyCalibrationToCandidates(candidates, calib);
  const { primary, secondary } = pickBets(calibrated, value, calib);

  let confidence = primary.prob * 100;
  const sampleSize = Math.min(nHome, nAway);
  const dataQuality = sampleSize >= 3 ? 'ok' : 'low';

  const payload = {
    match_id: matchId,
    home_win_prob: Number(homeWin.toFixed(4)),
    draw_prob: Number(draw.toFixed(4)),
    away_win_prob: Number(awayWin.toFixed(4)),
    over15_prob: Number(over15.toFixed(4)),
    under15_prob: Number(under15.toFixed(4)),
    over25_prob: Number(over25.toFixed(4)),
    under25_prob: Number(under25.toFixed(4)),
    over35_prob: Number(over35.toFixed(4)),
    under35_prob: Number(under35.toFixed(4)),
    btts_yes_prob: Number(bttsYes.toFixed(4)),
    btts_no_prob: Number(bttsNo.toFixed(4)),
    home_over05_prob: Number(homeOver05.toFixed(4)),
    home_under05_prob: Number(homeUnder05.toFixed(4)),
    home_over15_prob: Number(homeOver15.toFixed(4)),
    home_under15_prob: Number(homeUnder15.toFixed(4)),
    home_over25_prob: Number(homeOver25.toFixed(4)),
    home_under25_prob: Number(homeUnder25.toFixed(4)),
    home_over35_prob: Number(homeOver35.toFixed(4)),
    home_under35_prob: Number(homeUnder35.toFixed(4)),
    away_over05_prob: Number(awayOver05.toFixed(4)),
    away_under05_prob: Number(awayUnder05.toFixed(4)),
    away_over15_prob: Number(awayOver15.toFixed(4)),
    away_under15_prob: Number(awayUnder15.toFixed(4)),
    away_over25_prob: Number(awayOver25.toFixed(4)),
    away_under25_prob: Number(awayUnder25.toFixed(4)),
    away_over35_prob: Number(awayOver35.toFixed(4)),
    away_under35_prob: Number(awayUnder35.toFixed(4)),
    corners_over85_prob: cornersOver85 != null ? Number(cornersOver85.toFixed(4)) : null,
    corners_under85_prob: cornersUnder85 != null ? Number(cornersUnder85.toFixed(4)) : null,
    corners_over95_prob: cornersOver != null ? Number(cornersOver.toFixed(4)) : null,
    corners_under95_prob: cornersUnder != null ? Number(cornersUnder.toFixed(4)) : null,
    corners_over105_prob: cornersOver105 != null ? Number(cornersOver105.toFixed(4)) : null,
    corners_under105_prob: cornersUnder105 != null ? Number(cornersUnder105.toFixed(4)) : null,
    cards_over35_prob: cardsOver35 != null ? Number(cardsOver35.toFixed(4)) : null,
    cards_under35_prob: cardsUnder35 != null ? Number(cardsUnder35.toFixed(4)) : null,
    cards_over45_prob: cardsOver45 != null ? Number(cardsOver45.toFixed(4)) : null,
    cards_under45_prob: cardsUnder45 != null ? Number(cardsUnder45.toFixed(4)) : null,
    suggested_bet: primary.label,
    secondary_bet: secondary ? secondary.label : null,
    confidence_score: Number(confidence.toFixed(2)),
    value_edge: value.value_edge,
    value_market: value.value_market,
  };

  await store.upsertPrediction(db, payload);
  const tipResolved = resolveTipOdds(payload.suggested_bet, payload, oddsRow);
  const modelProb =
    primary.rawProb != null && Number.isFinite(Number(primary.rawProb))
      ? Number(primary.rawProb)
      : primary.prob;
  await store.upsertTipResult(db, {
    match_id: matchId,
    suggested_bet: payload.suggested_bet,
    confidence_score: payload.confidence_score,
    model_prob: modelProb,
    value_edge: payload.value_edge,
    value_market: payload.value_market,
    tip_odds: tipResolved.tipOdds,
    odds_band: tipResolved.oddsBand,
  });

  const homeCornerAvg = avg(homeStats, 'corners_for');
  const awayCornerAvg = avg(awayStats, 'corners_for');
  const homeYellowAvg = avg(homeStats, 'yellows_for');
  const awayYellowAvg = avg(awayStats, 'yellows_for');
  const homeShotsAvg = avg(homeStats, 'shots_for');
  const awayShotsAvg = avg(awayStats, 'shots_for');

  return {
    match,
    prediction: payload,
    form: {
      home: store.formFromStats(homeStats),
      away: store.formFromStats(awayStats),
    },
    recentAvgs: {
      home: {
        corners: homeCornerAvg != null ? Number(homeCornerAvg.toFixed(1)) : null,
        yellows: homeYellowAvg != null ? Number(homeYellowAvg.toFixed(1)) : null,
        shotsOnTarget: homeShotsAvg != null ? Number(homeShotsAvg.toFixed(1)) : null,
      },
      away: {
        corners: awayCornerAvg != null ? Number(awayCornerAvg.toFixed(1)) : null,
        yellows: awayYellowAvg != null ? Number(awayYellowAvg.toFixed(1)) : null,
        shotsOnTarget: awayShotsAvg != null ? Number(awayShotsAvg.toFixed(1)) : null,
      },
    },
    dataQuality,
    sampleSize,
    xg: { home: Number(homeXg.toFixed(3)), away: Number(awayXg.toFixed(3)) },
    highConfidence: dataQuality === 'ok' && confidence >= 60,
    odds: oddsRow,
  };
}

export async function predictMany(db, matchIds) {
  const results = [];
  for (const id of matchIds) {
    try {
      results.push(await predictMatch(db, id));
    } catch (err) {
      results.push({ matchId: id, error: err.message });
    }
  }
  return results;
}

export async function getPredictionBundle(db, matchId) {
  // Always recompute so form/markets stay honest after history syncs
  return predictMatch(db, matchId);
}

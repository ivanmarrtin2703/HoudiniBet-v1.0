/**
 * Domestic leagues missing from FixtureDownload — via FotMob league API (no key).
 * LaLiga2 (FotMob id 140) → Segunda División (AF/league api_id 141).
 */

import { teamApiId, WINDOW_DAYS, HISTORY_DAYS } from './fixtureDownload.js';

/** FotMob match ids → our api_id namespace (avoid FD 820M / friendlies 830M). */
export const FOTMOB_DOMESTIC_MATCH_BASE = 850000000;

const SEGUNDA = {
  fotmobLeagueId: 140,
  leagueApiId: 141,
  name: 'Segunda División',
  country: 'Spain',
};

/** Crest CDN — FotMob team id (string or number). */
export function fotmobTeamLogoUrl(teamId) {
  const id = String(teamId || '').trim();
  if (!id || !/^\d+$/.test(id)) return null;
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;
}

function toSqlDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function dayStartUtc(offsetDays) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function mapStatus(st) {
  if (!st || st.cancelled) return null;
  if (st.finished) return 'finished';
  if (st.started) return 'live';
  return 'scheduled';
}

function parseScore(match) {
  let home = match.home?.score;
  let away = match.away?.score;
  if ((home == null || away == null) && match.status?.scoreStr) {
    const parts = String(match.status.scoreStr).split(/\s*-\s*/);
    if (parts.length === 2) {
      home = parts[0];
      away = parts[1];
    }
  }
  const h = home != null && home !== '' && !Number.isNaN(Number(home)) ? Number(home) : null;
  const a = away != null && away !== '' && !Number.isNaN(Number(away)) ? Number(away) : null;
  return { homeGoals: h, awayGoals: a };
}

function parseElapsed(st) {
  const short = st?.liveTime?.short;
  if (short != null && String(short).trim() !== '') {
    const m = String(short).match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function mapMatch(match) {
  const status = mapStatus(match.status);
  if (!status) return null;
  const homeName = String(match.home?.name || '').trim();
  const awayName = String(match.away?.name || '').trim();
  if (!homeName || !awayName) return null;
  const matchDate = toSqlDate(match.status?.utcTime);
  if (!matchDate) return null;
  const { homeGoals, awayGoals } = parseScore(match);
  if (status === 'finished' && (homeGoals == null || awayGoals == null)) return null;
  const fmId = Number(match.id);
  if (!Number.isFinite(fmId) || fmId <= 0) return null;

  return {
    leagueApiId: SEGUNDA.leagueApiId,
    leagueName: SEGUNDA.name,
    country: SEGUNDA.country,
    matchDate,
    status,
    homeName,
    awayName,
    homeGoals: status === 'finished' || status === 'live' ? homeGoals : null,
    awayGoals: status === 'finished' || status === 'live' ? awayGoals : null,
    elapsed_minute: status === 'live' ? parseElapsed(match.status) : null,
    api_id: FOTMOB_DOMESTIC_MATCH_BASE + fmId,
    homeTeamApiId: teamApiId(SEGUNDA.leagueApiId, homeName),
    awayTeamApiId: teamApiId(SEGUNDA.leagueApiId, awayName),
    homeLogoUrl: fotmobTeamLogoUrl(match.home?.id),
    awayLogoUrl: fotmobTeamLogoUrl(match.away?.id),
  };
}

/**
 * @returns {{ fixtures: object[], errors: object[] }}
 */
export async function fetchSegundaFixtures() {
  const errors = [];
  const url = `https://www.fotmob.com/api/data/leagues?id=${SEGUNDA.fotmobLeagueId}`;
  let data;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HoudiniBet/1.0',
      },
    });
    if (!res.ok) throw new Error(`FotMob LaLiga2 ${res.status}`);
    data = await res.json();
  } catch (err) {
    return { fixtures: [], errors: [{ source: 'laliga2', error: err.message }] };
  }

  const all = data?.fixtures?.allMatches;
  if (!Array.isArray(all) || !all.length) {
    return { fixtures: [], errors: [{ source: 'laliga2', error: 'no fixtures' }] };
  }

  const from = dayStartUtc(-HISTORY_DAYS);
  const to = dayStartUtc(WINDOW_DAYS);
  to.setUTCHours(23, 59, 59, 999);

  const fixtures = [];
  for (const match of all) {
    const mapped = mapMatch(match);
    if (!mapped) continue;
    const d = new Date(String(mapped.matchDate).endsWith('Z') ? mapped.matchDate : `${mapped.matchDate}Z`);
    if (Number.isNaN(d.getTime()) || d < from || d > to) continue;
    // Upcoming: scheduled/live in window; history: finished in lookback
    if (mapped.status === 'finished' && d >= dayStartUtc(0)) {
      // finished today still useful
    }
    fixtures.push(mapped);
  }

  const byId = new Map();
  for (const fx of fixtures) byId.set(fx.api_id, fx);
  return { fixtures: [...byId.values()], errors };
}

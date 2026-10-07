import * as store from '../db.js';
import { predictMany } from './predictionService.js';
import { fitTipCalibration } from './calibration.js';
import {
  fetchAllWindowFixtures,
  fetchTodayFixtures,
  teamApiId,
  WINDOW_DAYS,
  HISTORY_DAYS,
} from './fixtureDownload.js';
import { fetchInternationalFixtures, fetchFotmobLiveSnapshot } from './fotmobInternationals.js';
import { fetchSegundaFixtures } from './fotmobDomestic.js';
import { clubLogoUrl, flagLogoForTeamName, resolveTeamLogoUrl } from './teamLogos.js';

/** API-Football league ids for national-team competitions (not club leagues). */
const INTERNATIONAL_LEAGUE_IDS = [
  10, // Friendlies (selecciones)
  5, // UEFA Nations League
];

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getLeagueIds(env) {
  return (env.LEAGUE_IDS || '140,141,39,135,78,61,5,2,3')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter(Boolean);
}

function dateOffsets(fromOffset, toOffset) {
  const dates = [];
  for (let i = fromOffset; i <= toOffset; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

function isInternationalFixture(item) {
  const name = String(item.league?.name || '');
  const country = String(item.league?.country || '');
  const id = Number(item.league?.id);
  if (/Friendlies Clubs|Club Friendlies/i.test(name)) return false;
  if (INTERNATIONAL_LEAGUE_IDS.includes(id)) return true;
  if (country === 'World' && /^Friendlies$/i.test(name)) return true;
  if (country === 'World' && /^UEFA Nations League/i.test(name)) return true;
  return false;
}

function mapStatus(short) {
  if (!short) return 'scheduled';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'HT'].includes(short)) return 'live';
  return 'scheduled';
}

async function apiGet(env, path, params = {}) {
  const url = new URL(`https://v3.football.api-sports.io${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': env.API_FOOTBALL_KEY || '' },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  return res.json();
}

async function upsertTeamsAndLeague(db, item) {
  const leagueId = await store.upsertLeague(db, {
    name: item.league.name,
    country: item.league.country,
    logo_url: item.league.logo,
    api_id: item.league.id,
  });
  const homeId = await store.upsertTeam(db, {
    name: item.teams.home.name,
    logo_url: item.teams.home.logo,
    league_id: leagueId,
    api_id: item.teams.home.id,
  });
  const awayId = await store.upsertTeam(db, {
    name: item.teams.away.name,
    logo_url: item.teams.away.logo,
    league_id: leagueId,
    api_id: item.teams.away.id,
  });
  return { leagueId, homeId, awayId };
}

async function saveFixture(db, item) {
  const { leagueId, homeId, awayId } = await upsertTeamsAndLeague(db, item);
  const status = mapStatus(item.fixture.status.short);
  const matchId = await store.upsertFixture(db, {
    league_id: leagueId,
    home_team_id: homeId,
    away_team_id: awayId,
    match_date: item.fixture.date.replace('T', ' ').slice(0, 19),
    status,
    home_goals: item.goals.home,
    away_goals: item.goals.away,
    api_id: item.fixture.id,
  });

  if (status === 'finished' && item.goals.home != null && item.goals.away != null) {
    const matchDate = item.fixture.date.replace('T', ' ').slice(0, 19);
    await store.upsertStat(db, {
      team_id: homeId,
      match_id: matchId,
      goals_scored: item.goals.home,
      goals_conceded: item.goals.away,
      corners_for: null,
      corners_against: null,
      is_home: true,
      match_date: matchDate,
    });
    await store.upsertStat(db, {
      team_id: awayId,
      match_id: matchId,
      goals_scored: item.goals.away,
      goals_conceded: item.goals.home,
      corners_for: null,
      corners_against: null,
      is_home: false,
      match_date: matchDate,
    });
  }
  return matchId;
}

async function syncOddsForMatch(env, db, apiFixtureId, localMatchId) {
  try {
    const data = await apiGet(env, '/odds', { fixture: apiFixtureId });
    const book = (data.response || [])[0];
    if (!book?.bookmakers?.length) return false;
    const bm = pickPreferredBookmaker(book.bookmakers);
    if (!bm) return false;
    const bets = bm.bets || [];
    const matchWinner = bets.find((b) => b.name === 'Match Winner');
    const overUnder = bets.find((b) => b.name === 'Goals Over/Under');
    const home = matchWinner?.values?.find((v) => v.value === 'Home');
    const draw = matchWinner?.values?.find((v) => v.value === 'Draw');
    const away = matchWinner?.values?.find((v) => v.value === 'Away');
    const over = overUnder?.values?.find((v) => String(v.value).includes('Over 2.5'));
    const under = overUnder?.values?.find((v) => String(v.value).includes('Under 2.5'));
    await store.upsertOdds(db, {
      match_id: localMatchId,
      bookmaker: bm.name || 'avg',
      home_odds: home ? Number(home.odd) : null,
      draw_odds: draw ? Number(draw.odd) : null,
      away_odds: away ? Number(away.odd) : null,
      over25_odds: over ? Number(over.odd) : null,
      under25_odds: under ? Number(under.odd) : null,
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Prefer Sportium, then Codere, then first bookmaker in the AF payload. */
function pickPreferredBookmaker(bookmakers) {
  const list = bookmakers || [];
  if (!list.length) return null;
  const prefer = ['sportium', 'codere'];
  for (const needle of prefer) {
    const found = list.find((b) => String(b.name || '').toLowerCase().includes(needle));
    if (found) return found;
  }
  return list[0];
}

function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamNameScore(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  const wa = new Set(na.split(' ').filter((w) => w.length > 2));
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return Math.round((100 * inter) / Math.max(wa.size, wb.size));
}

function findBestFixtureMatch(items, homeName, awayName) {
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const hs = teamNameScore(homeName, item.teams?.home?.name);
    const as = teamNameScore(awayName, item.teams?.away?.name);
    const score = Math.min(hs, as);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 50 ? best : null;
}

/**
 * After FixtureDownload sync: attach real odds via API-Football when key is set.
 */
async function enrichOddsFromApiFootball(env, db, limit = 20) {
  const rows = await store.getUpcomingForOddsEnrichment(db, limit, WINDOW_DAYS);
  const byDateLeague = new Map();
  for (const m of rows) {
    const date = String(m.match_date).slice(0, 10);
    const key = `${date}:${m.league_api_id}`;
    if (!byDateLeague.has(key)) byDateLeague.set(key, []);
    byDateLeague.get(key).push(m);
  }

  let oddsSynced = 0;
  let logosSynced = 0;
  for (const [key, matches] of byDateLeague) {
    const [date, league] = key.split(':');
    try {
      const data = await apiGet(env, '/fixtures', { date, league: Number(league) });
      const items = data.response || [];
      for (const m of matches) {
        if (oddsSynced >= limit) return { oddsSynced, logosSynced };
        const best = findBestFixtureMatch(items, m.home_name, m.away_name);
        if (!best?.fixture?.id) continue;
        const homeLogo = best.teams?.home?.logo || null;
        const awayLogo = best.teams?.away?.logo || null;
        if (homeLogo && m.home_team_id) {
          await store.updateTeamLogo(db, m.home_team_id, homeLogo);
          logosSynced += 1;
        }
        if (awayLogo && m.away_team_id) {
          await store.updateTeamLogo(db, m.away_team_id, awayLogo);
          logosSynced += 1;
        }
        const ok = await syncOddsForMatch(env, db, best.fixture.id, m.id);
        if (ok) oddsSynced += 1;
      }
    } catch (_) {
      /* skip date/league batch */
    }
  }
  return { oddsSynced, logosSynced };
}

/**
 * Persist pre-mapped fixtures (FotMob intl / Segunda) into D1.
 * @param {'flag'|'club'} logoMode
 */
async function persistMappedFixtures(db, fixtures, logoMode = 'flag') {
  if (!fixtures.length) return { saved: 0 };

  const uniqueLeagues = new Map();
  for (const fx of fixtures) {
    if (!uniqueLeagues.has(fx.leagueApiId)) {
      uniqueLeagues.set(fx.leagueApiId, {
        name: fx.leagueName,
        country: fx.country,
        api_id: fx.leagueApiId,
      });
    }
  }

  await db.batch(
    [...uniqueLeagues.values()].map((l) => ({
      sql: `INSERT INTO leagues (name, country, logo_url, api_id) VALUES (?, ?, NULL, ?)
            ON CONFLICT(api_id) DO UPDATE SET name=excluded.name, country=excluded.country`,
      params: [l.name, l.country, l.api_id],
    }))
  );

  const leagueKeys = [...uniqueLeagues.keys()];
  const leagueByApi = new Map();
  for (let i = 0; i < leagueKeys.length; i += 40) {
    const slice = leagueKeys.slice(i, i + 40);
    const rows = await db.all(
      `SELECT id, api_id FROM leagues WHERE api_id IN (${slice.map(() => '?').join(',')})`,
      ...slice
    );
    for (const r of rows) leagueByApi.set(r.api_id, r.id);
  }

  const teamDefs = new Map();
  for (const fx of fixtures) {
    const leagueId = leagueByApi.get(fx.leagueApiId);
    if (leagueId == null || !fx.homeName || !fx.awayName) continue;
    for (const [name, apiId, fxLogo] of [
      [fx.homeName, fx.homeTeamApiId, fx.homeLogoUrl],
      [fx.awayName, fx.awayTeamApiId, fx.awayLogoUrl],
    ]) {
      const key = `${leagueId}:${name.toLowerCase()}`;
      if (!teamDefs.has(key)) {
        const logo =
          fxLogo ||
          (logoMode === 'club'
            ? clubLogoUrl(name) || flagLogoForTeamName(name)
            : flagLogoForTeamName(name) || clubLogoUrl(name));
        teamDefs.set(key, {
          name,
          leagueId,
          api_id: apiId,
          logo,
        });
      } else if (fxLogo && !teamDefs.get(key).logo) {
        teamDefs.get(key).logo = fxLogo;
      }
    }
  }

  const TEAM_CHUNK = 40;
  const teamEntries = [...teamDefs.values()];
  for (let i = 0; i < teamEntries.length; i += TEAM_CHUNK) {
    const slice = teamEntries.slice(i, i + TEAM_CHUNK);
    await db.batch(
      slice.map((t) => ({
        sql: `INSERT INTO teams (name, logo_url, league_id, api_id) VALUES (?, ?, ?, ?)
              ON CONFLICT(api_id) DO UPDATE SET
                name=excluded.name,
                league_id=excluded.league_id,
                logo_url=COALESCE(excluded.logo_url, teams.logo_url)`,
        params: [t.name, t.logo, t.leagueId, t.api_id],
      }))
    );
  }

  const leagueIds = [...new Set([...teamDefs.values()].map((t) => t.leagueId))];
  const teamIdByKey = new Map();
  for (let i = 0; i < leagueIds.length; i += 40) {
    const slice = leagueIds.slice(i, i + 40);
    const rows = await db.all(
      `SELECT id, league_id, name FROM teams WHERE league_id IN (${slice.map(() => '?').join(',')})`,
      ...slice
    );
    for (const row of rows) {
      teamIdByKey.set(`${row.league_id}:${String(row.name).toLowerCase()}`, row.id);
    }
  }

  const MATCH_UPSERT = `INSERT INTO matches
    (league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, elapsed_minute, api_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(api_id) DO UPDATE SET
     league_id=excluded.league_id,
     home_team_id=excluded.home_team_id,
     away_team_id=excluded.away_team_id,
     match_date=excluded.match_date,
     status=excluded.status,
     home_goals=excluded.home_goals,
     away_goals=excluded.away_goals,
     elapsed_minute=excluded.elapsed_minute`;

  const statements = [];
  for (const fx of fixtures) {
    const leagueId = leagueByApi.get(fx.leagueApiId);
    if (leagueId == null) continue;
    const homeId = teamIdByKey.get(`${leagueId}:${fx.homeName.toLowerCase()}`);
    const awayId = teamIdByKey.get(`${leagueId}:${fx.awayName.toLowerCase()}`);
    if (homeId == null || awayId == null) continue;
    statements.push({
      sql: MATCH_UPSERT,
      params: [
        leagueId,
        homeId,
        awayId,
        fx.matchDate,
        fx.status,
        fx.homeGoals,
        fx.awayGoals,
        fx.elapsed_minute ?? null,
        fx.api_id,
      ],
    });
  }

  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }

  await store.rebuildFdTeamStats(db);
  return { saved: statements.length };
}

/**
 * Import national Friendlies via FotMob — no API key.
 * UNL / Champions / Europa come from FixtureDownload. Batched D1 writes.
 */
async function enrichInternationalsFromFotmob(db) {
  const { fixtures, errors } = await fetchInternationalFixtures();
  if (!fixtures.length) return { saved: 0, errors };
  const persisted = await persistMappedFixtures(db, fixtures, 'flag');
  return { saved: persisted.saved, errors };
}

/** Segunda División (LaLiga2) via FotMob — no FixtureDownload feed. */
async function enrichSegundaFromFotmob(db) {
  const { fixtures, errors } = await fetchSegundaFixtures();
  if (!fixtures.length) return { saved: 0, errors };
  const persisted = await persistMappedFixtures(db, fixtures, 'club');
  return { saved: persisted.saved, errors };
}

function statValue(statistics, typeName) {
  const row = (statistics || []).find((s) => s.type === typeName);
  if (!row || row.value == null || row.value === '') return null;
  const n = Number(row.value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Pull Corner Kicks + Yellow Cards (+ shots) for finished matches missing those stats.
 * @param {number} limit max fixtures to enrich (subrequest budget)
 */
async function enrichStatsFromApiFootball(env, db, limit = 30) {
  const rows = await store.getFinishedForStatsEnrichment(db, limit, 90);
  if (!rows.length) return 0;

  const byDateLeague = new Map();
  for (const m of rows) {
    const date = String(m.match_date).slice(0, 10);
    const key = `${date}:${m.league_api_id}`;
    if (!byDateLeague.has(key)) byDateLeague.set(key, []);
    byDateLeague.get(key).push(m);
  }

  let updated = 0;
  for (const [key, matches] of byDateLeague) {
    if (updated >= limit) break;
    const [date, league] = key.split(':');
    let items = [];
    try {
      const data = await apiGet(env, '/fixtures', { date, league: Number(league) });
      items = data.response || [];
    } catch (_) {
      continue;
    }
    for (const m of matches) {
      if (updated >= limit) break;
      const best = findBestFixtureMatch(items, m.home_name, m.away_name);
      if (!best?.fixture?.id) continue;
      try {
        const statsData = await apiGet(env, '/fixtures/statistics', { fixture: best.fixture.id });
        const blocks = statsData.response || [];
        if (blocks.length < 2) continue;
        const homeBlock =
          blocks.find((b) => teamNameScore(m.home_name, b.team?.name) >= 50) || blocks[0];
        const awayBlock =
          blocks.find((b) => b !== homeBlock && teamNameScore(m.away_name, b.team?.name) >= 50) ||
          blocks[1];
        const homeCorners = statValue(homeBlock.statistics, 'Corner Kicks');
        const awayCorners = statValue(awayBlock.statistics, 'Corner Kicks');
        const homeYellows = statValue(homeBlock.statistics, 'Yellow Cards');
        const awayYellows = statValue(awayBlock.statistics, 'Yellow Cards');
        const homeReds = statValue(homeBlock.statistics, 'Red Cards');
        const awayReds = statValue(awayBlock.statistics, 'Red Cards');
        const homeFouls = statValue(homeBlock.statistics, 'Fouls');
        const awayFouls = statValue(awayBlock.statistics, 'Fouls');
        const homeShotsTotal = statValue(homeBlock.statistics, 'Total Shots');
        const awayShotsTotal = statValue(awayBlock.statistics, 'Total Shots');
        const homeSot = statValue(homeBlock.statistics, 'Shots on Goal');
        const awaySot = statValue(awayBlock.statistics, 'Shots on Goal');
        // Prefer shots on target for tipster display; fall back to total shots
        const homeShots = homeSot != null ? homeSot : homeShotsTotal;
        const awayShots = awaySot != null ? awaySot : awayShotsTotal;
        if (
          homeCorners == null &&
          awayCorners == null &&
          homeYellows == null &&
          awayYellows == null
        ) {
          continue;
        }
        const matchDate = String(m.match_date).replace('T', ' ').slice(0, 19);
        await store.upsertStat(db, {
          team_id: m.home_team_id,
          match_id: m.id,
          goals_scored: m.home_goals,
          goals_conceded: m.away_goals,
          corners_for: homeCorners,
          corners_against: awayCorners,
          yellows_for: homeYellows,
          yellows_against: awayYellows,
          reds_for: homeReds,
          reds_against: awayReds,
          fouls_for: homeFouls,
          fouls_against: awayFouls,
          shots_for: homeShots,
          shots_against: awayShots,
          is_home: true,
          match_date: matchDate,
        });
        await store.upsertStat(db, {
          team_id: m.away_team_id,
          match_id: m.id,
          goals_scored: m.away_goals,
          goals_conceded: m.home_goals,
          corners_for: awayCorners,
          corners_against: homeCorners,
          yellows_for: awayYellows,
          yellows_against: homeYellows,
          reds_for: awayReds,
          reds_against: homeReds,
          fouls_for: awayFouls,
          fouls_against: homeFouls,
          shots_for: awayShots,
          shots_against: homeShots,
          is_home: false,
          match_date: matchDate,
        });
        updated += 1;
      } catch (_) {
        /* skip fixture */
      }
    }
  }
  return updated;
}

/**
 * Batched FixtureDownload sync — upcoming + finished history, purge demo seed.
 * Predictions are computed lazily on API read (not here).
 */
async function runFixtureDownloadSync(db) {
  const { fixtures, upcomingCount, historyCount, errors } = await fetchAllWindowFixtures();
  if (!fixtures.length) {
    return {
      ok: true,
      mode: 'demo',
      savedFixtures: 0,
      savedHistory: 0,
      predicted: 0,
      errors,
      message: 'FixtureDownload no devolvió partidos; se mantienen datos demo.',
    };
  }

  const removedDemo = await store.deleteAllDemoMatches(db);
  await store.purgeOrphanPredictions(db);

  const uniqueLeagues = new Map();
  for (const fx of fixtures) {
    if (!uniqueLeagues.has(fx.leagueApiId)) {
      uniqueLeagues.set(fx.leagueApiId, {
        name: fx.leagueName,
        country: fx.country,
        api_id: fx.leagueApiId,
      });
    }
  }

  await db.batch(
    [...uniqueLeagues.values()].map((l) => ({
      sql: `INSERT INTO leagues (name, country, logo_url, api_id) VALUES (?, ?, NULL, ?)
            ON CONFLICT(api_id) DO UPDATE SET name=excluded.name, country=excluded.country`,
      params: [l.name, l.country, l.api_id],
    }))
  );

  const leagueRows = await db.all(
    `SELECT id, api_id FROM leagues WHERE api_id IN (${[...uniqueLeagues.keys()].map(() => '?').join(',')})`,
    ...uniqueLeagues.keys()
  );
  const leagueByApi = new Map(leagueRows.map((r) => [r.api_id, r.id]));

  const teamDefs = new Map();
  for (const fx of fixtures) {
    if (!fx.homeName || !fx.awayName) continue;
    const leagueId = leagueByApi.get(fx.leagueApiId);
    const isIntl = String(fx.country || '') === 'World' || INTERNATIONAL_LEAGUE_IDS.includes(fx.leagueApiId);
    for (const name of [fx.homeName, fx.awayName]) {
      const key = `${leagueId}:${name.toLowerCase()}`;
      if (!teamDefs.has(key)) {
        teamDefs.set(key, {
          name,
          leagueId,
          api_id: teamApiId(fx.leagueApiId, name),
          logo: isIntl ? flagLogoForTeamName(name) : clubLogoUrl(name),
        });
      }
    }
  }

  const leagueIds = [...new Set([...teamDefs.values()].map((t) => t.leagueId))];
  const existingTeams = leagueIds.length
    ? await db.all(
        `SELECT id, league_id, name FROM teams WHERE league_id IN (${leagueIds.map(() => '?').join(',')})`,
        ...leagueIds
      )
    : [];
  const teamIdByKey = new Map();
  for (const row of existingTeams) {
    teamIdByKey.set(`${row.league_id}:${String(row.name).toLowerCase()}`, row.id);
  }

  const missingTeams = [...teamDefs.entries()].filter(([key]) => !teamIdByKey.has(key));
  if (missingTeams.length) {
    const TEAM_CHUNK = 40;
    for (let i = 0; i < missingTeams.length; i += TEAM_CHUNK) {
      const slice = missingTeams.slice(i, i + TEAM_CHUNK);
      await db.batch(
        slice.map(([, t]) => ({
          sql: `INSERT INTO teams (name, logo_url, league_id, api_id) VALUES (?, ?, ?, ?)
                ON CONFLICT(api_id) DO UPDATE SET
                  name=excluded.name,
                  league_id=excluded.league_id,
                  logo_url=COALESCE(teams.logo_url, excluded.logo_url)`,
          params: [t.name, t.logo, t.leagueId, t.api_id],
        }))
      );
    }
    const refreshed = await db.all(
      `SELECT id, league_id, name FROM teams WHERE league_id IN (${leagueIds.map(() => '?').join(',')})`,
      ...leagueIds
    );
    teamIdByKey.clear();
    for (const row of refreshed) {
      teamIdByKey.set(`${row.league_id}:${String(row.name).toLowerCase()}`, row.id);
    }
  }

  const MATCH_UPSERT = `INSERT INTO matches
    (league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(api_id) DO UPDATE SET
     league_id=excluded.league_id,
     home_team_id=excluded.home_team_id,
     away_team_id=excluded.away_team_id,
     match_date=excluded.match_date,
     status=excluded.status,
     home_goals=excluded.home_goals,
     away_goals=excluded.away_goals`;

  const statements = [];
  let savedUpcoming = 0;
  let savedHistory = 0;
  for (const fx of fixtures) {
    if (!fx.homeName || !fx.awayName) continue;
    const leagueId = leagueByApi.get(fx.leagueApiId);
    const homeId = teamIdByKey.get(`${leagueId}:${fx.homeName.toLowerCase()}`);
    const awayId = teamIdByKey.get(`${leagueId}:${fx.awayName.toLowerCase()}`);
    if (homeId == null || awayId == null) continue;
    statements.push({
      sql: MATCH_UPSERT,
      params: [
        leagueId,
        homeId,
        awayId,
        fx.matchDate,
        fx.status,
        fx.homeGoals,
        fx.awayGoals,
        fx.api_id,
      ],
    });
    if (fx.status === 'finished') savedHistory += 1;
    else savedUpcoming += 1;
  }

  const CHUNK = 40;
  for (let i = 0; i < statements.length; i += CHUNK) {
    await db.batch(statements.slice(i, i + CHUNK));
  }

  const statsRows = await store.rebuildFdTeamStats(db);

  return {
    ok: true,
    mode: 'fixturedownload',
    savedFixtures: savedUpcoming,
    savedHistory,
    statsRows,
    removedDemo,
    upcomingCount,
    historyCount,
    predicted: 0,
    note: 'Historial real importado; predicciones se reutilizan (solo huérfanas purgadas)',
    errors,
  };
}

async function runApiFootballSync(env, db) {
  const leagues = getLeagueIds(env);
  const upcomingDates = dateOffsets(0, WINDOW_DAYS);
  const yesterday = dateOffsets(-1, -1)[0];

  let savedFixtures = 0;
  let savedYday = 0;
  const upcomingMatchIds = [];

  for (const league of leagues) {
    try {
      for (const date of upcomingDates) {
        const data = await apiGet(env, '/fixtures', { date, league });
        for (const item of data.response || []) {
          const id = await saveFixture(db, item);
          upcomingMatchIds.push(id);
          savedFixtures += 1;
          if (mapStatus(item.fixture.status.short) === 'scheduled') {
            await syncOddsForMatch(env, db, item.fixture.id, id);
          }
        }
      }
      const ydayData = await apiGet(env, '/fixtures', {
        date: yesterday,
        status: 'FT',
        league,
      });
      for (const item of ydayData.response || []) {
        await saveFixture(db, item);
        savedYday += 1;
      }
    } catch (err) {
      console.log(`sync league ${league} error: ${err.message}`);
    }
  }

  const uniqueIds = [...new Set(upcomingMatchIds)];
  await predictMany(db, uniqueIds);
  return {
    ok: true,
    mode: 'api',
    savedFixtures,
    savedYday,
    predicted: uniqueIds.length,
  };
}

export async function runDailySync(env, db) {
  // FixtureDownload is always primary (honest club calendar + history).
  const result = await runFixtureDownloadSync(db);
  // Selecciones (friendlies) — FotMob, sin key
  const intl = await enrichInternationalsFromFotmob(db);
  let internationalsSynced = intl.saved || 0;
  // Segunda División (LaLiga2) — FotMob (no hay feed FD)
  const segunda = await enrichSegundaFromFotmob(db);
  let segundaSynced = segunda.saved || 0;

  const hasKey = Boolean(env.API_FOOTBALL_KEY && String(env.API_FOOTBALL_KEY).trim());
  // AF odds/stats van en cron/endpoint aparte (cupo subrequests)
  const oddsSynced = 0;
  const statsSynced = 0;
  const afError = hasKey ? 'use_sync_enrich' : null;
  // Warm tips so best-bets / combos / listado no hacen timeout en frío
  const upcomingIds = await store.getScheduledUpcomingIds(db, WINDOW_DAYS);
  const existing = await store.getPredictionsByMatchIds(db, upcomingIds);
  const toPredict = [];
  const trivial = [];
  for (const id of upcomingIds) {
    const p = existing.get(id);
    if (!p) {
      toPredict.push(id);
      continue;
    }
    const primary = p.suggested_bet != null ? String(p.suggested_bet) : '';
    const secondary = p.secondary_bet != null ? String(p.secondary_bet) : '';
    if (primary === 'UNDER_35' || secondary === 'UNDER_35') {
      trivial.push({ id, conf: Number(p.confidence_score) || 0 });
    }
  }
  trivial.sort((a, b) => b.conf - a.conf);
  const warmIds = [...toPredict, ...trivial.map((x) => x.id)].slice(0, 40);
  let predicted = 0;
  if (warmIds.length) {
    await predictMany(db, warmIds);
    predicted = warmIds.length;
  }
  const now = new Date().toISOString();
  await store.setMeta(db, 'last_sync_at', now);
  await store.setMeta(db, 'sync_started_at', '');
  const mode = 'fixturedownload+fotmob';
  await store.setMeta(db, 'last_sync_mode', mode);
  let logosBackfilled = 0;
  try {
    logosBackfilled = await store.backfillMissingTeamLogos(db, resolveTeamLogoUrl);
  } catch (_) {
    /* ignore logo backfill errors */
  }
  let tipsBackfilled = 0;
  let tipOddsBackfilled = 0;
  let tipsSettled = 0;
  let calibration = null;
  try {
    tipsBackfilled = await store.backfillPendingTips(db);
    tipOddsBackfilled = await store.backfillTipOddsBands(db);
    tipsSettled = await store.settlePendingTips(db);
    calibration = await fitTipCalibration(db);
    try {
      await store.settlePendingCombos(db, 40);
    } catch (_) {
      /* ignore combo ledger */
    }
  } catch (_) {
    /* ignore tip maintenance errors */
  }
  return {
    ...result,
    mode,
    oddsEnabled: hasKey,
    oddsSynced,
    statsSynced,
    internationalsSynced,
    internationalErrors: intl.errors || [],
    segundaSynced,
    segundaErrors: segunda.errors || [],
    afError,
    predicted,
    logosBackfilled,
    tipsBackfilled,
    tipOddsBackfilled,
    tipsSettled,
    calibrationUpdatedAt: calibration?.updatedAt || null,
    calibrationDecided: calibration?.decided ?? null,
    lastSyncAt: now,
    windowDays: WINDOW_DAYS,
  };
}

/** Solo odds + stats API-Football (cron 06:30 / POST /sync/enrich). */
export async function runAfEnrichOnly(env, db) {
  const hasKey = Boolean(env.API_FOOTBALL_KEY && String(env.API_FOOTBALL_KEY).trim());
  if (!hasKey) {
    return {
      ok: false,
      mode: 'af-enrich',
      error: 'Sin API_FOOTBALL_KEY. wrangler secret put API_FOOTBALL_KEY',
      statsSynced: 0,
      oddsSynced: 0,
    };
  }
  let statsSynced = 0;
  let oddsSynced = 0;
  let logosSynced = 0;
  let afError = null;
  try {
    statsSynced = await enrichStatsFromApiFootball(env, db, 30);
    const oddsResult = await enrichOddsFromApiFootball(env, db, 20);
    oddsSynced = oddsResult?.oddsSynced ?? oddsResult ?? 0;
    logosSynced = oddsResult?.logosSynced ?? 0;
  } catch (err) {
    afError = err.message || String(err);
  }
  return {
    ok: !afError,
    mode: 'af-enrich',
    statsSynced,
    oddsSynced,
    logosSynced,
    afError,
    lastEnrichAt: new Date().toISOString(),
  };
}

const LIVE_REFRESH_COOLDOWN_MS = 45 * 1000;

/**
 * Lightweight status refresh for today's matches (FD finish + FotMob live + AF live).
 */
export async function runLiveStatusRefresh(env, db, { force = false } = {}) {
  const lastAt = await store.getMeta(db, 'last_live_refresh_at');
  const lastMs = lastAt ? Date.parse(lastAt) : NaN;
  if (!force && lastAt && !Number.isNaN(lastMs) && Date.now() - lastMs < LIVE_REFRESH_COOLDOWN_MS) {
    return {
      ok: true,
      skipped: true,
      reason: 'cooldown',
      lastLiveRefreshAt: lastAt,
      fdUpdated: 0,
      fotmobUpdated: 0,
      afUpdated: 0,
    };
  }

  let fdUpdated = 0;
  let fotmobUpdated = 0;
  let afUpdated = 0;
  const errors = [];

  try {
    const { fixtures, errors: fdErrs } = await fetchTodayFixtures();
    errors.push(...(fdErrs || []));
    for (const fx of fixtures) {
      if (fx.status !== 'finished') continue;
      await store.updateMatchLiveByApiId(db, fx.api_id, {
        status: 'finished',
        home_goals: fx.homeGoals,
        away_goals: fx.awayGoals,
        elapsed_minute: null,
      });
      fdUpdated += 1;
    }
  } catch (err) {
    errors.push({ source: 'fixturedownload', error: err.message || String(err) });
  }

  try {
    const dbMatches = await store.getTodayMatchesForLiveRefresh(db);
    const { fixtures: liveSnap, errors: fmErrs } = await fetchFotmobLiveSnapshot();
    errors.push(...(fmErrs || []).map((e) => ({ source: 'fotmob', ...e })));

    const updatedIds = new Set();
    for (const fx of liveSnap) {
      await store.updateMatchLiveByApiId(db, fx.api_id, {
        status: fx.status,
        home_goals: fx.homeGoals,
        away_goals: fx.awayGoals,
        elapsed_minute: fx.status === 'live' ? fx.elapsed_minute ?? null : null,
      });
      // Name-match onto FD / other rows (e.g. UNL) that don't share FotMob api_id
      const best = findBestFixtureMatch(
        dbMatches.map((m) => ({
          _row: m,
          teams: { home: { name: m.home_name }, away: { name: m.away_name } },
        })),
        fx.homeName,
        fx.awayName
      );
      if (best?._row?.id && !updatedIds.has(best._row.id)) {
        await store.updateMatchLiveById(db, best._row.id, {
          status: fx.status,
          home_goals: fx.homeGoals,
          away_goals: fx.awayGoals,
          elapsed_minute: fx.status === 'live' ? fx.elapsed_minute ?? null : null,
        });
        updatedIds.add(best._row.id);
        fotmobUpdated += 1;
      } else if (fx.api_id) {
        fotmobUpdated += 1;
      }
    }
  } catch (err) {
    errors.push({ source: 'fotmob', error: err.message || String(err) });
  }

  const hasKey = Boolean(env.API_FOOTBALL_KEY && String(env.API_FOOTBALL_KEY).trim());
  if (hasKey) {
    try {
      const dbMatches = await store.getTodayMatchesForLiveRefresh(db);
      const liveData = await apiGet(env, '/fixtures', { live: 'all' });
      const liveItems = liveData.response || [];
      const today = formatDate(new Date());
      const dayData = await apiGet(env, '/fixtures', { date: today });
      const dayItems = dayData.response || [];
      const byLeague = new Map();
      for (const item of [...liveItems, ...dayItems]) {
        const lid = Number(item.league?.id);
        if (!lid) continue;
        if (!byLeague.has(lid)) byLeague.set(lid, []);
        byLeague.get(lid).push(item);
      }

      for (const m of dbMatches) {
        const leagueApi = Number(m.league_api_id);
        // AF league ids for clubs match FD; FotMob leagues use 840M+ — skip those for AF name match on wrong pool
        let candidates = byLeague.get(leagueApi) || [];
        if (!candidates.length && leagueApi > 100000) {
          candidates = [...liveItems, ...dayItems];
        }
        const best = findBestFixtureMatch(candidates, m.home_name, m.away_name);
        if (!best) continue;
        const status = mapStatus(best.fixture?.status?.short);
        const elapsedRaw = best.fixture?.status?.elapsed;
        const elapsed =
          elapsedRaw != null && !Number.isNaN(Number(elapsedRaw)) ? Number(elapsedRaw) : null;
        const hg = best.goals?.home != null ? Number(best.goals.home) : null;
        const ag = best.goals?.away != null ? Number(best.goals.away) : null;
        if (status === 'scheduled' && hg == null) continue;
        await store.updateMatchLiveById(db, m.id, {
          status,
          home_goals: hg,
          away_goals: ag,
          elapsed_minute: status === 'live' ? elapsed : null,
        });
        afUpdated += 1;
      }
    } catch (err) {
      errors.push({ source: 'api-football', error: err.message || String(err) });
    }
  }

  const now = new Date().toISOString();
  await store.setMeta(db, 'last_live_refresh_at', now);
  let tipsSettled = 0;
  let tipsBackfilled = 0;
  let calibrationUpdatedAt = null;
  try {
    tipsBackfilled = await store.backfillPendingTips(db);
    await store.backfillTipOddsBands(db);
    tipsSettled = await store.settlePendingTips(db);
    if (tipsSettled > 0) {
      const calib = await fitTipCalibration(db);
      calibrationUpdatedAt = calib?.updatedAt || null;
    }
  } catch (err) {
    errors.push({ source: 'tip_settle', error: err.message || String(err) });
  }
  return {
    ok: true,
    skipped: false,
    fdUpdated,
    fotmobUpdated,
    afUpdated,
    afEnabled: hasKey,
    tipsBackfilled,
    tipsSettled,
    calibrationUpdatedAt,
    errors,
    lastLiveRefreshAt: now,
  };
}

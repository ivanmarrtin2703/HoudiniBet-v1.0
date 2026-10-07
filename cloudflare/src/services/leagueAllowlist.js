/**
 * Competitions Houdini keeps in lists / sync.
 * Domestic top leagues + UEFA Nations League + Champions + Europa + national friendlies.
 * Drops ASEAN / AFC / CAF / CONCACAF NL / AFCON / etc.
 */

const DOMESTIC =
  /^(La Liga|LaLiga|Premier League|Serie A|Bundesliga|Ligue 1|Segunda Divisi[oó]n|LaLiga ?2)$/i;

const REJECT =
  /AFC|CAF|ASEAN|CONCACAF|OFC|Asian Cup|Africa Cup|Gold Cup|Copa America|World Cup|Arab Cup|Confederations|Club Friendlies|Women|U21|U20|U19|U17|U23|Youth|Olympic|\(W\)/i;

/**
 * @param {string} leagueName
 * @param {string} [_country]
 * @returns {boolean}
 */
export function isAllowedCompetition(leagueName, _country = '') {
  const n = String(leagueName || '').trim();
  if (!n) return false;
  if (DOMESTIC.test(n)) return true;
  if (/^UEFA Nations League/i.test(n)) return true;
  if (/^(UEFA )?Champions League$/i.test(n)) return true;
  if (/^(UEFA )?Europa League$/i.test(n)) return true;
  if (/^Friendlies$/i.test(n) || /^Friendlies\b/i.test(n)) {
    return !/Club/i.test(n) && !REJECT.test(n);
  }
  return false;
}

/** SQL fragment (alias `l` = leagues). */
export const ALLOWED_LEAGUE_SQL = `
  AND (
    l.name IN (
      'La Liga', 'Premier League', 'Serie A', 'Bundesliga', 'Ligue 1',
      'Segunda División', 'Champions League', 'Europa League', 'Friendlies',
      'UEFA Nations League', 'UEFA Champions League', 'UEFA Europa League'
    )
    OR l.name LIKE 'UEFA Nations League%'
    OR l.name LIKE 'Friendlies%'
  )
`;

/**
 * @template {{ leagueName?: string, league?: string, league_name?: string, leagueCountry?: string, league_country?: string }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function filterAllowedMatches(rows) {
  return (rows || []).filter((m) =>
    isAllowedCompetition(m.leagueName || m.league || m.league_name, m.leagueCountry || m.league_country)
  );
}

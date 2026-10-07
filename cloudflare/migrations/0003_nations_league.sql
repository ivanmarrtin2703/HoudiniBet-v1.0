-- UEFA Nations League seed (api_id 5) — demo window próximos días
INSERT OR IGNORE INTO leagues (name, country, logo_url, api_id)
VALUES ('UEFA Nations League', 'World', NULL, 5);

INSERT OR IGNORE INTO teams (name, logo_url, league_id, api_id)
SELECT 'Spain', NULL, id, 900101 FROM leagues WHERE api_id = 5;
INSERT OR IGNORE INTO teams (name, logo_url, league_id, api_id)
SELECT 'France', NULL, id, 900102 FROM leagues WHERE api_id = 5;
INSERT OR IGNORE INTO teams (name, logo_url, league_id, api_id)
SELECT 'Germany', NULL, id, 900103 FROM leagues WHERE api_id = 5;
INSERT OR IGNORE INTO teams (name, logo_url, league_id, api_id)
SELECT 'Italy', NULL, id, 900104 FROM leagues WHERE api_id = 5;
INSERT OR IGNORE INTO teams (name, logo_url, league_id, api_id)
SELECT 'Portugal', NULL, id, 900105 FROM leagues WHERE api_id = 5;
INSERT OR IGNORE INTO teams (name, logo_url, league_id, api_id)
SELECT 'Netherlands', NULL, id, 900106 FROM leagues WHERE api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900101),
  (SELECT id FROM teams WHERE api_id = 900102),
  date('now') || ' 20:45:00',
  'scheduled',
  NULL,
  NULL,
  920001
FROM leagues l WHERE l.api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900103),
  (SELECT id FROM teams WHERE api_id = 900104),
  date('now', '+2 days') || ' 20:45:00',
  'scheduled',
  NULL,
  NULL,
  920002
FROM leagues l WHERE l.api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900105),
  (SELECT id FROM teams WHERE api_id = 900106),
  date('now', '+4 days') || ' 18:00:00',
  'scheduled',
  NULL,
  NULL,
  920003
FROM leagues l WHERE l.api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900102),
  (SELECT id FROM teams WHERE api_id = 900103),
  date('now', '+6 days') || ' 20:45:00',
  'scheduled',
  NULL,
  NULL,
  920004
FROM leagues l WHERE l.api_id = 5;

-- Form history for national teams (synthetic finished)
INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900101),
  (SELECT id FROM teams WHERE api_id = 900104),
  datetime('now', '-10 days'),
  'finished',
  2,
  1,
  920101
FROM leagues l WHERE l.api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900102),
  (SELECT id FROM teams WHERE api_id = 900101),
  datetime('now', '-7 days'),
  'finished',
  1,
  1,
  920102
FROM leagues l WHERE l.api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900103),
  (SELECT id FROM teams WHERE api_id = 900105),
  datetime('now', '-12 days'),
  'finished',
  3,
  0,
  920103
FROM leagues l WHERE l.api_id = 5;

INSERT OR IGNORE INTO matches (
  league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id
)
SELECT
  l.id,
  (SELECT id FROM teams WHERE api_id = 900106),
  (SELECT id FROM teams WHERE api_id = 900104),
  datetime('now', '-5 days'),
  'finished',
  0,
  2,
  920104
FROM leagues l WHERE l.api_id = 5;

INSERT INTO team_stats (team_id, match_id, goals_scored, goals_conceded, corners_for, corners_against, is_home, match_date)
SELECT home_team_id, id, home_goals, away_goals, 5, 4, 1, match_date
FROM matches
WHERE api_id IN (920101, 920102, 920103, 920104)
  AND NOT EXISTS (
    SELECT 1 FROM team_stats ts WHERE ts.match_id = matches.id AND ts.team_id = matches.home_team_id
  );

INSERT INTO team_stats (team_id, match_id, goals_scored, goals_conceded, corners_for, corners_against, is_home, match_date)
SELECT away_team_id, id, away_goals, home_goals, 4, 5, 0, match_date
FROM matches
WHERE api_id IN (920101, 920102, 920103, 920104)
  AND NOT EXISTS (
    SELECT 1 FROM team_stats ts WHERE ts.match_id = matches.id AND ts.team_id = matches.away_team_id
  );

INSERT OR IGNORE INTO odds (match_id, bookmaker, home_odds, draw_odds, away_odds, over25_odds, under25_odds)
SELECT id, 'avg', 2.40, 3.20, 2.90, 1.90, 1.90
FROM matches WHERE api_id IN (920001, 920002, 920003, 920004);

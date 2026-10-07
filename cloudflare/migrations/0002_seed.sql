-- Seed demo (Houdini Bet only — no QR data)
INSERT INTO leagues (name, country, logo_url, api_id) VALUES
  ('La Liga', 'Spain', NULL, 140),
  ('Segunda División', 'Spain', NULL, 141),
  ('Premier League', 'England', NULL, 39),
  ('Serie A', 'Italy', NULL, 135),
  ('Bundesliga', 'Germany', NULL, 78),
  ('Ligue 1', 'France', NULL, 61);

INSERT INTO teams (name, logo_url, league_id, api_id) VALUES
  ('Real Madrid', NULL, 1, 900001),
  ('FC Barcelona', NULL, 1, 900002),
  ('Sevilla FC', NULL, 1, 900003),
  ('Real Betis', NULL, 1, 900004),
  ('Levante UD', NULL, 2, 900011),
  ('Real Zaragoza', NULL, 2, 900012),
  ('Arsenal', NULL, 3, 900021),
  ('Chelsea', NULL, 3, 900022);

INSERT INTO matches (league_id, home_team_id, away_team_id, match_date, status, home_goals, away_goals, api_id) VALUES
  (1, 1, 3, datetime('now', '-20 days'), 'finished', 2, 0, 910001),
  (1, 4, 1, datetime('now', '-16 days'), 'finished', 1, 1, 910002),
  (1, 1, 4, datetime('now', '-12 days'), 'finished', 3, 1, 910003),
  (1, 2, 1, datetime('now', '-8 days'), 'finished', 1, 2, 910004),
  (1, 1, 2, datetime('now', '-4 days'), 'finished', 2, 1, 910005),
  (1, 2, 4, datetime('now', '-18 days'), 'finished', 2, 2, 910006),
  (1, 3, 2, datetime('now', '-14 days'), 'finished', 0, 2, 910007),
  (1, 2, 3, datetime('now', '-10 days'), 'finished', 3, 0, 910008),
  (1, 4, 2, datetime('now', '-6 days'), 'finished', 1, 3, 910009),
  (1, 3, 4, datetime('now', '-2 days'), 'finished', 1, 0, 910010),
  (1, 3, 1, datetime('now', '-19 days'), 'finished', 0, 1, 910011),
  (1, 4, 3, datetime('now', '-11 days'), 'finished', 2, 1, 910012),
  (1, 3, 2, datetime('now', '-5 days'), 'finished', 1, 1, 910013),
  (3, 7, 8, datetime('now', '-9 days'), 'finished', 2, 1, 910021),
  (3, 8, 7, datetime('now', '-3 days'), 'finished', 0, 2, 910022),
  (1, 1, 2, date('now') || ' 18:00:00', 'scheduled', NULL, NULL, 910101),
  (1, 3, 4, date('now') || ' 21:00:00', 'scheduled', NULL, NULL, 910102),
  (3, 7, 8, date('now') || ' 16:30:00', 'scheduled', NULL, NULL, 910103);

INSERT INTO team_stats (team_id, match_id, goals_scored, goals_conceded, corners_for, corners_against, is_home, match_date)
SELECT home_team_id, id, home_goals, away_goals, 5 + (id % 4), 4 + (id % 3), 1, match_date
FROM matches WHERE status = 'finished';

INSERT INTO team_stats (team_id, match_id, goals_scored, goals_conceded, corners_for, corners_against, is_home, match_date)
SELECT away_team_id, id, away_goals, home_goals, 4 + (id % 3), 5 + (id % 4), 0, match_date
FROM matches WHERE status = 'finished';

INSERT INTO odds (match_id, bookmaker, home_odds, draw_odds, away_odds, over25_odds, under25_odds)
SELECT id, 'avg', 2.10, 3.40, 3.20, 1.85, 1.95
FROM matches WHERE status = 'scheduled';

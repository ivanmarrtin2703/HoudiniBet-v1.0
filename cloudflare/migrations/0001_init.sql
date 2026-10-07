-- Houdini Bet D1 schema (aislado del proyecto QR)
PRAGMA foreign_keys = ON;

CREATE TABLE leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  logo_url TEXT,
  api_id INTEGER NOT NULL UNIQUE
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo_url TEXT,
  league_id INTEGER NOT NULL,
  api_id INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (league_id) REFERENCES leagues(id)
);

CREATE INDEX idx_teams_league ON teams(league_id);
CREATE INDEX idx_teams_name ON teams(name);

CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  match_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_goals INTEGER,
  away_goals INTEGER,
  api_id INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (league_id) REFERENCES leagues(id),
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id)
);

CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_matches_league ON matches(league_id);
CREATE INDEX idx_matches_status ON matches(status);

CREATE TABLE team_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  goals_scored INTEGER NOT NULL DEFAULT 0,
  goals_conceded INTEGER NOT NULL DEFAULT 0,
  corners_for INTEGER,
  corners_against INTEGER,
  is_home INTEGER NOT NULL DEFAULT 0,
  match_date TEXT NOT NULL,
  UNIQUE (match_id, team_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX idx_team_stats_team ON team_stats(team_id);
CREATE INDEX idx_team_stats_date ON team_stats(match_date);

CREATE TABLE predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL UNIQUE,
  home_win_prob REAL NOT NULL,
  draw_prob REAL NOT NULL,
  away_win_prob REAL NOT NULL,
  over25_prob REAL NOT NULL,
  under25_prob REAL NOT NULL,
  btts_yes_prob REAL,
  btts_no_prob REAL,
  corners_over95_prob REAL,
  corners_under95_prob REAL,
  suggested_bet TEXT NOT NULL,
  secondary_bet TEXT,
  confidence_score REAL NOT NULL,
  value_edge REAL,
  value_market TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX idx_predictions_confidence ON predictions(confidence_score);

CREATE TABLE odds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  bookmaker TEXT NOT NULL DEFAULT 'avg',
  home_odds REAL,
  draw_odds REAL,
  away_odds REAL,
  over25_odds REAL,
  under25_odds REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (match_id, bookmaker),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

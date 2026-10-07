-- Tip ledger: snapshot tips for hit-rate tracking (survives clearPredictions)
CREATE TABLE IF NOT EXISTS tip_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL UNIQUE,
  suggested_bet TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  value_edge REAL,
  value_market TEXT,
  home_goals INTEGER,
  away_goals INTEGER,
  outcome TEXT NOT NULL DEFAULT 'pending',
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tip_results_outcome ON tip_results(outcome);
CREATE INDEX IF NOT EXISTS idx_tip_results_created ON tip_results(created_at);

-- Ledger of Cuotas combinadas (multi-leg) for hit/miss history
CREATE TABLE IF NOT EXISTS combo_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_key TEXT NOT NULL,
  odds_band TEXT NOT NULL,
  combined_odds REAL NOT NULL,
  avg_confidence REAL,
  legs_json TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending',
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(combo_key, odds_band)
);

CREATE INDEX IF NOT EXISTS idx_combo_results_band_outcome ON combo_results(odds_band, outcome);
CREATE INDEX IF NOT EXISTS idx_combo_results_settled ON combo_results(settled_at);

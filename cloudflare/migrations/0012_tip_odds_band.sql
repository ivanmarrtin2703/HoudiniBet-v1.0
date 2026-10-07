-- Snapshot tip odds + band for hit-rate by cuota @2/@3/@4/@5
ALTER TABLE tip_results ADD COLUMN tip_odds REAL;
ALTER TABLE tip_results ADD COLUMN odds_band TEXT;
CREATE INDEX IF NOT EXISTS idx_tip_results_odds_band ON tip_results(odds_band);

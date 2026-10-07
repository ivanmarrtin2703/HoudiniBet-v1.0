-- Team total goals O/U 2.5 and 3.5 (home/away)
ALTER TABLE predictions ADD COLUMN home_over25_prob REAL;
ALTER TABLE predictions ADD COLUMN home_under25_prob REAL;
ALTER TABLE predictions ADD COLUMN home_over35_prob REAL;
ALTER TABLE predictions ADD COLUMN home_under35_prob REAL;
ALTER TABLE predictions ADD COLUMN away_over25_prob REAL;
ALTER TABLE predictions ADD COLUMN away_under25_prob REAL;
ALTER TABLE predictions ADD COLUMN away_over35_prob REAL;
ALTER TABLE predictions ADD COLUMN away_under35_prob REAL;

-- Team total goals (home/away O/U 0.5 and 1.5)
ALTER TABLE predictions ADD COLUMN home_over05_prob REAL;
ALTER TABLE predictions ADD COLUMN home_under05_prob REAL;
ALTER TABLE predictions ADD COLUMN home_over15_prob REAL;
ALTER TABLE predictions ADD COLUMN home_under15_prob REAL;
ALTER TABLE predictions ADD COLUMN away_over05_prob REAL;
ALTER TABLE predictions ADD COLUMN away_under05_prob REAL;
ALTER TABLE predictions ADD COLUMN away_over15_prob REAL;
ALTER TABLE predictions ADD COLUMN away_under15_prob REAL;

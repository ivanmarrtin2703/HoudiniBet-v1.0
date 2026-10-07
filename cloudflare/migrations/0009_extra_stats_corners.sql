-- Extra match stats from API-Football + corner lines 8.5 / 10.5
ALTER TABLE team_stats ADD COLUMN reds_for INTEGER;
ALTER TABLE team_stats ADD COLUMN reds_against INTEGER;
ALTER TABLE team_stats ADD COLUMN fouls_for INTEGER;
ALTER TABLE team_stats ADD COLUMN fouls_against INTEGER;
ALTER TABLE team_stats ADD COLUMN shots_for INTEGER;
ALTER TABLE team_stats ADD COLUMN shots_against INTEGER;

ALTER TABLE predictions ADD COLUMN corners_over85_prob REAL;
ALTER TABLE predictions ADD COLUMN corners_under85_prob REAL;
ALTER TABLE predictions ADD COLUMN corners_over105_prob REAL;
ALTER TABLE predictions ADD COLUMN corners_under105_prob REAL;

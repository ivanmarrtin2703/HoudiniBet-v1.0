-- Yellow cards in team_stats + card line probs on predictions
ALTER TABLE team_stats ADD COLUMN yellows_for INTEGER;
ALTER TABLE team_stats ADD COLUMN yellows_against INTEGER;

ALTER TABLE predictions ADD COLUMN cards_over35_prob REAL;
ALTER TABLE predictions ADD COLUMN cards_under35_prob REAL;
ALTER TABLE predictions ADD COLUMN cards_over45_prob REAL;
ALTER TABLE predictions ADD COLUMN cards_under45_prob REAL;

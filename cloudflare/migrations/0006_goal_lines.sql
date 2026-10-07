-- Extra goal lines from Poisson (1.5 / 3.5)
ALTER TABLE predictions ADD COLUMN over15_prob REAL;
ALTER TABLE predictions ADD COLUMN under15_prob REAL;
ALTER TABLE predictions ADD COLUMN over35_prob REAL;
ALTER TABLE predictions ADD COLUMN under35_prob REAL;

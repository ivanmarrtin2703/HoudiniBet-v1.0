-- Snapshot of model probability at tip time (for calibration / reliability)
ALTER TABLE tip_results ADD COLUMN model_prob REAL;
UPDATE tip_results
SET model_prob = CASE
  WHEN confidence_score IS NOT NULL AND confidence_score > 1 THEN confidence_score / 100.0
  WHEN confidence_score IS NOT NULL AND confidence_score > 0 THEN confidence_score
  ELSE NULL
END
WHERE model_prob IS NULL;

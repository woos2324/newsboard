ALTER TABLE editorial ADD COLUMN IF NOT EXISTS edition_date DATE;

UPDATE editorial
SET edition_date = (published_at AT TIME ZONE 'Asia/Seoul')::date
WHERE edition_date IS NULL AND published_at IS NOT NULL;

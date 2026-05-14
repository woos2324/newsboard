CREATE TABLE editorial (
  editorial_id BIGSERIAL PRIMARY KEY,
  media_company_id BIGINT REFERENCES media_company(media_company_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  url TEXT UNIQUE NOT NULL,
  published_at TIMESTAMPTZ,
  topic TEXT,
  stance_score FLOAT CHECK (stance_score >= -2 AND stance_score <= 2),
  stance_label TEXT CHECK (stance_label IN ('진보','중도진보','중립','중도보수','보수')),
  ai_analysis JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_editorial_media_company ON editorial(media_company_id);
CREATE INDEX idx_editorial_published_at ON editorial(published_at DESC);
CREATE INDEX idx_editorial_topic ON editorial(topic);

ALTER TABLE editorial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON editorial USING (true) WITH CHECK (true);

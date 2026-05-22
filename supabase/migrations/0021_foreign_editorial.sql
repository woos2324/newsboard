-- 해외 매체 사설 수집 (논설실 요청, 28차)
-- 성향 분석 없이 원문 + 한국어 번역만
CREATE TABLE foreign_editorial (
  foreign_editorial_id BIGSERIAL PRIMARY KEY,
  source_code     VARCHAR(20) NOT NULL,        -- 'wapo', 'nyt', 'ft', 'scmp', 'wtimes', 'mainichi', 'sankei'
  source_country  CHAR(2)     NOT NULL,        -- 'US', 'UK', 'HK', 'JP'
  source_language CHAR(2)     NOT NULL,        -- 'en', 'ja'
  title_original  TEXT        NOT NULL,
  title_ko        TEXT,
  body_original   TEXT,
  body_ko         TEXT,
  url             TEXT        UNIQUE NOT NULL,
  published_at    TIMESTAMPTZ,
  edition_date    DATE,
  author          TEXT,
  topic           TEXT,
  ai_meta         JSONB,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_foreign_editorial_source       ON foreign_editorial(source_code);
CREATE INDEX idx_foreign_editorial_published_at ON foreign_editorial(published_at DESC);
CREATE INDEX idx_foreign_editorial_edition_date ON foreign_editorial(edition_date DESC);
CREATE INDEX idx_foreign_editorial_country      ON foreign_editorial(source_country);

ALTER TABLE foreign_editorial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON foreign_editorial USING (true) WITH CHECK (true);
CREATE POLICY "anon read"                 ON foreign_editorial FOR SELECT TO anon USING (true);

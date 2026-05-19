-- 일일 보고서: 논설위원이 사장에게 보고하는 양식
-- 구조: report(1) → section(N, 보고 항목) → article(N, 항목별 첨부 기사)

CREATE TABLE daily_report (
  report_id    BIGSERIAL PRIMARY KEY,
  report_date  DATE UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_report_section (
  section_id   BIGSERIAL PRIMARY KEY,
  report_id    BIGINT NOT NULL REFERENCES daily_report ON DELETE CASCADE,
  sort_order   INT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  comment      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_report_article (
  article_ref_id  BIGSERIAL PRIMARY KEY,
  section_id      BIGINT NOT NULL REFERENCES daily_report_section ON DELETE CASCADE,
  sort_order      INT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('segye', 'other')),
  article_id      BIGINT REFERENCES article ON DELETE SET NULL,
  article_url     TEXT NOT NULL,
  article_title   TEXT NOT NULL,
  media_name      TEXT NOT NULL,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_report_date ON daily_report(report_date DESC);
CREATE INDEX idx_drs_report ON daily_report_section(report_id, sort_order);
CREATE INDEX idx_dra_section ON daily_report_article(section_id, sort_order);

ALTER TABLE daily_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_report_article ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON daily_report USING (true) WITH CHECK (true);
CREATE POLICY "service role full access" ON daily_report_section USING (true) WITH CHECK (true);
CREATE POLICY "service role full access" ON daily_report_article USING (true) WITH CHECK (true);

CREATE POLICY "anon read" ON daily_report FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON daily_report_section FOR SELECT TO anon USING (true);
CREATE POLICY "anon read" ON daily_report_article FOR SELECT TO anon USING (true);

-- 해외 매체 쿠키 캐시 (매체별 1행, naver_session 패턴 확장)
CREATE TABLE foreign_session (
  source_code  VARCHAR(20) PRIMARY KEY,
  cookies_json TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE foreign_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON foreign_session USING (true) WITH CHECK (true);

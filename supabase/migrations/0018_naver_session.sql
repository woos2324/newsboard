-- 네이버 파트너센터 로그인 쿠키 캐시 (항상 1개 레코드 유지)
CREATE TABLE naver_session (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  cookies_json TEXT    NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE naver_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON naver_session USING (true) WITH CHECK (true);

-- 0026_autowrite_tables: autowrite 기능 3개 테이블
-- DB는 35차 세션에서 Supabase MCP로 직접 생성됨. 이 파일은 로컬 버전 관리용.

-- 기자 문체 프로파일 (계정 비의존, reporter_id 기준 선학습)
CREATE TABLE IF NOT EXISTS reporter_style_profile (
  id              BIGSERIAL PRIMARY KEY,
  reporter_id     VARCHAR NOT NULL UNIQUE,
  reporter_name   VARCHAR,
  user_id         UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  profile         JSONB,
  sample_articles JSONB,  -- few-shot용 자사 기사 5건 (title, body 300자, published_at)
  article_count   INT,
  generated_at    TIMESTAMPTZ,
  model           VARCHAR   -- 생성 모델 감사용
);

-- 팩트 캐시 (keyword × source_url 기준 Lazy 캐싱, raw_body 미저장)
CREATE TABLE IF NOT EXISTS article_fact (
  id           BIGSERIAL PRIMARY KEY,
  keyword      VARCHAR NOT NULL,
  source_url   VARCHAR NOT NULL,
  source_name  VARCHAR,
  facts        JSONB,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (keyword, source_url)
);

-- 초안 저장
CREATE TABLE IF NOT EXISTS article_draft (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
  reporter_id VARCHAR,
  keyword     VARCHAR,
  title       VARCHAR,
  content     TEXT,
  used_facts  JSONB,   -- 문장↔근거 팩트 매핑 추적
  status      VARCHAR DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'published')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE reporter_style_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_draft ENABLE ROW LEVEL SECURITY;

-- 로그인 사용자 읽기 허용 (쓰기는 service role bypass)
CREATE POLICY "authenticated read style profiles"
  ON reporter_style_profile FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read facts"
  ON article_fact FOR SELECT TO authenticated USING (true);

-- 초안은 본인 행만
CREATE POLICY "user owns draft"
  ON article_draft FOR ALL TO authenticated USING (auth.uid() = user_id);

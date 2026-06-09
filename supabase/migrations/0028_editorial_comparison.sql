-- 0028_editorial_comparison
-- opinion "today 사설 분석" — 같은 issue 그룹의 세계일보 vs 타사 사설 AI 비교 보고서 (38차)
CREATE TABLE IF NOT EXISTS editorial_comparison (
  comparison_id  BIGSERIAL PRIMARY KEY,
  edition_date   DATE NOT NULL,
  issue          TEXT NOT NULL,
  editorial_ids  BIGINT[] NOT NULL,        -- 비교에 참여한 사설 id (매체 표시·링크용)
  result         JSONB NOT NULL,           -- 5섹션 구조화 결과
  model          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_date, issue)
);

CREATE INDEX IF NOT EXISTS idx_editorial_comparison_date
  ON editorial_comparison (edition_date DESC);

ALTER TABLE editorial_comparison ENABLE ROW LEVEL SECURITY;

-- anon read (opinion 공개 앱). 쓰기는 service role(RLS 자동 bypass).
DROP POLICY IF EXISTS "anon read" ON editorial_comparison;
CREATE POLICY "anon read" ON editorial_comparison FOR SELECT USING (true);

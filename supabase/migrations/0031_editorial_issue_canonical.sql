-- 0031_editorial_issue_canonical
-- 오늘의 사설 그룹화 파편화 해결: 사후 LLM 병합 패스가 재배정하는
-- 사건 단위 중립 canonical issue 라벨 컬럼.
-- issue 는 사설마다 gpt-4o 가 독립 생성 → 같은 사건도 매체 논조에 따라 라벨이 갈려 파편화됨.
-- merge_editorial_issues.py 가 그날 전체를 1회 호출로 canonical 재배정.
-- NULL 이면 (병합 전/과거 데이터) 그룹화 시 issue 로 fallback.

ALTER TABLE editorial ADD COLUMN IF NOT EXISTS issue_canonical TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_edition_canonical
  ON editorial (edition_date, issue_canonical);

COMMENT ON COLUMN editorial.issue_canonical IS
  '사후 LLM 병합(merge_editorial_issues.py)으로 재배정한 사건 단위 중립 canonical issue. NULL이면 그룹화 시 issue로 fallback.';

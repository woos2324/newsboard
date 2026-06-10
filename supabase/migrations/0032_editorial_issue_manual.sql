-- 0032_editorial_issue_manual
-- 오늘의 사설 그룹화 수동 보정: 편집자가 AI 자동 병합(issue_canonical)이 놓친 사설을
-- 직접 올바른 주제로 옮길 수 있게 하는 최우선 라벨 컬럼.
-- 그룹화/비교 우선순위: issue_manual ?? issue_canonical ?? issue
-- merge_editorial_issues.py 는 issue_canonical 만 갱신하므로 issue_manual 은 절대 덮어쓰지 않음 → 수동 보정 영구 보존.
-- NULL 이면 자동 판단(canonical)으로 복원.

ALTER TABLE editorial ADD COLUMN IF NOT EXISTS issue_manual TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_edition_manual
  ON editorial (edition_date, issue_manual);

COMMENT ON COLUMN editorial.issue_manual IS
  '편집자가 수동 지정한 주제(최우선). merge 가 건드리지 않아 보존됨. NULL이면 issue_canonical→issue fallback.';

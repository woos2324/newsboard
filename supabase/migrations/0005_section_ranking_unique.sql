-- 1. 기존 중복 row 제거 (같은 조합 중 ctid가 큰 것(나중 row)만 남김)
DELETE FROM section_ranking_snapshot a
USING section_ranking_snapshot b
WHERE a.ctid < b.ctid
  AND a.media_company_id = b.media_company_id
  AND a.section_name     = b.section_name
  AND a.rank             = b.rank
  AND a.ranking_date     = b.ranking_date;

-- 2. UNIQUE 제약조건 추가 (이후 upsert on_conflict 정상 작동)
ALTER TABLE section_ranking_snapshot
ADD CONSTRAINT section_ranking_snapshot_unique
UNIQUE (media_company_id, section_name, rank, ranking_date);

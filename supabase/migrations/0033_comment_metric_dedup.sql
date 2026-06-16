-- comment_metric 중복 누적 정리 + 기사당 1행 보장 (upsert 전환 대비)
-- 배경: 수집 cron이 매시간 INSERT(누적) → 기사당 최대 ~168행/7일.
--   getCompareCommentRanking 전역 LIMIT 고갈로 일부 매체 미표시 버그의 근본 원인.
-- source는 항상 'NAVER' 단일 → article_id 단독 UNIQUE 키로 충분.

-- 1) 기사당 최신 측정행만 보존, 나머지 삭제 (measured_at DESC, 동률 시 id DESC)
DELETE FROM comment_metric cm
USING comment_metric keep
WHERE cm.article_id = keep.article_id
  AND (
    cm.measured_at < keep.measured_at
    OR (cm.measured_at = keep.measured_at
        AND cm.comment_metric_id < keep.comment_metric_id)
  );

-- 2) article_id UNIQUE 제약 → 이후 upsert(on_conflict=article_id) 가능
ALTER TABLE comment_metric
  ADD CONSTRAINT comment_metric_article_unique UNIQUE (article_id);

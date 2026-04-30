-- 성능 최적화 인덱스 추가

-- ① comment_metric: comment_count DESC 정렬 쿼리 (getOurTopComments / getCompetitorTopComments)
CREATE INDEX IF NOT EXISTS idx_comment_metric_count
  ON comment_metric (comment_count DESC);

-- ② subscriber_snapshot: snapshot_date 단독 정렬 쿼리 (getCompetitorSubscribers — 필터 없이 날짜 역순)
CREATE INDEX IF NOT EXISTS idx_subscriber_snapshot_date
  ON subscriber_snapshot (snapshot_date DESC);

-- ③ issue_cluster_article: article_id 단독 조회 (cluster_articles.py — 이미 할당된 기사 목록 로드)
CREATE INDEX IF NOT EXISTS idx_cluster_article_article_id
  ON issue_cluster_article (article_id);

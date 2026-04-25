-- Newsboard seed data
-- 대시보드 초기 시연을 위한 최소 샘플. 재시작 후 MCP execute_sql 로 실행.

BEGIN;

-- =========== MediaCompany ===========
INSERT INTO media_company (name, normalized_name, naver_media_id, homepage_url, is_our_company)
VALUES
  ('조선일보',   'chosun',      '023', 'https://www.chosun.com',     FALSE),
  ('중앙일보',   'joongang',    '025', 'https://www.joongang.co.kr', FALSE),
  ('한겨레',     'hani',        '028', 'https://www.hani.co.kr',     FALSE),
  ('매일경제',   'mk',          '009', 'https://www.mk.co.kr',       FALSE),
  ('한국경제',   'hankyung',    '015', 'https://www.hankyung.com',   FALSE),
  ('동아일보',   'donga',       '020', 'https://www.donga.com',      FALSE),
  ('경향신문',   'khan',        '032', 'https://www.khan.co.kr',     FALSE),
  ('서울경제',   'sedaily',     '011', 'https://www.sedaily.com',    FALSE),
  ('뉴스보드',   'newsboard',   NULL,  'https://newsboard.local',    TRUE)
ON CONFLICT (normalized_name) DO NOTHING;

-- =========== app_user ===========
INSERT INTO app_user (email, name, role)
VALUES
  ('editor.kim@newsboard.local',    '김 편집자', 'editor'),
  ('reporter.lee@newsboard.local',  '이 기자',   'journalist'),
  ('desk.park@newsboard.local',     '박 데스크', 'decision_maker')
ON CONFLICT (email) DO NOTHING;

-- =========== Article ===========
INSERT INTO article (media_company_id, title, url, category, published_at, collected_at)
VALUES
  ((SELECT media_company_id FROM media_company WHERE normalized_name='chosun'),
    '반도체 수출 통제 확대…업계 "수주 차질"',
    'https://www.chosun.com/economy/2026/04/24/seed-001',
    'economy', NOW() - INTERVAL '3 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='joongang'),
    '한은 기준금리 동결, 시장 "관망세"',
    'https://www.joongang.co.kr/economy/2026/04/24/seed-002',
    'economy', NOW() - INTERVAL '5 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='hani'),
    'AI 저작권 가이드 초안 공개',
    'https://www.hani.co.kr/culture/2026/04/24/seed-003',
    'culture', NOW() - INTERVAL '6 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='mk'),
    '서울 아파트 거래량 3개월 최고치',
    'https://www.mk.co.kr/realestate/2026/04/24/seed-004',
    'realestate', NOW() - INTERVAL '8 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='hankyung'),
    '반도체주 일제히 하락 마감',
    'https://www.hankyung.com/finance/2026/04/24/seed-005',
    'finance', NOW() - INTERVAL '2 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='donga'),
    '정부, 전기요금 인상안 검토',
    'https://www.donga.com/politics/2026/04/24/seed-006',
    'politics', NOW() - INTERVAL '9 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='khan'),
    '생성형 AI 규제, 업계 반발 확산',
    'https://www.khan.co.kr/it/2026/04/24/seed-007',
    'it', NOW() - INTERVAL '4 hours', NOW()),
  ((SELECT media_company_id FROM media_company WHERE normalized_name='sedaily'),
    '코스피 2,650선 회복',
    'https://www.sedaily.com/finance/2026/04/24/seed-008',
    'finance', NOW() - INTERVAL '1 hour', NOW())
ON CONFLICT (url) DO NOTHING;

-- =========== IssueCluster ===========
INSERT INTO issue_cluster
  (cluster_key, representative_title, keywords, summary, cluster_date, confidence_score, model_version)
VALUES
  ('2026-04-24-semiconductor-export',
   '반도체 수출 규제 확대 발표',
   ARRAY['반도체','수출규제','산업부'],
   '정부가 첨단 반도체 장비 수출 통제 대상을 확대한다고 발표하며 업계 전반에 파장이 예상된다.',
   '2026-04-24', 0.9120, 'claude-opus-4-6'),
  ('2026-04-24-interest-rate',
   '기준금리 동결, 부동산 시장 반응',
   ARRAY['기준금리','한국은행','부동산'],
   '한국은행이 기준금리를 동결하면서 주택 담보 대출 시장과 거래량에 미치는 영향이 주목된다.',
   '2026-04-24', 0.8740, 'claude-opus-4-6'),
  ('2026-04-24-ai-copyright',
   'AI 저작권 가이드라인 공개',
   ARRAY['AI','저작권','생성형AI'],
   '문화체육관광부가 생성형 AI 관련 저작권 가이드라인 초안을 공개하며 업계 의견 수렴을 시작했다.',
   '2026-04-24', 0.8502, 'claude-opus-4-6')
ON CONFLICT (cluster_key) DO NOTHING;

-- =========== IssueClusterArticle ===========
INSERT INTO issue_cluster_article (issue_cluster_id, article_id, similarity_score, is_representative)
SELECT c.issue_cluster_id, a.article_id, 0.92, TRUE
FROM issue_cluster c, article a
WHERE c.cluster_key = '2026-04-24-semiconductor-export'
  AND a.url = 'https://www.chosun.com/economy/2026/04/24/seed-001'
ON CONFLICT DO NOTHING;

INSERT INTO issue_cluster_article (issue_cluster_id, article_id, similarity_score, is_representative)
SELECT c.issue_cluster_id, a.article_id, 0.88, FALSE
FROM issue_cluster c, article a
WHERE c.cluster_key = '2026-04-24-semiconductor-export'
  AND a.url = 'https://www.hankyung.com/finance/2026/04/24/seed-005'
ON CONFLICT DO NOTHING;

INSERT INTO issue_cluster_article (issue_cluster_id, article_id, similarity_score, is_representative)
SELECT c.issue_cluster_id, a.article_id, 0.90, TRUE
FROM issue_cluster c, article a
WHERE c.cluster_key = '2026-04-24-interest-rate'
  AND a.url = 'https://www.joongang.co.kr/economy/2026/04/24/seed-002'
ON CONFLICT DO NOTHING;

INSERT INTO issue_cluster_article (issue_cluster_id, article_id, similarity_score, is_representative)
SELECT c.issue_cluster_id, a.article_id, 0.94, TRUE
FROM issue_cluster c, article a
WHERE c.cluster_key = '2026-04-24-ai-copyright'
  AND a.url = 'https://www.hani.co.kr/culture/2026/04/24/seed-003'
ON CONFLICT DO NOTHING;

-- =========== RankingNewsSnapshot + Item ===========
-- 조선일보 오늘자 스냅샷 예시
WITH snap AS (
  INSERT INTO ranking_news_snapshot (media_company_id, snapshot_at, source, category, collection_status)
  SELECT media_company_id, NOW(), 'NAVER', 'general', 'success'
  FROM media_company WHERE normalized_name = 'chosun'
  RETURNING ranking_snapshot_id
)
INSERT INTO ranking_news_item (ranking_snapshot_id, article_id, rank_position, score)
SELECT s.ranking_snapshot_id, a.article_id, 1, 0.912
FROM snap s, article a
WHERE a.url = 'https://www.chosun.com/economy/2026/04/24/seed-001';

-- =========== SubscriberSnapshot (자사 7일) ===========
INSERT INTO subscriber_snapshot (media_company_id, snapshot_date, subscriber_count, daily_delta, seven_day_delta, source)
SELECT
  mc.media_company_id,
  (CURRENT_DATE - (d || ' days')::INTERVAL)::DATE,
  125000 + (d * 480),
  480,
  3360,
  'internal'
FROM media_company mc
CROSS JOIN generate_series(0, 6) AS d
WHERE mc.is_our_company = TRUE
ON CONFLICT DO NOTHING;

-- =========== SubscriberSnapshot (경쟁사 7일, source='naver') ===========
-- 각 경쟁사의 최근일(d=0)이 latest_count 기준이고 d일 전으로 갈수록 감소.
WITH competitors(normalized_name, latest_count, daily_delta, seven_day_delta) AS (
  VALUES
    ('chosun',   481200,  1500,  10500),
    ('joongang', 398400,   800,   5600),
    ('hani',     212800,  -100,   -700),
    ('mk',       182300,   830,   5800),
    ('hankyung', 176900,   200,   1400),
    ('donga',    155400,   300,   2100),
    ('khan',      98300,   130,    910),
    ('sedaily',   76200,   330,   2310)
)
INSERT INTO subscriber_snapshot
  (media_company_id, snapshot_date, subscriber_count, daily_delta, seven_day_delta, source)
SELECT
  mc.media_company_id,
  (CURRENT_DATE - (d || ' days')::INTERVAL)::DATE,
  c.latest_count - (d * (c.seven_day_delta / 7))::INTEGER,
  c.daily_delta,
  c.seven_day_delta,
  'naver'
FROM competitors c
JOIN media_company mc ON mc.normalized_name = c.normalized_name
CROSS JOIN generate_series(0, 6) AS d
ON CONFLICT (media_company_id, snapshot_date, source) DO NOTHING;

-- =========== CommentMetric ===========
INSERT INTO comment_metric (article_id, measured_at, comment_count, like_count, reply_count, engagement_score, source)
SELECT a.article_id, NOW(), 1842, 921, 430, 87.12, 'naver'
FROM article a WHERE a.url = 'https://www.chosun.com/economy/2026/04/24/seed-001';

INSERT INTO comment_metric (article_id, measured_at, comment_count, like_count, reply_count, engagement_score, source)
SELECT a.article_id, NOW(), 1210, 612, 301, 72.44, 'naver'
FROM article a WHERE a.url = 'https://www.hani.co.kr/culture/2026/04/24/seed-003';

INSERT INTO comment_metric (article_id, measured_at, comment_count, like_count, reply_count, engagement_score, source)
SELECT a.article_id, NOW(), 988, 520, 188, 65.87, 'naver'
FROM article a WHERE a.url = 'https://www.joongang.co.kr/economy/2026/04/24/seed-002';

INSERT INTO comment_metric (article_id, measured_at, comment_count, like_count, reply_count, engagement_score, source)
SELECT a.article_id, NOW(), 742, 410, 120, 54.22, 'naver'
FROM article a WHERE a.url = 'https://www.mk.co.kr/realestate/2026/04/24/seed-004';

-- =========== MissedIssueAlert ===========
INSERT INTO missed_issue_alert
  (issue_cluster_id, target_media_company_id, alert_status, competitor_article_count, priority_score, reason, detected_at)
SELECT
  c.issue_cluster_id,
  (SELECT media_company_id FROM media_company WHERE is_our_company = TRUE LIMIT 1),
  'open', 2, 87.2,
  '경쟁사 2곳이 보도했으나 자사 미보도',
  NOW() - INTERVAL '42 minutes'
FROM issue_cluster c
WHERE c.cluster_key = '2026-04-24-semiconductor-export';

-- =========== AISummary (일간) ===========
INSERT INTO ai_summary (issue_cluster_id, summary_type, summary_date, title, content, source_metadata, model_version, quality_score)
VALUES (
  NULL, 'daily', CURRENT_DATE,
  '2026-04-24 일간 브리핑',
  '오늘은 산업·경제 이슈가 전체 언급의 62%를 차지했으며, 반도체·금리·AI 저작권이 핵심 축입니다.',
  '{"cluster_keys":["2026-04-24-semiconductor-export","2026-04-24-interest-rate","2026-04-24-ai-copyright"]}'::jsonb,
  'claude-opus-4-6', 0.91
);

COMMIT;

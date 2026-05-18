-- 네이버 파트너센터 PV 데이터 (Phase 1)
-- 출처: friend.navercorp.com → news-stat-admin.navercorp.com
-- 4개 데이터: 기사 조회수 순위 / 시간대별 조회수 / 유입분석 / 유입키워드

-- 1) 기사별 PV 스냅샷 (일별 Top 100)
CREATE TABLE article_pv_snapshot (
  pv_snapshot_id BIGSERIAL PRIMARY KEY,
  data_date DATE NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  title TEXT NOT NULL,
  reporter_name TEXT,
  article_published_at TIMESTAMPTZ NOT NULL,
  pv INTEGER NOT NULL CHECK (pv >= 0),
  device TEXT NOT NULL DEFAULT 'all' CHECK (device IN ('all','pc','mobile')),
  category TEXT NOT NULL DEFAULT 'all',
  article_id BIGINT REFERENCES article(article_id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (data_date, rank, device, category)
);

CREATE INDEX idx_apv_data_date ON article_pv_snapshot(data_date DESC);
CREATE INDEX idx_apv_article ON article_pv_snapshot(article_id) WHERE article_id IS NOT NULL;
CREATE INDEX idx_apv_published_at ON article_pv_snapshot(article_published_at DESC);

ALTER TABLE article_pv_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON article_pv_snapshot USING (true) WITH CHECK (true);
CREATE POLICY "anon read" ON article_pv_snapshot FOR SELECT USING (true);


-- 2) 시간대별 조회수 (일별 × 24시간)
CREATE TABLE hourly_pv_snapshot (
  hourly_pv_id BIGSERIAL PRIMARY KEY,
  data_date DATE NOT NULL,
  hour SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  pv INTEGER NOT NULL CHECK (pv >= 0),
  device TEXT NOT NULL DEFAULT 'all' CHECK (device IN ('all','pc','mobile')),
  category TEXT NOT NULL DEFAULT 'all',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (data_date, hour, device, category)
);

CREATE INDEX idx_hpv_data_date ON hourly_pv_snapshot(data_date DESC);

ALTER TABLE hourly_pv_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON hourly_pv_snapshot USING (true) WITH CHECK (true);
CREATE POLICY "anon read" ON hourly_pv_snapshot FOR SELECT USING (true);


-- 3) 유입 경로 (일별)
-- source_category 예: '네이버 메인_모바일_언론사별판', '네이버 뉴스', '기타'
-- source_detail_url 예: 'https://m.naver.com', 'https://news.naver.com/section/102'
CREATE TABLE traffic_source_daily (
  traffic_source_id BIGSERIAL PRIMARY KEY,
  data_date DATE NOT NULL,
  source_category TEXT NOT NULL,
  source_detail_url TEXT,
  category_ratio NUMERIC(6,3) NOT NULL CHECK (category_ratio >= 0),
  detail_ratio NUMERIC(6,3) NOT NULL CHECK (detail_ratio >= 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tsd_date ON traffic_source_daily(data_date DESC);
CREATE INDEX idx_tsd_category ON traffic_source_daily(source_category);

ALTER TABLE traffic_source_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON traffic_source_daily USING (true) WITH CHECK (true);
CREATE POLICY "anon read" ON traffic_source_daily FOR SELECT USING (true);


-- 4) 검색 유입 키워드 (일별 Top 100)
CREATE TABLE search_keyword_daily (
  search_keyword_id BIGSERIAL PRIMARY KEY,
  data_date DATE NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  keyword TEXT NOT NULL,
  clicks INTEGER NOT NULL CHECK (clicks >= 0),
  ratio NUMERIC(6,3) NOT NULL CHECK (ratio >= 0),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (data_date, keyword)
);

CREATE INDEX idx_skd_date ON search_keyword_daily(data_date DESC);
CREATE INDEX idx_skd_keyword ON search_keyword_daily(keyword);

ALTER TABLE search_keyword_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON search_keyword_daily USING (true) WITH CHECK (true);
CREATE POLICY "anon read" ON search_keyword_daily FOR SELECT USING (true);

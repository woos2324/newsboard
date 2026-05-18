-- 기사 PV 스냅샷에 원본 네이버 URI 추가 (JSON API 응답값 저장 + article 매칭용)
ALTER TABLE article_pv_snapshot ADD COLUMN IF NOT EXISTS article_url TEXT;

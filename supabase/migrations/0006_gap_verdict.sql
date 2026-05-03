ALTER TABLE missed_issue_alert
  ADD COLUMN verdict TEXT CHECK (verdict IN ('미보도', '확인필요', '유사보도있음')),
  ADD COLUMN similar_article_id BIGINT REFERENCES article(article_id);

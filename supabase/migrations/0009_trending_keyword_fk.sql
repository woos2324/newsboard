ALTER TABLE trending_keyword
  ADD CONSTRAINT fk_trending_cluster
  FOREIGN KEY (matched_cluster_id)
  REFERENCES issue_cluster(issue_cluster_id)
  ON DELETE SET NULL;

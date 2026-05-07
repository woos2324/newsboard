-- Lock down public tables. The app renders through trusted server code and
-- GitHub Actions, both using SUPABASE_SERVICE_ROLE_KEY. No anon/auth policies
-- are defined, so browser-side direct access is denied while service_role keeps
-- server and batch jobs working.

ALTER TABLE media_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE article ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_news_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_news_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriber_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_metric ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_cluster ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_cluster_article ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_issue_alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_publication_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_ranking_snapshot ENABLE ROW LEVEL SECURITY;

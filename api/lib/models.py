from datetime import date, datetime

from pydantic import BaseModel


class MediaCompany(BaseModel):
    media_company_id: int
    name: str
    normalized_name: str
    is_our_company: bool


class Article(BaseModel):
    article_id: int
    media_company_id: int
    title: str
    url: str
    category: str | None = None
    published_at: datetime | None = None


class IssueCluster(BaseModel):
    issue_cluster_id: int
    cluster_key: str
    representative_title: str
    keywords: list[str] | None = None
    summary: str | None = None
    cluster_date: date
    confidence_score: float | None = None
    article_count: int = 0


class RankingItem(BaseModel):
    rank_position: int
    title: str
    media: str
    url: str
    change: int | None = None


class MissedAlert(BaseModel):
    missed_issue_alert_id: int
    issue_cluster_id: int
    representative_title: str
    alert_status: str
    competitor_article_count: int
    priority_score: float | None = None
    reason: str | None = None
    detected_at: datetime


class SubscriberPoint(BaseModel):
    snapshot_date: date
    subscriber_count: int
    daily_delta: int | None = None


class CommentTopItem(BaseModel):
    article_id: int
    title: str
    comment_count: int
    engagement_score: float | None = None


class AISummaryOut(BaseModel):
    ai_summary_id: int
    summary_type: str
    summary_date: date
    title: str
    content: str
    bullets: list = []
    model_version: str = ""
    quality_score: float | None = None


class DashboardStat(BaseModel):
    label: str
    value: str
    delta: float | None = None


class DashboardOverview(BaseModel):
    stats: list[DashboardStat]
    top_issues: list[IssueCluster]
    ranking: list[RankingItem]
    missed_alerts: list[MissedAlert]
    subscribers: list[SubscriberPoint]
    top_comments: list[CommentTopItem]
    ai_summary: AISummaryOut | None = None

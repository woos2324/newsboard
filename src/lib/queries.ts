import { getSupabase } from "./supabase";

// ===================================================================
// View types — 페이지가 소비하는 shape 고정
// ===================================================================

export type IssueView = {
  cluster_id: number;
  cluster_key: string;
  rank: number;
  title: string;
  summary: string | null;
  keywords: string[];
  articles: number;
  confidence: number;
  cluster_date: string;
};

export type RankingArticleView = {
  article_id: number;
  title: string;
  media: string;
  category: string | null;
  published_at: string | null;
  url: string;
};

export type MissedAlertView = {
  alert_id: number;
  title: string;
  competitors: string[];
  priority: "high" | "medium" | "low";
  gap_minutes: number;
  reason: string | null;
  status: string;
  detected_at: string;
};

export type SubscriberPointView = {
  snapshot_date: string;
  subscriber_count: number;
  daily_delta: number | null;
};

export type CompetitorSubscriberView = {
  media: string;
  value: number;
  delta: number;
};

export type TopCommentView = {
  article_id: number;
  title: string;
  media: string;
  comments: number;
  likes: number | null;
  engagement: number | null;
  source: string;
};

export type AISummaryView = {
  summary_id: number;
  type: "daily" | "weekly" | "issue" | "competitor";
  summary_date: string;
  title: string;
  content: string;
  bullets: string[];
  model_version: string;
};

export type OverviewStats = {
  today_articles: number;
  today_comments: number;
  today_subscriber_delta: number;
  total_subscribers: number;
};

export type CompareRow = {
  rank: number;
  cells: Record<string, string | null>;
};

export type CompareMatrix = {
  media: string[];
  rows: CompareRow[];
};

export type IssueArticleView = {
  article_id: number;
  title: string;
  media: string;
  category: string | null;
  published_at: string | null;
  url: string;
  similarity: number | null;
  is_representative: boolean;
};

export type IssueDetail = {
  cluster_id: number;
  cluster_key: string;
  title: string;
  summary: string | null;
  keywords: string[];
  confidence: number;
  cluster_date: string;
  model_version: string;
  articles: IssueArticleView[];
  competitor_count: number;
};

// ===================================================================
// Helpers
// ===================================================================

const KST_OFFSET_MIN = 9 * 60;

function startOfToday(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + KST_OFFSET_MIN * 60_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET_MIN * 60_000).toISOString();
}

function priorityFromScore(score: number | null | undefined): "high" | "medium" | "low" {
  const s = Number(score ?? 0);
  if (s >= 80) return "high";
  if (s >= 50) return "medium";
  return "low";
}

function gapMinutesFromDetected(detectedAt: string): number {
  const detected = new Date(detectedAt).getTime();
  return Math.max(0, Math.round((Date.now() - detected) / 60_000));
}

// ===================================================================
// Issue queries
// ===================================================================

export async function getIssues(limit = 20): Promise<IssueView[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("issue_cluster")
    .select(
      "issue_cluster_id, cluster_key, representative_title, summary, keywords, confidence_score, cluster_date, issue_cluster_article(count)"
    )
    .order("cluster_date", { ascending: false })
    .order("confidence_score", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((c, i) => {
    const relatedArr = c.issue_cluster_article as unknown as
      | { count: number }[]
      | null;
    return {
      cluster_id: c.issue_cluster_id,
      cluster_key: c.cluster_key,
      rank: i + 1,
      title: c.representative_title,
      summary: c.summary,
      keywords: c.keywords ?? [],
      articles: relatedArr?.[0]?.count ?? 0,
      confidence: Number(c.confidence_score ?? 0),
      cluster_date: c.cluster_date,
    };
  });
}

// ===================================================================
// Dashboard stats
// ===================================================================

export async function getOverviewStats(): Promise<OverviewStats> {
  const sb = getSupabase();
  const since = startOfToday();

  const [articlesRes, commentsRes, subRes] = await Promise.all([
    sb
      .from("article")
      .select("article_id", { count: "exact", head: true })
      .gte("published_at", since),
    sb
      .from("comment_metric")
      .select("comment_count")
      .gte("measured_at", since),
    sb
      .from("subscriber_snapshot")
      .select("subscriber_count, daily_delta, snapshot_date, media_company!inner(is_our_company)")
      .eq("media_company.is_our_company", true)
      .order("snapshot_date", { ascending: false })
      .limit(1),
  ]);

  if (articlesRes.error) throw articlesRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (subRes.error) throw subRes.error;

  const today_comments = (commentsRes.data ?? []).reduce(
    (acc, r) => acc + (r.comment_count ?? 0),
    0
  );

  const latestSub = subRes.data?.[0];

  return {
    today_articles: articlesRes.count ?? 0,
    today_comments,
    today_subscriber_delta: latestSub?.daily_delta ?? 0,
    total_subscribers: latestSub?.subscriber_count ?? 0,
  };
}

// ===================================================================
// Ranking — 대시보드 "오늘의 랭킹" 블록 (최근 기사 TOP N)
// ===================================================================

export async function getRecentArticles(limit = 8): Promise<RankingArticleView[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("article")
    .select(
      "article_id, title, category, published_at, url, media_company!inner(name)"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((a) => {
    const mc = a.media_company as unknown as { name: string } | null;
    return {
      article_id: a.article_id,
      title: a.title,
      media: mc?.name ?? "-",
      category: a.category,
      published_at: a.published_at,
      url: a.url,
    };
  });
}

// ===================================================================
// Compare — 매체별 최근 기사 grid (순위 x 매체)
// ===================================================================

export async function getCompareMatrix(
  normalizedNames: string[] = ["chosun", "joongang", "hani", "mk"],
  rows = 5
): Promise<CompareMatrix> {
  const sb = getSupabase();

  // normalized_name -> 한글 name 변환 + 입력 순서 보존
  const { data: mediaList, error: mediaErr } = await sb
    .from("media_company")
    .select("name, normalized_name")
    .in("normalized_name", normalizedNames);
  if (mediaErr) throw mediaErr;

  const nameByNormalized = new Map(
    (mediaList ?? []).map((m) => [m.normalized_name, m.name])
  );
  const orderedMedia = normalizedNames
    .map((n) => nameByNormalized.get(n))
    .filter((n): n is string => !!n);

  const perMedia = await Promise.all(
    orderedMedia.map(async (name) => {
      const { data, error } = await sb
        .from("article")
        .select("title, published_at, media_company!inner(name)")
        .eq("media_company.name", name)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(rows);
      if (error) throw error;
      return { name, titles: (data ?? []).map((a) => a.title as string) };
    })
  );

  const out: CompareRow[] = [];
  for (let i = 0; i < rows; i++) {
    const cells: Record<string, string | null> = {};
    for (const m of perMedia) {
      cells[m.name] = m.titles[i] ?? null;
    }
    out.push({ rank: i + 1, cells });
  }

  return { media: orderedMedia, rows: out };
}

// ===================================================================
// Missed issue alerts (Gap)
// ===================================================================

export async function getMissedAlerts(
  status: "open" | "reviewing" | "resolved" | "ignored" | "all" = "open",
  limit = 20
): Promise<MissedAlertView[]> {
  const sb = getSupabase();

  let query = sb
    .from("missed_issue_alert")
    .select(
      "missed_issue_alert_id, alert_status, competitor_article_count, priority_score, reason, detected_at, target_media_company_id, issue_cluster:issue_cluster_id(issue_cluster_id, representative_title)"
    )
    .order("priority_score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (status !== "all") query = query.eq("alert_status", status);

  const { data, error } = await query;
  if (error) throw error;

  const alerts = data ?? [];

  // 각 알림의 경쟁사 목록: issue_cluster_article 에서 target_media_company_id 제외한 매체명
  const clusterIds = alerts
    .map((a) => {
      const ic = a.issue_cluster as unknown as { issue_cluster_id: number } | null;
      return ic?.issue_cluster_id;
    })
    .filter((x): x is number => typeof x === "number");

  const competitorsByCluster = new Map<number, Map<number, string>>();
  if (clusterIds.length > 0) {
    const { data: relData, error: relErr } = await sb
      .from("issue_cluster_article")
      .select(
        "issue_cluster_id, article:article_id(media_company:media_company_id(media_company_id, name))"
      )
      .in("issue_cluster_id", clusterIds);
    if (relErr) throw relErr;

    for (const r of relData ?? []) {
      const art = r.article as unknown as
        | { media_company: { media_company_id: number; name: string } | null }
        | null;
      const mc = art?.media_company;
      if (!mc) continue;
      const cid = r.issue_cluster_id;
      if (!competitorsByCluster.has(cid)) competitorsByCluster.set(cid, new Map());
      competitorsByCluster.get(cid)!.set(mc.media_company_id, mc.name);
    }
  }

  return alerts.map((a) => {
    const ic = a.issue_cluster as unknown as
      | { issue_cluster_id: number; representative_title: string }
      | null;
    const competitorMap = ic
      ? competitorsByCluster.get(ic.issue_cluster_id) ?? new Map()
      : new Map();
    competitorMap.delete(a.target_media_company_id);
    return {
      alert_id: a.missed_issue_alert_id,
      title: ic?.representative_title ?? "(제목 없음)",
      competitors: Array.from(competitorMap.values()),
      priority: priorityFromScore(a.priority_score),
      gap_minutes: gapMinutesFromDetected(a.detected_at),
      reason: a.reason,
      status: a.alert_status,
      detected_at: a.detected_at,
    };
  });
}

// ===================================================================
// Subscribers
// ===================================================================

export async function getOurSubscriberSeries(days = 7): Promise<{
  series: SubscriberPointView[];
  total: number;
  deltaPct: number;
}> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("subscriber_snapshot")
    .select(
      "snapshot_date, subscriber_count, daily_delta, media_company!inner(is_our_company)"
    )
    .eq("media_company.is_our_company", true)
    .order("snapshot_date", { ascending: true })
    .limit(days);

  if (error) throw error;

  const series: SubscriberPointView[] = (data ?? []).map((r) => ({
    snapshot_date: r.snapshot_date,
    subscriber_count: r.subscriber_count,
    daily_delta: r.daily_delta,
  }));

  const first = series[0]?.subscriber_count ?? 0;
  const last = series[series.length - 1]?.subscriber_count ?? 0;
  const total = last;
  const deltaPct = first === 0 ? 0 : Number((((last - first) / first) * 100).toFixed(1));

  return { series, total, deltaPct };
}

export async function getCompetitorSubscribers(): Promise<CompetitorSubscriberView[]> {
  const sb = getSupabase();
  // 각 경쟁사의 최신 subscriber_snapshot.
  const { data, error } = await sb
    .from("subscriber_snapshot")
    .select(
      "subscriber_count, seven_day_delta, snapshot_date, media_company:media_company_id(name, is_our_company)"
    )
    .order("snapshot_date", { ascending: false });

  if (error) throw error;

  const latestByMedia = new Map<string, CompetitorSubscriberView>();
  for (const r of data ?? []) {
    const mc = r.media_company as unknown as
      | { name: string; is_our_company: boolean }
      | null;
    if (!mc || mc.is_our_company) continue;
    if (latestByMedia.has(mc.name)) continue;
    const deltaPct =
      r.subscriber_count > 0 && r.seven_day_delta
        ? Number(((r.seven_day_delta / r.subscriber_count) * 100).toFixed(1))
        : 0;
    latestByMedia.set(mc.name, {
      media: mc.name,
      value: r.subscriber_count,
      delta: deltaPct,
    });
  }

  return Array.from(latestByMedia.values()).sort((a, b) => b.value - a.value);
}

// ===================================================================
// Top comments
// ===================================================================

export async function getTopComments(limit = 10): Promise<TopCommentView[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("comment_metric")
    .select(
      "comment_metric_id, comment_count, like_count, engagement_score, source, article:article_id(article_id, title, media_company:media_company_id(name))"
    )
    .order("comment_count", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((r) => {
    const art = r.article as unknown as
      | {
          article_id: number;
          title: string;
          media_company: { name: string } | null;
        }
      | null;
    return {
      article_id: art?.article_id ?? 0,
      title: art?.title ?? "(기사 없음)",
      media: art?.media_company?.name ?? "-",
      comments: r.comment_count,
      likes: r.like_count,
      engagement: r.engagement_score == null ? null : Number(r.engagement_score),
      source: r.source,
    };
  });
}

// ===================================================================
// AI summary (reports)
// ===================================================================

export async function getReports(
  type: "daily" | "weekly" | "issue" | "competitor" | "all" = "all",
  limit = 10
): Promise<AISummaryView[]> {
  const sb = getSupabase();
  let query = sb
    .from("ai_summary")
    .select(
      "ai_summary_id, summary_type, summary_date, title, content, source_metadata, model_version"
    )
    .order("summary_date", { ascending: false })
    .limit(limit);

  if (type !== "all") query = query.eq("summary_type", type);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((r) => {
    const meta = (r.source_metadata ?? {}) as Record<string, unknown>;
    const bulletsRaw = (meta.bullets as string[] | undefined) ?? [];
    return {
      summary_id: r.ai_summary_id,
      type: r.summary_type as AISummaryView["type"],
      summary_date: r.summary_date,
      title: r.title,
      content: r.content,
      bullets: Array.isArray(bulletsRaw) ? bulletsRaw : [],
      model_version: r.model_version,
    };
  });
}

export async function getLatestDailySummary(): Promise<AISummaryView | null> {
  const rows = await getReports("daily", 1);
  return rows[0] ?? null;
}

// ===================================================================
// Issue detail
// ===================================================================

export async function getIssueDetail(
  clusterId: number
): Promise<IssueDetail | null> {
  const sb = getSupabase();

  const { data: cluster, error } = await sb
    .from("issue_cluster")
    .select(
      "issue_cluster_id, cluster_key, representative_title, summary, keywords, confidence_score, cluster_date, model_version"
    )
    .eq("issue_cluster_id", clusterId)
    .maybeSingle();

  if (error) throw error;
  if (!cluster) return null;

  const { data: rel, error: relErr } = await sb
    .from("issue_cluster_article")
    .select(
      "similarity_score, is_representative, article:article_id(article_id, title, category, published_at, url, media_company:media_company_id(name))"
    )
    .eq("issue_cluster_id", clusterId)
    .order("similarity_score", { ascending: false, nullsFirst: false });

  if (relErr) throw relErr;

  const articles: IssueArticleView[] = (rel ?? []).flatMap((r) => {
    const art = r.article as unknown as
      | {
          article_id: number;
          title: string;
          category: string | null;
          published_at: string | null;
          url: string;
          media_company: { name: string } | null;
        }
      | null;
    if (!art) return [];
    return [
      {
        article_id: art.article_id,
        title: art.title,
        media: art.media_company?.name ?? "-",
        category: art.category,
        published_at: art.published_at,
        url: art.url,
        similarity:
          r.similarity_score == null ? null : Number(r.similarity_score),
        is_representative: r.is_representative,
      },
    ];
  });

  const mediaSet = new Set(articles.map((a) => a.media));
  mediaSet.delete("-");

  return {
    cluster_id: cluster.issue_cluster_id,
    cluster_key: cluster.cluster_key,
    title: cluster.representative_title,
    summary: cluster.summary,
    keywords: cluster.keywords ?? [],
    confidence: Number(cluster.confidence_score ?? 0),
    cluster_date: cluster.cluster_date,
    model_version: cluster.model_version,
    articles,
    competitor_count: mediaSet.size,
  };
}

export async function getIssueAISummary(
  clusterId: number
): Promise<AISummaryView | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ai_summary")
    .select(
      "ai_summary_id, summary_type, summary_date, title, content, source_metadata, model_version"
    )
    .eq("issue_cluster_id", clusterId)
    .eq("summary_type", "issue")
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const meta = (data.source_metadata ?? {}) as Record<string, unknown>;
  const bulletsRaw = (meta.bullets as string[] | undefined) ?? [];
  return {
    summary_id: data.ai_summary_id,
    type: data.summary_type as AISummaryView["type"],
    summary_date: data.summary_date,
    title: data.title,
    content: data.content,
    bullets: Array.isArray(bulletsRaw) ? bulletsRaw : [],
    model_version: data.model_version,
  };
}

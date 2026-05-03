import { getSupabase } from "./supabase";
import { SECTION_ORDER, type MediaSectionRanking, type SectionData, type SectionArticle } from "./naver-section";

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
  mediaNames: string[];
  mediaCount: number;
  confidence: number;
  cluster_date: string;
};

type IssueCandidate = Omit<IssueView, "rank"> & {
  articleIds: number[];
  articleFingerprint: string;
};

export type RankingArticleView = {
  article_id: number;
  title: string;
  media: string;
  category: string | null;
  published_at: string | null;
  url: string;
};

export type CompetitorItem = { name: string; url: string | null };

export type MissedAlertView = {
  alert_id: number;
  title: string;
  competitors: CompetitorItem[];
  priority: "high" | "medium" | "low";
  gap_minutes: number;
  reason: string | null;
  status: string;
  detected_at: string;
  verdict: string | null;
  similar_article: { title: string; url: string } | null;
};

export type SubscriberPointView = {
  snapshot_date: string;
  subscriber_count: number;
  daily_delta: number | null;
};

export type CompetitorSubscriberSnapshotView = {
  snapshotDate: string;
  subscriberCount: number | null;
  dailyDelta: number | null;
};

export type CompetitorSubscriberView = {
  media: string;
  latestValue: number;
  share: number;
  currentRank: number;
  weekAgoRank: number | null;
  rankDelta: number | null;
  tableSnapshots: CompetitorSubscriberSnapshotView[];
  trendSnapshots: CompetitorSubscriberSnapshotView[];
  isPinned: boolean;
};

export type TopCommentView = {
  article_id: number;
  title: string;
  url: string | null;
  media: string;
  comments: number;
  likes: number | null;
  engagement: number | null;
  source: string;
};

export type CompetitorCommentMedia = {
  media: string;
  articles: TopCommentView[];
};

export type SummarySource = {
  cluster_id: number;
  title: string;
};

export type BulletItem = {
  text: string;
  cluster_id: number | null;
  cluster_title: string | null;
};

export type AISummaryView = {
  summary_id: number;
  type: "daily" | "weekly" | "issue" | "competitor";
  summary_date: string;
  title: string;
  content: string;
  bullets: BulletItem[];
  model_version: string;
  sources: SummarySource[];
};

export type OverviewStats = {
  today_articles: number;          // 자사 오늘 발행 수 (KST)
  today_articles_delta_pct: number; // 전일 대비 %
  today_comments: number;
  today_subscriber_delta: number;
  total_subscribers: number;
};

export type CompareArticle = { title: string; url: string | null };

export type CompareMediaCard = {
  mediaName: string;
  normalizedName: string;
  articles: CompareArticle[];
};

export type CompareMatrix = {
  cards: CompareMediaCard[];
};

export type MediaNaverIdView = {
  name: string;
  normalizedName: string;
  naverMediaId: string | null;
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
const PINNED_SUBSCRIBER_MEDIA = new Set(["세계일보"]);
const SUBSCRIBER_TABLE_DATE_COUNT = 3;
const SUBSCRIBER_TREND_DAY_COUNT = 15;

function articleFingerprint(articleIds: number[]): string {
  return articleIds.slice().sort((a, b) => a - b).join(":");
}

function normalizeIssueText(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z\uac00-\ud7a3]/g, "");
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeIssueText(value);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  if (grams.size === 0 && normalized) grams.add(normalized);
  return grams;
}

function overlapRatio<T>(left: Iterable<T>, right: Iterable<T>): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / Math.min(a.size, b.size);
}

function textSimilarity(left: string, right: string): number {
  return overlapRatio(bigrams(left), bigrams(right));
}

function keywordSimilarity(left: string[], right: string[]): number {
  const a = new Set(left.map(normalizeIssueText).filter(Boolean));
  const b = new Set(right.map(normalizeIssueText).filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  if (intersection < 2) return 0;
  return intersection / Math.min(a.size, b.size);
}

function sameIssue(left: IssueCandidate, right: IssueCandidate): boolean {
  if (left.articleFingerprint && left.articleFingerprint === right.articleFingerprint) {
    return true;
  }
  if (overlapRatio(left.articleIds, right.articleIds) >= 0.6) {
    return true;
  }
  if (normalizeIssueText(left.title) === normalizeIssueText(right.title)) {
    return true;
  }
  if (textSimilarity(left.title, right.title) >= 0.55) {
    return true;
  }
  return keywordSimilarity(left.keywords, right.keywords) >= 0.4;
}

function isBetterIssue(left: IssueCandidate, right: IssueCandidate): boolean {
  if (left.mediaCount !== right.mediaCount) return left.mediaCount > right.mediaCount;
  if (left.articles !== right.articles) return left.articles > right.articles;
  return left.confidence > right.confidence;
}

function dedupeIssues(candidates: IssueCandidate[]): IssueCandidate[] {
  const deduped: IssueCandidate[] = [];
  for (const candidate of candidates) {
    const duplicateIndexes = deduped
      .map((item, index) => (sameIssue(candidate, item) ? index : -1))
      .filter((index) => index !== -1);

    if (duplicateIndexes.length === 0) {
      deduped.push(candidate);
    } else {
      const firstIndex = duplicateIndexes[0];
      const best = [
        candidate,
        ...duplicateIndexes.map((index) => deduped[index]),
      ].reduce((currentBest, item) =>
        isBetterIssue(item, currentBest) ? item : currentBest
      );

      for (let i = duplicateIndexes.length - 1; i >= 0; i -= 1) {
        deduped.splice(duplicateIndexes[i], 1);
      }
      deduped.splice(firstIndex, 0, best);
    }
  }
  return deduped;
}

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

export async function getIssues(
  limit = 20,
  minArticles = 2
): Promise<IssueView[]> {
  const sb = getSupabase();
  const fetchLimit = Math.max(limit * 4, 40);
  const { data, error } = await sb
    .from("issue_cluster")
    .select(
      "issue_cluster_id, cluster_key, representative_title, summary, keywords, confidence_score, cluster_date"
    )
    .order("cluster_date", { ascending: false })
    .order("confidence_score", { ascending: false })
    .limit(fetchLimit);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const clusterIds = data.map((c) => c.issue_cluster_id);
  const { data: relatedRows, error: relatedError } = await sb
    .from("issue_cluster_article")
    .select(
      "issue_cluster_id, article_id, article:article_id(media_company:media_company_id(name))"
    )
    .in("issue_cluster_id", clusterIds);

  if (relatedError) throw relatedError;

  const statsByCluster = new Map<
    number,
    { articleCount: number; mediaNames: string[]; articleIds: number[] }
  >();

  for (const row of relatedRows ?? []) {
    const existing = statsByCluster.get(row.issue_cluster_id) ?? {
      articleCount: 0,
      mediaNames: [],
      articleIds: [],
    };
    existing.articleCount += 1;
    existing.articleIds.push(row.article_id);

    const article = row.article as unknown as
      | { media_company: { name: string } | null }
      | null;
    const mediaName = article?.media_company?.name;
    if (mediaName && !existing.mediaNames.includes(mediaName)) {
      existing.mediaNames.push(mediaName);
    }
    statsByCluster.set(row.issue_cluster_id, existing);
  }

  const candidates: IssueCandidate[] = data
    .map((c) => {
      const stats = statsByCluster.get(c.issue_cluster_id) ?? {
        articleCount: 0,
        mediaNames: [],
        articleIds: [],
      };
      return {
        cluster_id: c.issue_cluster_id,
        cluster_key: c.cluster_key,
        title: c.representative_title,
        summary: c.summary,
        keywords: c.keywords ?? [],
        articles: stats.articleCount,
        mediaNames: stats.mediaNames,
        mediaCount: stats.mediaNames.length,
        articleIds: stats.articleIds,
        articleFingerprint: articleFingerprint(stats.articleIds),
        confidence: Number(c.confidence_score ?? 0),
        cluster_date: c.cluster_date,
      };
    })
    .filter((c) => c.articles >= minArticles && c.mediaCount >= 2);

  return dedupeIssues(candidates)
    .slice(0, limit)
    .map(({ articleIds: _articleIds, articleFingerprint: _fingerprint, ...c }, i) => {
      return {
        ...c,
        rank: i + 1,
      };
    });
}

// ===================================================================
// Dashboard stats
// ===================================================================

function todayKstStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yesterdayKstStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000 - 24 * 60 * 60_000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const sb = getSupabase();
  const since = startOfToday();
  const todayKst = todayKstStr();
  const yKst = yesterdayKstStr();

  const [pubRes, commentsRes, subRes] = await Promise.all([
    sb
      .from("daily_publication_count")
      .select(
        "snapshot_date, publication_count, media_company!inner(is_our_company)"
      )
      .eq("media_company.is_our_company", true)
      .eq("source", "naver")
      .in("snapshot_date", [todayKst, yKst]),
    sb
      .from("comment_metric")
      .select("article_id, comment_count")
      .gte("measured_at", new Date(Date.now() - 25 * 60 * 60_000).toISOString())
      .order("article_id")
      .order("comment_count", { ascending: false })
      .limit(3000),
    sb
      .from("subscriber_snapshot")
      .select(
        "subscriber_count, daily_delta, snapshot_date, media_company!inner(is_our_company)"
      )
      .eq("media_company.is_our_company", true)
      .order("snapshot_date", { ascending: false })
      .limit(1),
  ]);

  if (pubRes.error) throw pubRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (subRes.error) throw subRes.error;

  const todayRow = (pubRes.data ?? []).find(
    (r) => r.snapshot_date === todayKst
  );
  const yRow = (pubRes.data ?? []).find((r) => r.snapshot_date === yKst);
  const today_articles = todayRow?.publication_count ?? 0;
  const yesterday_articles = yRow?.publication_count ?? 0;
  const today_articles_delta_pct =
    yesterday_articles > 0
      ? Number(
          (
            ((today_articles - yesterday_articles) / yesterday_articles) *
            100
          ).toFixed(1)
        )
      : 0;

  const seenArticle = new Set<number>();
  let today_comments = 0;
  for (const r of commentsRes.data ?? []) {
    if (!seenArticle.has(r.article_id)) {
      seenArticle.add(r.article_id);
      today_comments += r.comment_count ?? 0;
    }
  }

  const latestSub = subRes.data?.[0];

  return {
    today_articles,
    today_articles_delta_pct,
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
  limit = 5
): Promise<CompareMatrix> {
  const sb = getSupabase();

  const { data: mediaList, error: mediaErr } = await sb
    .from("media_company")
    .select("name, normalized_name")
    .in("normalized_name", normalizedNames);
  if (mediaErr) throw mediaErr;

  const mediaByNorm = new Map(
    (mediaList ?? []).map((m) => [m.normalized_name, m.name])
  );

  const cards = await Promise.all(
    normalizedNames
      .filter((n) => mediaByNorm.has(n))
      .map(async (normalizedName) => {
        const mediaName = mediaByNorm.get(normalizedName)!;
        const { data, error } = await sb
          .from("article")
          .select("title, url, media_company!inner(name)")
          .eq("media_company.name", mediaName)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (error) throw error;
        return {
          mediaName,
          normalizedName,
          articles: (data ?? []).map((a) => ({
            title: a.title as string,
            url: (a.url as string) ?? null,
          })),
        };
      })
  );

  return { cards };
}

export async function getMediaNaverIds(
  normalizedNames: string[]
): Promise<MediaNaverIdView[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("media_company")
    .select("name, normalized_name, naver_media_id")
    .in("normalized_name", normalizedNames);
  if (error) throw error;
  const map = new Map((data ?? []).map((m) => [m.normalized_name, m]));
  return normalizedNames
    .map((n) => map.get(n))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({
      name: m.name,
      normalizedName: m.normalized_name,
      naverMediaId: m.naver_media_id ?? null,
    }));
}

export async function getSectionRankings(
  normalizedNames: string[]
): Promise<MediaSectionRanking[]> {
  const sb = getSupabase();

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayKst = kst.toISOString().slice(0, 10);

  const { data: mediaList, error: mediaErr } = await sb
    .from("media_company")
    .select("media_company_id, name, normalized_name")
    .in("normalized_name", normalizedNames);
  if (mediaErr) throw mediaErr;
  if (!mediaList?.length) return [];

  const mediaIds = mediaList.map((m) => m.media_company_id);

  const { data, error } = await sb
    .from("section_ranking_snapshot")
    .select("media_company_id, section_name, rank, title, url")
    .in("media_company_id", mediaIds)
    .eq("ranking_date", todayKst)
    .order("rank");
  if (error) throw error;

  const mediaById = new Map(mediaList.map((m) => [m.media_company_id, m]));

  return normalizedNames
    .map((normalizedName) => {
      const media = mediaList.find((m) => m.normalized_name === normalizedName);
      if (!media) return null;

      const rows = (data ?? []).filter(
        (r) => r.media_company_id === media.media_company_id
      );

      const sectionMap = new Map<string, SectionArticle[]>();
      const seen = new Set<string>();
      for (const row of rows) {
        const key = `${row.section_name}-${row.rank}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!sectionMap.has(row.section_name)) sectionMap.set(row.section_name, []);
        sectionMap.get(row.section_name)!.push({
          rank: row.rank,
          title: row.title,
          url: row.url ?? "",
        });
      }

      const sections: SectionData[] = SECTION_ORDER.filter((s) =>
        sectionMap.has(s)
      ).map((s) => ({ name: s, articles: sectionMap.get(s)! }));

      return { mediaName: media.name, normalizedName, sections };
    })
    .filter((m): m is MediaSectionRanking => !!m);
}

// ===================================================================
// Missed issue alerts (Gap)
// ===================================================================

export async function getMissedAlerts(
  status: "open" | "reviewing" | "resolved" | "ignored" | "all" = "open",
  limit = 20
): Promise<MissedAlertView[]> {
  const sb = getSupabase();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  let query = sb
    .from("missed_issue_alert")
    .select(
      "missed_issue_alert_id, alert_status, competitor_article_count, priority_score, reason, detected_at, target_media_company_id, verdict, " +
      "similar_article:similar_article_id(article_id, title, url), " +
      "issue_cluster:issue_cluster_id(issue_cluster_id, representative_title)"
    )
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("alert_status", status);
  // open 은 최근 2일치만, reviewing 은 기간 제한 없이 표시
  if (status === "open") query = query.gte("detected_at", twoDaysAgo);
  if (status === "all") {
    // all 조회 시: open은 2일치 + reviewing은 전체 → OR 조건 불가하므로 클라이언트에서 필터
  }

  const { data, error } = await query;
  if (error) throw error;

  // verdict / similar_article_id 는 신규 컬럼이라 생성 타입에 미반영 → any 캐스팅
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alerts = (data ?? []) as any[];

  // 클러스터별 경쟁사 기사 목록 (매체당 첫 번째 기사 URL 사용)
  const clusterIds = alerts
    .map((a) => {
      const ic = a.issue_cluster as unknown as { issue_cluster_id: number } | null;
      return ic?.issue_cluster_id;
    })
    .filter((x): x is number => typeof x === "number");

  // Map<cluster_id, Map<media_company_id, { name, url }>>
  const competitorsByCluster = new Map<number, Map<number, { name: string; url: string | null }>>();
  if (clusterIds.length > 0) {
    const { data: relData, error: relErr } = await sb
      .from("issue_cluster_article")
      .select(
        "issue_cluster_id, article:article_id(article_id, url, media_company:media_company_id(media_company_id, name))"
      )
      .in("issue_cluster_id", clusterIds);
    if (relErr) throw relErr;

    for (const r of relData ?? []) {
      const art = r.article as unknown as
        | { article_id: number; url: string; media_company: { media_company_id: number; name: string } | null }
        | null;
      const mc = art?.media_company;
      if (!mc) continue;
      const cid = r.issue_cluster_id;
      if (!competitorsByCluster.has(cid)) competitorsByCluster.set(cid, new Map());
      // 매체당 첫 번째 기사 URL만 유지
      if (!competitorsByCluster.get(cid)!.has(mc.media_company_id)) {
        competitorsByCluster.get(cid)!.set(mc.media_company_id, {
          name: mc.name,
          url: art?.url ?? null,
        });
      }
    }
  }

  return alerts.map((a) => {
    const ic = a.issue_cluster as unknown as
      | { issue_cluster_id: number; representative_title: string }
      | null;
    const simArt = a.similar_article as unknown as
      | { article_id: number; title: string; url: string }
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
      verdict: (a.verdict as string | null) ?? null,
      similar_article: simArt ? { title: simArt.title, url: simArt.url } : null,
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
  const { data, error } = await sb
    .from("subscriber_snapshot")
    .select(
      "subscriber_count, daily_delta, snapshot_date, media_company:media_company_id(name, is_our_company)"
    )
    .gte("snapshot_date", new Date(Date.now() - (SUBSCRIBER_TREND_DAY_COUNT + 1) * 24 * 60 * 60_000).toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: false });

  if (error) throw error;

  const filtered = (data ?? []).flatMap((r) => {
    const mc = r.media_company as unknown as
      | { name: string; is_our_company: boolean }
      | null;
    if (!mc) return [];
    if (mc.is_our_company && !PINNED_SUBSCRIBER_MEDIA.has(mc.name)) return [];
    return [
      {
        media: mc.name,
        snapshotDate: r.snapshot_date,
        subscriberCount: r.subscriber_count,
        dailyDelta: r.daily_delta,
      },
    ];
  });

  if (filtered.length === 0) return [];

  const snapshotDates = Array.from(
    new Set(filtered.map((row) => row.snapshotDate))
  ).sort((a, b) => b.localeCompare(a));

  const tableDates = snapshotDates.slice(0, SUBSCRIBER_TABLE_DATE_COUNT);
  const trendDates = snapshotDates
    .slice(0, SUBSCRIBER_TREND_DAY_COUNT)
    .reverse();
  if (tableDates.length === 0) return [];

  const weekAgoDate = snapshotDates[6] ?? snapshotDates.at(-1) ?? null;

  const rowsByMedia = new Map<
    string,
    Map<string, { subscriberCount: number; dailyDelta: number | null }>
  >();

  for (const row of filtered) {
    const existing = rowsByMedia.get(row.media) ?? new Map();
    existing.set(row.snapshotDate, {
      subscriberCount: row.subscriberCount,
      dailyDelta: row.dailyDelta,
    });
    rowsByMedia.set(row.media, existing);
  }

  const latestRanked = Array.from(rowsByMedia.entries())
    .map(([media, snapshots]) => ({
      media,
      value: snapshots.get(tableDates[0])?.subscriberCount ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  const currentRankByMedia = new Map(
    latestRanked.map((row, idx) => [row.media, idx + 1])
  );

  const totalLatestValue = latestRanked.reduce((acc, row) => acc + row.value, 0);

  const weekAgoRankByMedia = new Map<string, number>();
  if (weekAgoDate) {
    Array.from(rowsByMedia.entries())
      .map(([media, snapshots]) => ({
        media,
        value: snapshots.get(weekAgoDate)?.subscriberCount,
      }))
      .filter((row): row is { media: string; value: number } => row.value != null)
      .sort((a, b) => b.value - a.value)
      .forEach((row, idx) => {
        weekAgoRankByMedia.set(row.media, idx + 1);
      });
  }

  return Array.from(rowsByMedia.entries())
    .map(([media, snapshots]) => {
      const latestValue = snapshots.get(tableDates[0])?.subscriberCount ?? 0;
      const currentRank = currentRankByMedia.get(media) ?? 0;
      const weekAgoRank = weekAgoRankByMedia.get(media) ?? null;
      return {
        media,
        latestValue,
        share:
          totalLatestValue > 0
            ? Number(((latestValue / totalLatestValue) * 100).toFixed(3))
            : 0,
        currentRank,
        weekAgoRank,
        rankDelta:
          weekAgoRank == null ? null : Number((weekAgoRank - currentRank).toFixed(0)),
        tableSnapshots: tableDates.map((snapshotDate) => {
          const snapshot = snapshots.get(snapshotDate);
          return {
            snapshotDate,
            subscriberCount: snapshot?.subscriberCount ?? null,
            dailyDelta: snapshot?.dailyDelta ?? null,
          };
        }),
        trendSnapshots: trendDates.map((snapshotDate) => {
          const snapshot = snapshots.get(snapshotDate);
          return {
            snapshotDate,
            subscriberCount: snapshot?.subscriberCount ?? null,
            dailyDelta: snapshot?.dailyDelta ?? null,
          };
        }),
        isPinned: PINNED_SUBSCRIBER_MEDIA.has(media),
      };
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.currentRank - b.currentRank;
    });
}

// ===================================================================
// Top comments
// ===================================================================

export async function getTopComments(limit = 10): Promise<TopCommentView[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("comment_metric")
    .select(
      "comment_metric_id, comment_count, like_count, engagement_score, source, article:article_id(article_id, title, url, media_company:media_company_id(name))"
    )
    .order("comment_count", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((r) => {
    const art = r.article as unknown as
      | {
          article_id: number;
          title: string;
          url: string | null;
          media_company: { name: string } | null;
        }
      | null;
    return {
      article_id: art?.article_id ?? 0,
      title: art?.title ?? "(기사 없음)",
      url: art?.url ?? null,
      media: art?.media_company?.name ?? "-",
      comments: r.comment_count,
      likes: r.like_count,
      engagement: r.engagement_score == null ? null : Number(r.engagement_score),
      source: r.source,
    };
  });
}

export async function getOurTopComments(limit = 4): Promise<TopCommentView[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("comment_metric")
    .select(
      "comment_count, like_count, engagement_score, source, article:article_id!inner(article_id, title, url, media_company:media_company_id!inner(name, is_our_company))"
    )
    .eq("article.media_company.is_our_company", true)
    .gte("measured_at", new Date(Date.now() - 25 * 60 * 60_000).toISOString())
    .order("comment_count", { ascending: false })
    .limit(limit * 10);

  if (error) throw error;

  type RawRow = typeof data extends (infer T)[] | null ? T : never;
  const seenTitles = new Set<string>();
  const deduped: RawRow[] = [];
  for (const r of data ?? []) {
    const art = r.article as unknown as { article_id: number; title: string } | null;
    const title = art?.title ?? "";
    if (title && !seenTitles.has(title)) {
      seenTitles.add(title);
      deduped.push(r);
      if (deduped.length >= limit) break;
    }
  }

  return deduped.map((r) => {
    const art = r.article as unknown as
      | {
          article_id: number;
          title: string;
          url: string | null;
          media_company: { name: string; is_our_company: boolean } | null;
        }
      | null;
    return {
      article_id: art?.article_id ?? 0,
      title: art?.title ?? "(기사 없음)",
      url: art?.url ?? null,
      media: art?.media_company?.name ?? "-",
      comments: r.comment_count,
      likes: r.like_count,
      engagement: r.engagement_score == null ? null : Number(r.engagement_score),
      source: r.source,
    };
  });
}

const COMPETITOR_NAMES = ["chosun", "joongang", "donga", "mk"] as const;

export async function getCompetitorTopComments(
  perMedia = 5
): Promise<CompetitorCommentMedia[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("comment_metric")
    .select(
      "comment_count, like_count, engagement_score, source, article:article_id!inner(article_id, title, url, media_company:media_company_id!inner(name, normalized_name))"
    )
    .in("article.media_company.normalized_name", [...COMPETITOR_NAMES])
    .gte("measured_at", new Date(Date.now() - 25 * 60 * 60_000).toISOString())
    .order("comment_count", { ascending: false })
    .limit(perMedia * COMPETITOR_NAMES.length * 10);

  if (error) throw error;

  type RawArt = {
    article_id: number;
    title: string;
    url: string | null;
    media_company: { name: string; normalized_name: string } | null;
  };

  const seenByMedia = new Map<string, Set<number>>();
  const grouped = new Map<string, TopCommentView[]>();
  for (const r of data ?? []) {
    const art = r.article as unknown as RawArt | null;
    const name = art?.media_company?.name ?? "-";
    const articleId = art?.article_id ?? 0;
    if (!grouped.has(name)) grouped.set(name, []);
    if (!seenByMedia.has(name)) seenByMedia.set(name, new Set());
    const list = grouped.get(name)!;
    const seen = seenByMedia.get(name)!;
    if (list.length < perMedia && !seen.has(articleId)) {
      seen.add(articleId);
      list.push({
        article_id: articleId,
        title: art?.title ?? "(기사 없음)",
        url: art?.url ?? null,
        media: name,
        comments: r.comment_count,
        likes: r.like_count,
        engagement:
          r.engagement_score == null ? null : Number(r.engagement_score),
        source: r.source,
      });
    }
  }

  return Array.from(grouped.entries()).map(([media, articles]) => ({
    media,
    articles,
  }));
}

// ===================================================================
// AI summary (reports)
// ===================================================================

function parseBullets(raw: unknown): BulletItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    if (typeof b === "string") return { text: b, cluster_id: null, cluster_title: null };
    if (typeof b === "object" && b !== null) {
      const obj = b as Record<string, unknown>;
      return {
        text: typeof obj.text === "string" ? obj.text : "",
        cluster_id: typeof obj.cluster_id === "number" ? obj.cluster_id : null,
        cluster_title: typeof obj.cluster_title === "string" ? obj.cluster_title : null,
      };
    }
    return { text: "", cluster_id: null, cluster_title: null };
  });
}


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
    return {
      summary_id: r.ai_summary_id,
      type: r.summary_type as AISummaryView["type"],
      summary_date: r.summary_date,
      title: r.title,
      content: r.content,
      bullets: parseBullets(meta.bullets),
      model_version: r.model_version,
      sources: [],
    };
  });
}

export async function getLatestDailySummary(): Promise<AISummaryView | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ai_summary")
    .select("ai_summary_id, summary_type, summary_date, title, content, source_metadata, model_version")
    .eq("summary_type", "daily")
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const meta = (data.source_metadata ?? {}) as Record<string, unknown>;
  const bullets = parseBullets(meta.bullets);
  const clusterKeys = (meta.cluster_keys as string[] | undefined) ?? [];

  let sources: SummarySource[] = [];
  if (clusterKeys.length > 0) {
    const { data: clusters } = await sb
      .from("issue_cluster")
      .select("issue_cluster_id, representative_title")
      .in("cluster_key", clusterKeys)
      .order("issue_cluster_id", { ascending: true });

    sources = (clusters ?? []).map((c) => ({
      cluster_id: c.issue_cluster_id,
      title: c.representative_title ?? "(제목 없음)",
    }));
  }

  return {
    summary_id: data.ai_summary_id,
    type: data.summary_type as AISummaryView["type"],
    summary_date: data.summary_date,
    title: data.title,
    content: data.content,
    bullets,
    model_version: data.model_version,
    sources,
  };
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

// ===================================================================
// 자사 기사 현황
// ===================================================================

export type OurArticleItem = {
  article_id: number;
  title: string;
  url: string | null;
  category: string | null;
  author_name: string | null;
  published_at: string | null;
  cluster_id: number | null;
};

export type OurArticlePageData = {
  articles: OurArticleItem[];
  total: number;
  issueLinked: number;
  sectionCounts: { section: string; count: number }[];
  trend: { date: string; count: number }[];
  prevDayTotal: number;
};

const SECTION_LABEL: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  culture: "생활/문화",
  it: "IT/과학",
  world: "세계",
  entertainment: "연예",
  sports: "스포츠",
};

export function sectionLabel(category: string | null): string {
  if (!category) return "기타";
  return SECTION_LABEL[category] ?? category;
}

export async function getOurArticlesPage(
  date: string,
  page: number,
  perPage = 10
): Promise<OurArticlePageData> {
  const sb = getSupabase();

  const ourCompany = await sb
    .from("media_company")
    .select("media_company_id")
    .eq("is_our_company", true)
    .maybeSingle();
  const mediaId = ourCompany.data?.media_company_id;
  if (!mediaId) return { articles: [], total: 0, issueLinked: 0, sectionCounts: [], trend: [], prevDayTotal: 0 };

  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);

  // 병렬 조회
  const [allArticlesRes, trendRes, prevRes] = await Promise.all([
    sb
      .from("article")
      .select("article_id, title, url, category, author_name, published_at")
      .eq("media_company_id", mediaId)
      .gte("published_at", date + "T00:00:00+09:00")
      .lt("published_at", nextDateStr + "T00:00:00+09:00")
      .order("published_at", { ascending: false }),
    sb
      .from("daily_publication_count")
      .select("snapshot_date, publication_count")
      .eq("media_company_id", mediaId)
      .gte("snapshot_date", new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString().slice(0, 10))
      .lte("snapshot_date", date)
      .order("snapshot_date", { ascending: true }),
    sb
      .from("daily_publication_count")
      .select("publication_count")
      .eq("media_company_id", mediaId)
      .eq("snapshot_date", prevDateStr)
      .maybeSingle(),
  ]);

  const allArticles = allArticlesRes.data ?? [];
  const articleIds = allArticles.map((a) => a.article_id);

  // 클러스터 연결 조회
  const clusterMap = new Map<number, number>();
  if (articleIds.length > 0) {
    const { data: clusterRows } = await sb
      .from("issue_cluster_article")
      .select("article_id, issue_cluster_id")
      .in("article_id", articleIds);
    for (const r of clusterRows ?? []) {
      if (!clusterMap.has(r.article_id)) clusterMap.set(r.article_id, r.issue_cluster_id);
    }
  }

  const articles: OurArticleItem[] = allArticles.map((a) => ({
    article_id: a.article_id,
    title: a.title,
    url: a.url,
    category: a.category,
    author_name: a.author_name ?? null,
    published_at: a.published_at,
    cluster_id: clusterMap.get(a.article_id) ?? null,
  }));

  // 섹션별 집계
  const sectionMap = new Map<string, number>();
  for (const a of articles) {
    const key = a.category ?? "기타";
    sectionMap.set(key, (sectionMap.get(key) ?? 0) + 1);
  }
  const sectionCounts = Array.from(sectionMap.entries())
    .map(([section, count]) => ({ section, count }))
    .sort((a, b) => b.count - a.count);

  const start = (page - 1) * perPage;
  const pagedArticles = articles.slice(start, start + perPage);

  return {
    articles: pagedArticles,
    total: articles.length,
    issueLinked: clusterMap.size,
    sectionCounts,
    trend: (trendRes.data ?? []).map((r) => ({ date: r.snapshot_date, count: r.publication_count })),
    prevDayTotal: prevRes.data?.publication_count ?? 0,
  };
}

export async function getArticleList(
  date: string,
  page: number,
  perPage = 10
): Promise<{ articles: OurArticleItem[]; total: number }> {
  const sb = getSupabase();
  const ourCompany = await sb
    .from("media_company")
    .select("media_company_id")
    .eq("is_our_company", true)
    .maybeSingle();
  const mediaId = ourCompany.data?.media_company_id;
  if (!mediaId) return { articles: [], total: 0 };

  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  const { data: allRows } = await sb
    .from("article")
    .select("article_id, title, url, category, author_name, published_at")
    .eq("media_company_id", mediaId)
    .gte("published_at", `${date}T00:00:00+09:00`)
    .lt("published_at", `${nextDateStr}T00:00:00+09:00`)
    .order("published_at", { ascending: false });

  const all = allRows ?? [];
  const total = all.length;
  const start = (page - 1) * perPage;
  const sliced = all.slice(start, start + perPage);

  const clusterMap = new Map<number, number>();
  if (sliced.length > 0) {
    const { data: clusterRows } = await sb
      .from("issue_cluster_article")
      .select("article_id, issue_cluster_id")
      .in("article_id", sliced.map((a) => a.article_id));
    for (const r of clusterRows ?? []) {
      if (!clusterMap.has(r.article_id)) clusterMap.set(r.article_id, r.issue_cluster_id);
    }
  }

  return {
    articles: sliced.map((a) => ({
      article_id: a.article_id,
      title: a.title,
      url: a.url,
      category: a.category,
      author_name: a.author_name ?? null,
      published_at: a.published_at,
      cluster_id: clusterMap.get(a.article_id) ?? null,
    })),
    total,
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
  return {
    summary_id: data.ai_summary_id,
    type: data.summary_type as AISummaryView["type"],
    summary_date: data.summary_date,
    title: data.title,
    content: data.content,
    bullets: parseBullets(meta.bullets),
    model_version: data.model_version,
    sources: [],
  };
}

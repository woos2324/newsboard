import { unstable_cache } from "next/cache";
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
// Ranking — 대시보드 "매체별 랭킹 뉴스" 블록
// ===================================================================

export type RankingNewsItem = {
  rank: number;
  title: string;
  media: string;
  url: string;
};

export async function getRankingNews(limit = 500): Promise<RankingNewsItem[]> {
  const sb = getSupabase();

  const { data: latest } = await sb
    .from("ranking_news_snapshot")
    .select("snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .single();

  if (!latest) return [];

  const batchStart = new Date(
    new Date(latest.snapshot_at).getTime() - 30 * 60 * 1000
  ).toISOString();

  const { data: snapshots } = await sb
    .from("ranking_news_snapshot")
    .select("ranking_snapshot_id")
    .gte("snapshot_at", batchStart);

  if (!snapshots?.length) return [];

  const ids = snapshots.map((s) => s.ranking_snapshot_id);

  const { data, error } = await sb
    .from("ranking_news_item")
    .select(
      "rank_position, article!inner(title, url), ranking_news_snapshot!inner(media_company!inner(name))"
    )
    .in("ranking_snapshot_id", ids)
    .order("rank_position", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((item) => {
    const a = item.article as unknown as { title: string; url: string };
    const snap = item.ranking_news_snapshot as unknown as {
      media_company: { name: string };
    };
    return {
      rank: item.rank_position,
      title: a.title,
      media: snap.media_company.name,
      url: a.url,
    };
  });
}

// ===================================================================
// Compare — 매체별 최근 기사 grid (순위 x 매체)
// ===================================================================

async function _getCompareMatrix(
  normalizedNames: string[],
  limit = 5
): Promise<CompareMatrix> {
  const sb = getSupabase();

  // 1. 매체 정보 조회
  const { data: mediaList, error: mediaErr } = await sb
    .from("media_company")
    .select("media_company_id, name, normalized_name")
    .in("normalized_name", normalizedNames);
  if (mediaErr) throw mediaErr;
  if (!mediaList?.length) return { cards: [] };

  const mediaIds = mediaList.map((m) => m.media_company_id);

  // 2. 최근 24시간 내 각 매체의 최신 랭킹 스냅샷 조회 (1번 쿼리)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshots } = await sb
    .from("ranking_news_snapshot")
    .select("ranking_snapshot_id, media_company_id")
    .in("media_company_id", mediaIds)
    .gte("snapshot_at", since)
    .order("snapshot_at", { ascending: false });

  // 매체별 최신 스냅샷 ID만 추출
  const latestByMedia = new Map<number, number>();
  for (const snap of snapshots ?? []) {
    if (!latestByMedia.has(snap.media_company_id)) {
      latestByMedia.set(snap.media_company_id, snap.ranking_snapshot_id);
    }
  }

  // 3. 랭킹 기사 일괄 조회 (1번 쿼리)
  const snapshotIds = [...latestByMedia.values()];
  const { data: items } = snapshotIds.length
    ? await sb
        .from("ranking_news_item")
        .select("ranking_snapshot_id, rank_position, article!inner(title, url)")
        .in("ranking_snapshot_id", snapshotIds)
        .lte("rank_position", limit)
        .order("rank_position")
    : { data: [] };

  // 스냅샷별 기사 그룹핑
  const itemsBySnapshot = new Map<number, { title: string; url: string | null }[]>();
  for (const item of items ?? []) {
    const art = item.article as unknown as { title: string; url: string };
    const list = itemsBySnapshot.get(item.ranking_snapshot_id) ?? [];
    list.push({ title: art.title, url: art.url ?? null });
    itemsBySnapshot.set(item.ranking_snapshot_id, list);
  }

  // 4. 결과 조합 (요청 순서 유지)
  const cards = normalizedNames
    .map((normalizedName) => {
      const media = mediaList.find((m) => m.normalized_name === normalizedName);
      if (!media) return null;
      const snapshotId = latestByMedia.get(media.media_company_id);
      const articles = snapshotId ? (itemsBySnapshot.get(snapshotId) ?? []) : [];
      return { mediaName: media.name, normalizedName, articles };
    })
    .filter((c): c is NonNullable<typeof c> => !!c);

  return { cards };
}

export const getCompareMatrix = unstable_cache(
  _getCompareMatrix,
  ["compare-matrix"],
  { tags: ["compare"], revalidate: 3600 }
);

export type CompareMediaOption = { normalizedName: string; name: string };

const _getActiveCompareMedia = async (): Promise<CompareMediaOption[]> => {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("media_company")
    .select("name, normalized_name, is_our_company")
    .eq("is_active", true)
    .not("naver_media_id", "is", null)
    .order("is_our_company", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    normalizedName: m.normalized_name,
    name: m.name,
  }));
};

export const getActiveCompareMedia = unstable_cache(
  _getActiveCompareMedia,
  ["active-compare-media"],
  { tags: ["compare"], revalidate: 3600 }
);

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

async function _getSectionRankings(
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

export const getSectionRankings = unstable_cache(
  _getSectionRankings,
  ["compare-section-rankings"],
  { tags: ["compare"], revalidate: 3600 }
);

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
    .order("priority_score", { ascending: false, nullsFirst: false })
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
  pv: number | null;
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
  opinion: "오피니언",
};

export function sectionLabel(category: string | null): string {
  if (!category) return "기타";
  return SECTION_LABEL[category] ?? category;
}

function shiftDateString(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function fetchArticlePvMap(
  sb: ReturnType<typeof getSupabase>,
  articleIds: number[],
  date: string
): Promise<Map<number, number>> {
  if (articleIds.length === 0) return new Map();
  const { data } = await sb
    .from("article_pv_snapshot")
    .select("article_id, pv")
    .in("article_id", articleIds)
    .eq("data_date", date)
    .eq("device", "all")
    .eq("category", "all");
  const map = new Map<number, number>();
  for (const r of data ?? []) {
    if (r.article_id != null) map.set(r.article_id, r.pv);
  }
  return map;
}

async function _getOurArticlesPage(
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

  const nextDateStr = shiftDateString(date, 1);
  const prevDateStr = shiftDateString(date, -1);
  const trendDates = Array.from({ length: 7 }, (_, i) =>
    shiftDateString(date, i - 6)
  );

  // 병렬 조회
  const [allArticlesRes, ...countResults] = await Promise.all([
    sb
      .from("article")
      .select("article_id, title, url, category, author_name, published_at")
      .eq("media_company_id", mediaId)
      .gte("published_at", date + "T00:00:00+09:00")
      .lt("published_at", nextDateStr + "T00:00:00+09:00")
      .order("published_at", { ascending: false }),
    ...trendDates.map((trendDate) =>
      sb
        .from("article")
        .select("article_id", { count: "exact", head: true })
        .eq("media_company_id", mediaId)
        .gte("published_at", trendDate + "T00:00:00+09:00")
        .lt("published_at", shiftDateString(trendDate, 1) + "T00:00:00+09:00")
    ),
    sb
      .from("article")
      .select("article_id", { count: "exact", head: true })
      .eq("media_company_id", mediaId)
      .gte("published_at", prevDateStr + "T00:00:00+09:00")
      .lt("published_at", date + "T00:00:00+09:00"),
  ]);

  if (allArticlesRes.error) throw allArticlesRes.error;
  for (const result of countResults) {
    if (result.error) throw result.error;
  }

  const allArticles = allArticlesRes.data ?? [];
  const trendCounts = countResults.slice(0, trendDates.length);
  const prevRes = countResults[trendDates.length];
  const articleIds = allArticles.map((a) => a.article_id);

  // 클러스터 + PV 병렬 조회
  const clusterMap = new Map<number, number>();
  const [clusterRows, pvMap] = await Promise.all([
    articleIds.length > 0
      ? sb
          .from("issue_cluster_article")
          .select("article_id, issue_cluster_id")
          .in("article_id", articleIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    fetchArticlePvMap(sb, articleIds, date),
  ]);
  for (const r of clusterRows) {
    if (!clusterMap.has(r.article_id)) clusterMap.set(r.article_id, r.issue_cluster_id);
  }

  const articles: OurArticleItem[] = allArticles.map((a) => ({
    article_id: a.article_id,
    title: a.title,
    url: a.url,
    category: a.category,
    author_name: a.author_name ?? null,
    published_at: a.published_at,
    cluster_id: clusterMap.get(a.article_id) ?? null,
    pv: pvMap.get(a.article_id) ?? null,
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
    trend: trendDates.map((trendDate, i) => ({
      date: trendDate,
      count: trendCounts[i]?.count ?? 0,
    })),
    prevDayTotal: prevRes?.count ?? 0,
  };
}

export const getOurArticlesPage = unstable_cache(
  _getOurArticlesPage,
  ["our-articles-page"],
  { revalidate: 600, tags: ["articles"] }
);

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

  const slicedIds = sliced.map((a) => a.article_id);
  const clusterMap = new Map<number, number>();
  const [clusterRows, pvMap] = await Promise.all([
    slicedIds.length > 0
      ? sb
          .from("issue_cluster_article")
          .select("article_id, issue_cluster_id")
          .in("article_id", slicedIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    fetchArticlePvMap(sb, slicedIds, date),
  ]);
  for (const r of clusterRows) {
    if (!clusterMap.has(r.article_id)) clusterMap.set(r.article_id, r.issue_cluster_id);
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
      pv: pvMap.get(a.article_id) ?? null,
    })),
    total,
  };
}

// ===================================================================
// Google Trends — 급상승 검색어
// ===================================================================

export type TrendingKeyword = {
  trending_id: number;
  keyword: string;
  approx_traffic: string;       // 원문 "5천+"
  search_volume: number | null; // 정렬용 정수
  growth_rate: number | null;   // 증가율 %
  traffic_rank: number;
  started_at: string | null;
  started_ago_text: string | null;
  status: string | null;
  related_queries: string[] | null;
  matched_cluster_id: number | null;
  related_news: { title: string; url: string; source: string; published_ago?: string; thumbnail?: string }[] | null;
  ai_summary: string | null;
  title_suggestions: string[] | null;
  fetched_at: string;
};

async function _getTrendingKeywords(): Promise<TrendingKeyword[]> {
  const sb = getSupabase();

  const { data: latest } = await sb
    .from("trending_keyword")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (!latest) return [];

  const { data, error } = await sb
    .from("trending_keyword")
    .select(
      "trending_id, keyword, approx_traffic, search_volume, growth_rate, traffic_rank, started_at, started_ago_text, status, related_queries, matched_cluster_id, related_news, ai_summary, title_suggestions, fetched_at"
    )
    .eq("fetched_at", latest.fetched_at)
    .order("traffic_rank", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TrendingKeyword[];
}

// 트렌드는 3분마다 수집되므로 1분 캐시로 분리 (대시보드 5분 캐시와 별도)
export const getTrendingKeywords = unstable_cache(
  _getTrendingKeywords,
  ["trending-keywords"],
  { revalidate: 60, tags: ["trending"] }
);

export type TrendingWithCoverage = TrendingKeyword & {
  covered: boolean;
  our_article_title: string | null;
  our_article_url: string | null;
};

async function _getTrendingWithCoverage(): Promise<TrendingWithCoverage[]> {
  const sb = getSupabase();

  // trending + ourMedia 병렬 조회 (상호 의존성 없음)
  const [trending, { data: ourMedia }] = await Promise.all([
    getTrendingKeywords(),
    sb.from("media_company").select("media_company_id").eq("is_our_company", true).single(),
  ]);

  if (trending.length === 0) return [];
  if (!ourMedia) return trending.map((t) => ({ ...t, covered: false, our_article_title: null, our_article_url: null }));

  const ourId = ourMedia.media_company_id;
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const clusterIds = trending
    .map((t) => t.matched_cluster_id)
    .filter((id): id is number => id !== null);

  // 클러스터 기사 + 48h 자사 기사 병렬 조회
  const [clusterArticlesRes, ourArticlesRes] = await Promise.all([
    clusterIds.length > 0
      ? sb
          .from("issue_cluster_article")
          .select("issue_cluster_id, article(title, url, media_company_id)")
          .in("issue_cluster_id", clusterIds)
      : Promise.resolve({ data: [] }),
    sb.from("article").select("title, url").eq("media_company_id", ourId).gte("collected_at", since),
  ]);

  const clusterArticleMap = new Map<number, { title: string; url: string | null }>();
  for (const row of clusterArticlesRes.data ?? []) {
    const art = row.article as { title: string; url: string | null; media_company_id: number } | null;
    if (art && art.media_company_id === ourId && !clusterArticleMap.has(row.issue_cluster_id)) {
      clusterArticleMap.set(row.issue_cluster_id, { title: art.title, url: art.url });
    }
  }

  const articles = ourArticlesRes.data ?? [];

  return trending.map((t) => {
    // 1순위: 클러스터 기반 매칭
    const clusterMatch = t.matched_cluster_id !== null
      ? clusterArticleMap.get(t.matched_cluster_id) ?? null
      : null;
    if (clusterMatch) {
      return {
        ...t,
        covered: true,
        our_article_title: clusterMatch.title,
        our_article_url: clusterMatch.url,
      };
    }
    // 2순위: 키워드 포함 매칭 (클러스터 없거나 클러스터에 자사 기사 없을 때)
    const kw = t.keyword.toLowerCase();
    const kwMatch = articles.find((a) => a.title.toLowerCase().includes(kw));
    return {
      ...t,
      covered: !!kwMatch,
      our_article_title: kwMatch?.title ?? null,
      our_article_url: kwMatch?.url ?? null,
    };
  });
}

// 트렌드 페이지 전용 1분 캐시 (force-dynamic 페이지에서도 data-layer 캐시 적용)
export const getTrendingWithCoverage = unstable_cache(
  _getTrendingWithCoverage,
  ["trending-with-coverage"],
  { revalidate: 60, tags: ["trending"] }
);

// 특정 키워드의 최근 N시간 search_volume 시계열 (상세 패널 추이 그래프용)
export async function getTrendingHistory(
  keyword: string,
  hours = 6
): Promise<{ fetched_at: string; search_volume: number | null }[]> {
  const sb = getSupabase();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("trending_keyword")
    .select("fetched_at, search_volume")
    .eq("keyword", keyword)
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { fetched_at: string; search_volume: number | null }[];
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

// ===================================================================
// Traffic / PV — 네이버 파트너센터 PV 데이터
// ===================================================================

export type ArticlePvItem = {
  rank: number;
  title: string;
  reporter_name: string | null;
  pv: number;
  category: string;
  article_published_at: string;
  article_id: number | null;
  article_url: string | null;
};

export type HourlyPvItem = {
  hour: number;
  pv: number;
};

export type TrafficSourceItem = {
  source_category: string;
  category_ratio: number;
};

export type SearchKeywordItem = {
  rank: number;
  keyword: string;
  clicks: number;
  ratio: number;
};

export type RealtimeTickItem = {
  captured_at: string; // ISO
  pv: number;          // 그 시각까지의 오늘 누적 PV
};

export type TrafficPageData = {
  data_date: string;
  articles: ArticlePvItem[];
  totalArticles: number;
  hourlyToday: HourlyPvItem[];
  hourlyYesterday: HourlyPvItem[];
  trafficSources: TrafficSourceItem[];
  keywords: SearchKeywordItem[];
  totalKeywords: number;
  totalPvTop100: number;
  prevTotalPvTop100: number;
  totalHourlyToday: number;
  totalHourlyYesterday: number;
  topArticlePv: number;
  searchRatio: number; // 검색 유입 비중 (%)
  // 실시간(오늘) 모드 — 네이버가 오늘 시간대별 PV를 안 주므로 누적 tick 으로 대체
  isRealtime: boolean;
  realtimeTicks: RealtimeTickItem[]; // 오늘 누적 PV 시계열 (선택 device)
  capturedAt: string | null;         // 최신 tick 수집 시각 ("HH:MM 현재")
};

export type DailyCvRow = {
  data_date: string;
  total: number;
  pc: number;
  mobile: number;
};

async function _getDailyCvHistory(
  days = 30,
  section = "all",
  timeDimension = "daily"
): Promise<DailyCvRow[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from("daily_cv_snapshot")
    .select("data_date, device, pv")
    .eq("section", section)
    .eq("time_dimension", timeDimension)
    .order("data_date", { ascending: false })
    .limit(days * 3); // 3 devices per day

  const map = new Map<string, { total: number; pc: number; mobile: number }>();
  for (const r of data ?? []) {
    if (!map.has(r.data_date)) map.set(r.data_date, { total: 0, pc: 0, mobile: 0 });
    const entry = map.get(r.data_date)!;
    if (r.device === "all") entry.total = r.pv;
    else if (r.device === "pc") entry.pc = r.pv;
    else if (r.device === "mobile") entry.mobile = r.pv;
  }
  return Array.from(map.entries())
    .map(([data_date, pvs]) => ({ data_date, ...pvs }))
    .sort((a, b) => b.data_date.localeCompare(a.data_date));
}

async function _getLatestRealtimeDate(): Promise<string | null> {
  // realtime_pv_tick 에 데이터가 있는 최신 날짜 (오늘 실시간 수집 여부 판정용)
  const sb = getSupabase();
  const { data } = await sb
    .from("realtime_pv_tick")
    .select("data_date")
    .eq("device", "all")
    .order("data_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.data_date ?? null;
}

async function _getLatestTrafficDate(): Promise<string | null> {
  const sb = getSupabase();
  // hourly_pv_snapshot 기준으로 실제 pv > 0 데이터가 있는 최신 날짜 반환
  // (article_pv_snapshot 기준 시 hourly 집계 미완료 날짜가 선택되는 문제 방지)
  const { data } = await sb
    .from("hourly_pv_snapshot")
    .select("data_date")
    .eq("device", "all")
    .gt("pv", 0)
    .order("data_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.data_date ?? null;
}

async function _getTrafficPageData(
  date: string,
  articlesLimit = 100,
  keywordsLimit = 100,
  device = "all"
): Promise<TrafficPageData> {
  const sb = getSupabase();
  const prev = shiftDateString(date, -1);

  const [
    articlesRes,
    prevArticlesRes,
    hourlyTodayRes,
    hourlyYestRes,
    sourcesRes,
    keywordsRes,
    dailyCvTodayRes,
    dailyCvYestRes,
    ticksRes,
  ] = await Promise.all([
    sb
      .from("article_pv_snapshot")
      .select("rank, title, reporter_name, pv, category, article_published_at, article_id, article_url")
      .eq("data_date", date)
      .eq("device", device)
      .eq("category", "all")
      .order("rank", { ascending: true })
      .limit(articlesLimit),
    sb
      .from("article_pv_snapshot")
      .select("pv")
      .eq("data_date", prev)
      .eq("device", device)
      .eq("category", "all"),
    sb
      .from("hourly_pv_snapshot")
      .select("hour, pv")
      .eq("data_date", date)
      .eq("device", device)
      .eq("category", "all")
      .order("hour", { ascending: true }),
    sb
      .from("hourly_pv_snapshot")
      .select("hour, pv")
      .eq("data_date", prev)
      .eq("device", device)
      .eq("category", "all")
      .order("hour", { ascending: true }),
    sb
      .from("traffic_source_daily")
      .select("source_category, category_ratio, device")
      .eq("data_date", date)
      .is("source_detail_url", null)
      .order("category_ratio", { ascending: false }),
    sb
      .from("search_keyword_daily")
      .select("rank, keyword, clicks, ratio")
      .eq("data_date", date)
      .order("rank", { ascending: true })
      .limit(keywordsLimit),
    sb
      .from("daily_cv_snapshot")
      .select("pv")
      .eq("data_date", date)
      .eq("section", "all")
      .eq("time_dimension", "daily")
      .eq("device", device)
      .maybeSingle(),
    sb
      .from("daily_cv_snapshot")
      .select("pv")
      .eq("data_date", prev)
      .eq("section", "all")
      .eq("time_dimension", "daily")
      .eq("device", device)
      .maybeSingle(),
    sb
      .from("realtime_pv_tick")
      .select("captured_at, cum_pv")
      .eq("data_date", date)
      .eq("device", device)
      .order("captured_at", { ascending: true }),
  ]);

  if (articlesRes.error) throw articlesRes.error;
  if (hourlyTodayRes.error) throw hourlyTodayRes.error;

  const articleRows = articlesRes.data ?? [];
  const articles: ArticlePvItem[] = articleRows.map((r) => ({
    rank: r.rank,
    title: r.title,
    reporter_name: r.reporter_name,
    pv: r.pv,
    category: r.category,
    article_published_at: r.article_published_at,
    article_id: r.article_id,
    article_url: r.article_url,
  }));

  const hourlyToday: HourlyPvItem[] = (hourlyTodayRes.data ?? []).map((r) => ({
    hour: r.hour,
    pv: r.pv,
  }));
  const hourlyYesterday: HourlyPvItem[] = (hourlyYestRes.data ?? []).map((r) => ({
    hour: r.hour,
    pv: r.pv,
  }));

  // 유입경로: 선택 device 행 우선, 없으면(과거 날짜 등) 'all' 로 fallback
  const allSrc = sourcesRes.data ?? [];
  const devSrc = allSrc.filter((r) => r.device === device);
  const chosenSrc = devSrc.length ? devSrc : allSrc.filter((r) => r.device === "all");
  const trafficSources: TrafficSourceItem[] = chosenSrc.map((r) => ({
    source_category: r.source_category,
    category_ratio: Number(r.category_ratio),
  }));

  const keywords: SearchKeywordItem[] = (keywordsRes.data ?? []).map((r) => ({
    rank: r.rank,
    keyword: r.keyword,
    clicks: r.clicks,
    ratio: Number(r.ratio),
  }));

  const totalPvTop100 = articles.reduce((s, a) => s + a.pv, 0);
  const prevTotalPvTop100 = (prevArticlesRes.data ?? []).reduce(
    (s, r) => s + (r.pv ?? 0),
    0
  );
  const sumHourlyToday = hourlyToday.reduce((s, h) => s + h.pv, 0);
  const totalHourlyYesterdaySum = hourlyYesterday.reduce((s, h) => s + h.pv, 0);
  const topArticlePv = articles[0]?.pv ?? 0;

  // ── 실시간(오늘) 모드: hourly 가 없고 tick 이 있으면 누적 tick 으로 대체
  const realtimeTicks: RealtimeTickItem[] = (ticksRes.data ?? []).map((r) => ({
    captured_at: r.captured_at as string,
    pv: Number(r.cum_pv ?? 0),
  }));
  const isRealtime = hourlyToday.length === 0 && realtimeTicks.length > 0;
  const dailyCvToday = Number(dailyCvTodayRes.data?.pv ?? 0);
  const dailyCvYest = Number(dailyCvYestRes.data?.pv ?? 0);
  const capturedAt = realtimeTicks.length ? realtimeTicks[realtimeTicks.length - 1].captured_at : null;

  // 오늘 총 PV: 실시간이면 daily_cv 누적값(없으면 마지막 tick), 아니면 시간대 합
  const totalHourlyToday = isRealtime
    ? (dailyCvToday || (realtimeTicks.length ? realtimeTicks[realtimeTicks.length - 1].pv : 0))
    : sumHourlyToday;
  // 어제 총 PV: 실시간 비교용으로 daily_cv 우선(확정), 없으면 시간대 합
  const totalHourlyYesterday = isRealtime
    ? (dailyCvYest || totalHourlyYesterdaySum)
    : totalHourlyYesterdaySum;

  // 검색 유입 비중 = 검색 카테고리 source_category들의 ratio 합
  const searchRatio = trafficSources
    .filter((s) => s.source_category.includes("검색"))
    .reduce((sum, s) => sum + s.category_ratio, 0);

  return {
    data_date: date,
    articles,
    totalArticles: articles.length,
    hourlyToday,
    hourlyYesterday,
    trafficSources,
    keywords,
    totalKeywords: keywords.length,
    totalPvTop100,
    prevTotalPvTop100,
    totalHourlyToday,
    totalHourlyYesterday,
    topArticlePv,
    searchRatio,
    isRealtime,
    realtimeTicks,
    capturedAt,
  };
}

export const getDailyCvHistory = unstable_cache(
  _getDailyCvHistory,
  ["daily-cv-history"],
  { revalidate: 86400, tags: ["traffic"] }
);

export const getLatestTrafficDate = unstable_cache(
  _getLatestTrafficDate,
  ["latest-traffic-date"],
  { revalidate: 3600, tags: ["traffic"] }
);

export const getLatestRealtimeDate = unstable_cache(
  _getLatestRealtimeDate,
  ["latest-realtime-date"],
  { revalidate: 600, tags: ["traffic"] }
);

export const getTrafficPageData = unstable_cache(
  _getTrafficPageData,
  ["traffic-page-data"],
  { revalidate: 86400, tags: ["traffic"] }
);

// 대시보드 메인 페이지의 7개 쿼리를 한 번에 캐시 (5분)
// trending은 별도 2분 캐시로 분리 (getTrendingKeywords)
export const getDashboardData = unstable_cache(
  async () => {
    const [stats, issues, rankingNews, alerts, sub, topComments, aiSummary] =
      await Promise.all([
        getOverviewStats(),
        getIssues(4),
        getRankingNews(),
        getMissedAlerts("open", 5),
        getOurSubscriberSeries(7),
        getOurTopComments(4),
        getLatestDailySummary(),
      ]);
    return { stats, issues, rankingNews, alerts, sub, topComments, aiSummary };
  },
  ["dashboard-data"],
  { revalidate: 300, tags: ["dashboard"] }
);

// FastAPI 백엔드(Python/Vercel Fluid Compute)로 보내는 AI·집계 전용 클라이언트.
// 단순 DB 조회는 Server Component 에서 src/lib/queries.ts 로 직접 호출한다.

const BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export type AISummaryResponse = {
  ai_summary_id: number;
  summary_type: "daily" | "weekly" | "issue" | "competitor";
  summary_date: string;
  title: string;
  content: string;
  bullets: string[];
  model_version: string;
  quality_score: number | null;
};

export const api = {
  health: () => get<{ status: string }>("/api/health"),
  generateDailyReport: () =>
    post<AISummaryResponse>("/api/report/daily"),
  generateIssueSummary: (clusterId: number) =>
    post<AISummaryResponse>(`/api/report/issue/${clusterId}`),
};

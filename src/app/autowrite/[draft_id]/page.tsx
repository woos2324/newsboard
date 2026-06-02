import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getDraft(draftId: number, userId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("article_draft")
    .select("id, user_id, keyword, title, content, used_facts, status, created_at")
    .eq("id", draftId)
    .eq("user_id", userId)
    .single();
  return data;
}

interface PageProps {
  params: Promise<{ draft_id: string }>;
}

export default async function DraftDetailPage({ params }: PageProps) {
  const { draft_id } = await params;
  const draftId = parseInt(draft_id, 10);
  if (isNaN(draftId)) notFound();

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "reporter") redirect("/trending");

  const draft = await getDraft(draftId, profile.user_id);
  if (!draft) notFound();

  const facts = (draft.used_facts ?? []) as {
    source_url: string;
    source_name: string;
    facts: {
      summary?: string;
      who?: string[];
      what?: string;
      when?: string;
      where?: string;
      figures?: { label: string; value: string; source: string }[];
      quotes?: { speaker: string; text: string; source: string }[];
      background?: string;
    };
  }[];

  const createdAt = new Date(draft.created_at ?? "").toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="flex h-full flex-col">
      {/* 상단 네비 */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Link
          href="/trending"
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          트렌드로 돌아가기
        </Link>
        <span className="text-muted">/</span>
        <span className="text-sm text-foreground">{draft.keyword}</span>
      </div>

      {/* 경고 배지 */}
      <div className="flex items-center gap-2 border-b border-warning/30 bg-amber-50/60 px-6 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs font-semibold text-amber-800">
          AI 생성 초안 · 사실관계 검증 필수 · 데스크 검수 후 발행하세요
        </p>
      </div>

      {/* 본문 영역 */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 좌측: 초안 본문 */}
        <div className="flex flex-1 flex-col overflow-y-auto px-8 py-6">
          <div className="mb-1 text-xs text-muted">{createdAt} · {draft.keyword}</div>
          <h1 className="mb-6 text-2xl font-bold leading-snug tracking-tight">
            {draft.title || "(제목 없음)"}
          </h1>
          <div className="whitespace-pre-wrap text-base leading-loose text-foreground/90">
            {draft.content}
          </div>
        </div>

        {/* 우측: 팩트 패널 */}
        <div className="w-80 shrink-0 overflow-y-auto border-l border-border bg-background px-5 py-6">
          <h2 className="mb-4 text-sm font-bold text-foreground">근거 팩트</h2>

          {facts.length === 0 ? (
            <p className="text-xs text-muted">팩트 정보가 없습니다.</p>
          ) : (
            <div className="space-y-5">
              {facts.map((f, i) => (
                <div key={i} className="rounded-lg border border-border bg-white p-4">
                  <p className="mb-3 text-[11px] font-semibold text-primary-500">
                    출처: {f.source_name || "알 수 없음"}
                  </p>

                  {f.facts?.summary && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold uppercase text-muted">요약</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{f.facts.summary}</p>
                    </div>
                  )}

                  {f.facts?.figures && f.facts.figures.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold uppercase text-muted">수치</p>
                      <ul className="mt-0.5 space-y-1">
                        {f.facts.figures.map((fig, j) => (
                          <li key={j} className="text-xs text-foreground/80">
                            <span className="font-medium">{fig.label}</span> {fig.value}
                            {fig.source && <span className="text-muted"> ({fig.source})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {f.facts?.quotes && f.facts.quotes.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold uppercase text-muted">인용</p>
                      <ul className="mt-0.5 space-y-1.5">
                        {f.facts.quotes.map((q, j) => (
                          <li key={j} className="rounded border-l-2 border-primary-500/30 pl-2 text-xs text-foreground/80">
                            <span className="font-medium">{q.speaker}</span> — {q.text}
                            {q.source && <span className="text-muted"> ({q.source})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {f.facts?.background && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted">배경</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{f.facts.background}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

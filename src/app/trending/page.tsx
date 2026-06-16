import { PageShell } from "@/components/PageShell";
import { getTrendingWithCoverage } from "@/lib/queries";
import { TrendingClient } from "@/components/trending/TrendingClient";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ keyword?: string }> };

export default async function TrendingPage({ searchParams }: Props) {
  const { keyword: initialKeyword } = await searchParams;
  const [items, profile] = await Promise.all([
    getTrendingWithCoverage(),
    getCurrentProfile(),
  ]);

  const fetchedAt = items.length > 0
    ? items.reduce((latest, i) =>
        i.fetched_at > latest ? i.fetched_at : latest, items[0].fetched_at)
    : new Date().toISOString();

  // 초안 작성 가능 역할: 기자 + 최고관리자
  const canWrite = profile?.role === "reporter" || profile?.role === "superadmin";
  const userId = profile?.user_id ?? "";
  // 이메일 local part = reporter_id (예: jh224@segye.com → jh224).
  // 기자만 문체 프로파일을 사용하고, 최고관리자는 프로파일이 없으므로
  // 빈 값으로 넘겨 '필력 없는 조건'(팩트 기반)으로 작성한다.
  const reporterId =
    profile?.role === "reporter" ? profile?.email?.split("@")[0] ?? "" : "";

  return (
    <PageShell title="" description="">
      {items.length === 0 ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-bold tracking-tight">실시간 트렌드</h1>
          <p className="caption">트렌드 데이터가 없습니다. 잠시 후 다시 확인해 주세요.</p>
        </div>
      ) : (
        <TrendingClient
          items={items}
          fetchedAt={fetchedAt}
          canWrite={canWrite}
          userId={userId}
          reporterId={reporterId}
          initialKeyword={initialKeyword}
        />
      )}
    </PageShell>
  );
}

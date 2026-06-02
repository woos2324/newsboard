import { PageShell } from "@/components/PageShell";
import { getTrendingWithCoverage } from "@/lib/queries";
import { TrendingClient } from "@/components/trending/TrendingClient";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TrendingPage() {
  const [items, profile] = await Promise.all([
    getTrendingWithCoverage(),
    getCurrentProfile(),
  ]);

  const fetchedAt = items.length > 0
    ? items.reduce((latest, i) =>
        i.fetched_at > latest ? i.fetched_at : latest, items[0].fetched_at)
    : new Date().toISOString();

  const isReporter = profile?.role === "reporter";
  const userId = profile?.user_id ?? "";
  // 이메일 local part = reporter_id (예: jh224@segye.com → jh224)
  const reporterId = profile?.email?.split("@")[0] ?? "";

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
          isReporter={isReporter}
          userId={userId}
          reporterId={reporterId}
        />
      )}
    </PageShell>
  );
}

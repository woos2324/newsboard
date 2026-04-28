import { PageShell } from "@/components/PageShell";
import { SubscriberComparisonExplorer } from "@/components/analytics/SubscriberComparisonExplorer";
import {
  getCompetitorSubscribers,
  getOurSubscriberSeries,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SubscribersPage() {
  const [ourSubscribers, competitors] = await Promise.all([
    getOurSubscriberSeries(7),
    getCompetitorSubscribers(),
  ]);

  return (
    <PageShell
      title="구독자 분석"
      description="자사와 경쟁사 구독자 흐름을 함께 확인합니다."
    >
      <SubscriberComparisonExplorer
        competitors={competitors}
        ownTotal={ourSubscribers.total.toLocaleString()}
        ownDeltaPct={ourSubscribers.deltaPct}
      />
    </PageShell>
  );
}

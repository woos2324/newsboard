import { PageShell } from "@/components/PageShell";
import { getTrafficPageData, getLatestTrafficDate, getDailyCvHistory } from "@/lib/queries";
import { TrafficContent } from "./TrafficContent";

export const revalidate = 86400; // 하루 1회 수집이므로 24시간 캐시

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

type Props = { searchParams: Promise<{ date?: string }> };

export default async function TrafficPage({ searchParams }: Props) {
  const { date: rawDate } = await searchParams;

  // 날짜 미지정 시 오늘 → 데이터 없으면 마지막 수집일로 fallback
  let date = rawDate ?? todayKST();
  if (!rawDate) {
    const latest = await getLatestTrafficDate();
    if (latest && latest < date) date = latest;
  }

  // 서버는 항상 device="all" 로 초기 데이터 조회
  const [dataResult, cvResult] = await Promise.allSettled([
    getTrafficPageData(date, 100, 100, "all"),
    getDailyCvHistory(30),
  ]);

  if (dataResult.status === "rejected") {
    return (
      <PageShell title="트래픽 분석" description="네이버 파트너센터 기준 · 매일 KST 01:00 갱신 (일간 매일 · 주간 월요일 · 월간 1일)">
        <div className="card text-sm text-muted py-8 text-center">
          {date} 데이터를 불러오지 못했습니다.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="트래픽 분석" description="네이버 파트너센터 기준 · 매일 KST 01:00 갱신 (일간 매일 · 주간 월요일 · 월간 1일)">
      <TrafficContent
        date={date}
        initialData={dataResult.value}
        dailyCvHistory={cvResult.status === "fulfilled" ? cvResult.value : []}
      />
    </PageShell>
  );
}

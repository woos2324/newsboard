import { PageShell } from "@/components/PageShell";
import { getCompareMatrix, getSectionRankings } from "@/lib/queries";
import { CompareTabView } from "./CompareTabView";
import { MediaSelector } from "./MediaSelector";

export const dynamic = "force-dynamic";

const DEFAULT_MEDIA = ["chosun", "joongang", "donga", "mk"];

type Props = {
  searchParams: Promise<{ media?: string }>;
};

export default async function ComparePage({ searchParams }: Props) {
  const { media: mediaParam } = await searchParams;

  const rawIds = mediaParam
    ? mediaParam.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MEDIA;

  // 세계일보 항상 첫 번째
  const mediaIds = ["segye", ...rawIds.filter((s) => s !== "segye")];

  const [popularData, sectionRankings] = await Promise.all([
    getCompareMatrix(mediaIds, 5),
    getSectionRankings(mediaIds),
  ]);

  return (
    <PageShell
      title="경쟁사 비교"
      description="매체별 랭킹 뉴스를 나란히 비교해 포지셔닝을 확인하세요."
    >
      <MediaSelector selected={mediaIds} />
      <CompareTabView popularData={popularData} sectionRankings={sectionRankings} />
    </PageShell>
  );
}

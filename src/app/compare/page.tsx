import { PageShell } from "@/components/PageShell";
import {
  getActiveCompareMedia,
  getCompareMatrix,
  getSectionRankings,
} from "@/lib/queries";
import { CompareTabView } from "./CompareTabView";
import { MediaSelector } from "./MediaSelector";

export const revalidate = 300

// URL 파라미터 없이 진입 시 기본 선택 매체 (세계일보 + 주요 경쟁사)
const DEFAULT_MEDIA = [
  "chosun",
  "joongang",
  "donga",
  "mk",
  "hankyung",
  "hani",
  "jtbc",
  "kbs",
  "ytn",
];

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

  const [popularData, sectionRankings, mediaOptions] = await Promise.all([
    getCompareMatrix(mediaIds, 5),
    getSectionRankings(mediaIds),
    getActiveCompareMedia(),
  ]);

  return (
    <PageShell
      title="경쟁사 비교"
      description="매체별 랭킹 뉴스를 나란히 비교해 포지셔닝을 확인하세요."
    >
      <MediaSelector
        selected={mediaIds}
        options={mediaOptions}
        explicit={Boolean(mediaParam)}
      />
      <CompareTabView popularData={popularData} sectionRankings={sectionRankings} />
    </PageShell>
  );
}

import { PageShell } from "@/components/PageShell";
import { getCompareMatrix } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const { media, rows } = await getCompareMatrix(
    ["조선일보", "중앙일보", "한겨레", "매일경제"],
    5
  );

  return (
    <PageShell
      title="경쟁사 비교"
      description="매체별 랭킹 뉴스를 나란히 비교해 포지셔닝을 확인하세요."
    >
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 pr-4 font-medium">순위</th>
              {media.map((m) => (
                <th key={m} className="py-2 pr-4 font-medium">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rank} className="border-b border-border last:border-0">
                <td className="py-3 pr-4 align-top text-xs font-semibold text-primary-500">
                  #{row.rank}
                </td>
                {media.map((m) => (
                  <td key={m} className="py-3 pr-4 align-top leading-snug">
                    {row.cells[m] ?? (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

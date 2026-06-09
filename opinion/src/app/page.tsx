import { getTodayEditorials, getPastEditorials, getLatestEditionDate } from '@/lib/queries'
import { getComparisonsByDate } from '@/lib/comparison-queries'
import TodayTab from '@/components/TodayTab'
import DateNav from '@/components/DateNav'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; open?: string }> }) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { date: dateParam, open: openParam } = await searchParams
  const date = dateParam && dateParam < today ? dateParam : today
  const isToday = date >= today

  const editorials = await (isToday ? getTodayEditorials : getPastEditorials)(date).catch((e) => {
    console.error('[editorial] getTodayEditorials error:', e)
    return []
  })

  const fallbackDate = isToday && editorials.length === 0
    ? await getLatestEditionDate().catch(() => null)
    : null

  // 이미 비교 분석이 생성된 issue 목록 (그룹 헤더에 '생성됨' 표시용)
  const comparedIssues = await getComparisonsByDate(date)
    .then((rows) => rows.map((r) => r.issue))
    .catch(() => [])

  const initialOpenId = openParam ? Number(openParam) : null

  return (
    <div className="page-wrapper">
      <DateNav date={date} today={today} />
      {fallbackDate && fallbackDate !== date && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          오늘({date}) 수집된 사설이 없습니다. 가장 최근 수집일은{' '}
          <a href={`/?date=${fallbackDate}`} className="underline font-medium">
            {fallbackDate}
          </a>{' '}
          입니다.
        </div>
      )}
      <TodayTab
        editorials={editorials}
        date={date}
        initialOpenId={Number.isFinite(initialOpenId) ? initialOpenId : null}
        comparedIssues={comparedIssues}
      />
    </div>
  )
}

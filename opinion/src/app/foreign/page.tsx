import {
  getTodayForeignEditorials,
  getPastForeignEditorials,
  getLatestForeignEditionDate,
} from '@/lib/foreign-queries'
import ForeignEditorialTab from '@/components/ForeignEditorialTab'
import DateNav from '@/components/DateNav'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; open?: string }>
}) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { date: dateParam, open: openParam } = await searchParams
  const date = dateParam && dateParam < today ? dateParam : today
  const isToday = date >= today

  const editorials = await (isToday ? getTodayForeignEditorials : getPastForeignEditorials)(date).catch((e) => {
    console.error('[foreign-editorial] fetch error:', e)
    return []
  })

  // 오늘 데이터가 없을 때 가장 최신일 안내
  const fallbackDate = isToday && editorials.length === 0
    ? await getLatestForeignEditionDate().catch(() => null)
    : null

  const initialOpenId = openParam ? Number(openParam) : null

  return (
    <div className="page-wrapper">
      <DateNav date={date} today={today} basePath="/foreign" />
      {fallbackDate && fallbackDate !== date && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          오늘({date}) 수집된 해외 사설이 없습니다. 가장 최근 수집일은{' '}
          <a href={`/foreign?date=${fallbackDate}`} className="underline font-medium">
            {fallbackDate}
          </a>{' '}
          입니다.
        </div>
      )}
      <ForeignEditorialTab
        editorials={editorials}
        initialOpenId={Number.isFinite(initialOpenId) ? initialOpenId : null}
      />
    </div>
  )
}

import { getTodayEditorials, getPastEditorials } from '@/lib/queries'
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

  const initialOpenId = openParam ? Number(openParam) : null

  return (
    <div className="page-wrapper">
      <DateNav date={date} today={today} />
      <TodayTab
        editorials={editorials}
        date={date}
        initialOpenId={Number.isFinite(initialOpenId) ? initialOpenId : null}
      />
    </div>
  )
}

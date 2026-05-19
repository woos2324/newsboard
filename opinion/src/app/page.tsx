import { getTodayEditorials, getPastEditorials } from '@/lib/queries'
import TodayTab from '@/components/TodayTab'
import DateNav from '@/components/DateNav'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { date: dateParam } = await searchParams
  const date = dateParam && dateParam < today ? dateParam : today
  const isToday = date >= today

  const editorials = await (isToday ? getTodayEditorials : getPastEditorials)(date).catch((e) => {
    console.error('[editorial] getTodayEditorials error:', e)
    return []
  })

  return (
    <div className="page-wrapper">
      <DateNav date={date} today={today} />
      <TodayTab editorials={editorials} date={date} />
    </div>
  )
}

import { getSegyeEditorials } from '@/lib/queries'
import DateNav from '@/components/DateNav'
import TrendTab from '@/components/TrendTab'

export const dynamic = 'force-dynamic'

export default async function TrendPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { date: dateParam } = await searchParams
  const date = dateParam && dateParam < today ? dateParam : today

  const segyeEditorials = await getSegyeEditorials(90).catch((e) => {
    console.error('[editorial] getSegyeEditorials error:', e)
    return []
  })

  return (
    <div className="page-wrapper">
      <DateNav date={date} today={today} basePath="/trend" />
      <TrendTab editorials={segyeEditorials} selectedDate={date} />
    </div>
  )
}

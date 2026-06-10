import { getSegyeEditorials } from '@/lib/queries'
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
      <TrendTab editorials={segyeEditorials} selectedDate={date} today={today} />
    </div>
  )
}

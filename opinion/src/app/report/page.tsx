import { getReportByDate } from '@/lib/report-queries'
import ReportClient from './ReportClient'

export const dynamic = 'force-dynamic'

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { date: dateParam } = await searchParams
  const date = dateParam && dateParam < today ? dateParam : today

  const report = await getReportByDate(date).catch((e) => {
    console.error('[report] getReportByDate error:', e)
    return null
  })

  return <ReportClient initialReport={report} date={date} />
}

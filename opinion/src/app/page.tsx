import { getTodayEditorials } from '@/lib/queries'
import TodayTab from '@/components/TodayTab'

export const revalidate = 300

export default async function Page() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

  const todayEditorials = await getTodayEditorials(today).catch((e) => {
    console.error('[editorial] getTodayEditorials error:', e)
    return []
  })

  return (
    <div className="page-wrapper">
      <TodayTab editorials={todayEditorials} date={today} />
    </div>
  )
}

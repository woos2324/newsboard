import { getTodayEditorials } from '@/lib/queries'
import TodayTab from '@/components/TodayTab'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

  const todayEditorials = await getTodayEditorials(today).catch((e) => {
    console.error('[editorial] getTodayEditorials error:', e)
    return []
  })

  return (
    <div className="px-6 pt-6 pb-16 w-full">
      <TodayTab editorials={todayEditorials} date={today} />
    </div>
  )
}

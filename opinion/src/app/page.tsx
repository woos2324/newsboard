import { getTodayEditorials, getMediaStanceAvg, getSegyeEditorials } from '@/lib/queries'
import EditorialClient from '@/components/EditorialClient'

export const revalidate = 300

export default async function Page() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

  const [todayEditorials, mediaStances, segyeEditorials] = await Promise.all([
    getTodayEditorials(today).catch(() => []),
    getMediaStanceAvg(30).catch(() => []),
    getSegyeEditorials(90).catch(() => []),
  ])

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 justify-between flex-shrink-0 sticky top-0 z-10">
        <h1 className="font-bold text-blue-800 text-lg">📝 사설 분석</h1>
        <span className="text-sm text-gray-500">{now}</span>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-gray-900">사설 분석</h2>
          <p className="text-sm text-gray-500 mt-1">주요 언론사 사설 수집 · AI 성향 분석 · 비교</p>
        </div>

        <EditorialClient
          todayEditorials={todayEditorials}
          mediaStances={mediaStances}
          segyeEditorials={segyeEditorials}
          today={today}
        />
      </main>
    </div>
  )
}

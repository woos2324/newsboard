import { getComparisonsByDate } from '@/lib/comparison-queries'
import CompareClient from './CompareClient'

export const dynamic = 'force-dynamic'
// 그룹 본문 전량 + gpt-4o 생성 → 페이지의 모든 Server Action 타임아웃 상향
export const maxDuration = 60

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; issue?: string; regen?: string }>
}) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const { date: dateParam, issue: issueParam, regen: regenParam } = await searchParams
  const date = dateParam && dateParam < today ? dateParam : today

  const comparisons = await getComparisonsByDate(date).catch((e) => {
    console.error('[compare] getComparisonsByDate error:', e)
    return []
  })

  return (
    <div className="page-wrapper">
      <CompareClient
        key={date}
        comparisons={comparisons}
        date={date}
        today={today}
        initialIssue={issueParam ?? null}
        initialRegen={regenParam === '1'}
      />
    </div>
  )
}

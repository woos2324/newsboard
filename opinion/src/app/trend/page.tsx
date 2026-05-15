import { getSegyeEditorials } from '@/lib/queries'
import TrendTab from '@/components/TrendTab'

export const revalidate = 300

export default async function TrendPage() {
  const segyeEditorials = await getSegyeEditorials(90).catch((e) => {
    console.error('[editorial] getSegyeEditorials error:', e)
    return []
  })

  return (
    <div className="page-wrapper">
      <TrendTab editorials={segyeEditorials} />
    </div>
  )
}

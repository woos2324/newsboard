import { getSegyeEditorials } from '@/lib/queries'
import TrendTab from '@/components/TrendTab'

export const dynamic = 'force-dynamic'

export default async function TrendPage() {
  const segyeEditorials = await getSegyeEditorials(90).catch((e) => {
    console.error('[editorial] getSegyeEditorials error:', e)
    return []
  })

  return (
    <div className="px-6 pt-6 pb-16 w-full">
      <TrendTab editorials={segyeEditorials} />
    </div>
  )
}

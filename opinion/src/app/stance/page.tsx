import { getMediaStanceAvg } from '@/lib/queries'
import StanceTab from '@/components/StanceTab'

export const dynamic = 'force-dynamic'

export default async function StancePage() {
  const mediaStances = await getMediaStanceAvg(30).catch((e) => {
    console.error('[editorial] getMediaStanceAvg error:', e)
    return []
  })

  return (
    <div className="px-6 pt-6 pb-16 w-full">
      <StanceTab mediaStances={mediaStances} />
    </div>
  )
}

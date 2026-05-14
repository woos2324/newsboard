import { getMediaStanceAvg } from '@/lib/queries'
import StanceTab from '@/components/StanceTab'

export const dynamic = 'force-dynamic'

export default async function StancePage() {
  const mediaStances = await getMediaStanceAvg(30).catch((e) => {
    console.error('[editorial] getMediaStanceAvg error:', e)
    return []
  })

  return (
    <div className="p-6 w-full">
      <StanceTab mediaStances={mediaStances} />
    </div>
  )
}

import { getMediaStanceAvg } from '@/lib/queries'
import StanceTab from '@/components/StanceTab'

export const revalidate = 300

export default async function StancePage() {
  const mediaStances = await getMediaStanceAvg(30).catch((e) => {
    console.error('[editorial] getMediaStanceAvg error:', e)
    return []
  })

  return (
    <div className="page-wrapper">
      <StanceTab mediaStances={mediaStances} />
    </div>
  )
}

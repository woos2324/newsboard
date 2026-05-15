import { getLabelingQueue } from '@/lib/queries'
import LabelClient from './LabelClient'

export const revalidate = 300

export default async function LabelPage() {
  const editorials = await getLabelingQueue(30)
  return (
    <div className="page-wrapper">
      <LabelClient editorials={editorials} />
    </div>
  )
}

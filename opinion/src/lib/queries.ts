import { supabase } from './supabase'

export interface Editorial {
  editorial_id: number
  media_company_id: number | null
  title: string
  summary: string | null
  body?: string | null
  url: string
  published_at: string | null
  edition_date: string | null
  topic: string | null
  issue: string | null
  stance_score: number | null
  stance_label: string | null
  ai_analysis?: Record<string, unknown> | null
  fetched_at: string
  media_company?: {
    media_company_id: number
    name: string
    normalized_name: string
    is_our_company: boolean
  }
}

export interface MediaStance {
  media_company_id: number
  name: string
  normalized_name: string
  is_our_company: boolean
  avg_stance: number
  editorial_count: number
  by_topic: Record<string, number>  // topic → avg_stance
}

const EDITORIAL_LIST_COLS = `
  editorial_id, media_company_id, title, summary, url,
  published_at, topic, issue, stance_score, stance_label, fetched_at,
  media_company (media_company_id, name, normalized_name, is_our_company)
`

export async function getEditorialById(id: number): Promise<Editorial | null> {
  const { data, error } = await supabase
    .from('editorial')
    .select('*, media_company (media_company_id, name, normalized_name, is_our_company)')
    .eq('editorial_id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Editorial | null
}

export async function getTodayEditorials(date?: string): Promise<Editorial[]> {
  const targetDate = date ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

  const { data, error } = await supabase
    .from('editorial')
    .select(EDITORIAL_LIST_COLS)
    .eq('edition_date', targetDate)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Editorial[]
}

export async function getRecentEditorials(days = 30): Promise<Editorial[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select(EDITORIAL_LIST_COLS)
    .gte('published_at', since.toISOString())
    .not('stance_score', 'is', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Editorial[]
}

export async function getMediaStanceAvg(days = 30): Promise<MediaStance[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select(`
      media_company_id,
      stance_score,
      topic,
      media_company (media_company_id, name, normalized_name, is_our_company)
    `)
    .gte('published_at', since.toISOString())
    .not('stance_score', 'is', null)

  if (error) throw error

  type Acc = { sum: number; count: number; mc: Editorial['media_company']; topics: Record<string, { sum: number; count: number }> }
  const map = new Map<number, Acc>()

  for (const row of data ?? []) {
    const id = row.media_company_id
    if (!id) continue
    const topic = (row.topic as string) ?? '기타'
    const score = row.stance_score as number
    const existing = map.get(id)
    if (existing) {
      existing.sum += score
      existing.count += 1
      const t = existing.topics[topic] ?? { sum: 0, count: 0 }
      t.sum += score; t.count += 1
      existing.topics[topic] = t
    } else {
      map.set(id, {
        sum: score, count: 1,
        mc: (row as unknown as { media_company: Editorial['media_company'] }).media_company,
        topics: { [topic]: { sum: score, count: 1 } },
      })
    }
  }

  return Array.from(map.entries())
    .map(([id, { sum, count, mc, topics }]) => ({
      media_company_id: id,
      name: mc?.name ?? '',
      normalized_name: mc?.normalized_name ?? '',
      is_our_company: mc?.is_our_company ?? false,
      avg_stance: sum / count,
      editorial_count: count,
      by_topic: Object.fromEntries(
        Object.entries(topics).map(([t, { sum: s, count: c }]) => [t, s / c])
      ),
    }))
    .sort((a, b) => a.avg_stance - b.avg_stance)
}

export interface EditorialLabel {
  label_id: number
  editorial_id: number
  labeled_by: string
  stance_label: string
  note: string | null
  labeled_at: string
}

export async function getLabelingQueue(days = 30): Promise<Editorial[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select(EDITORIAL_LIST_COLS)
    .gte('published_at', since.toISOString())
    .not('stance_label', 'is', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Editorial[]
}

export async function getEditorialLabels(editorialId: number): Promise<EditorialLabel[]> {
  const { data, error } = await supabase
    .from('editorial_label')
    .select('*')
    .eq('editorial_id', editorialId)
    .order('labeled_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as EditorialLabel[]
}

export async function submitLabel(
  editorialId: number,
  labeledBy: string,
  stanceLabel: string,
  note?: string,
): Promise<void> {
  const { error } = await supabase.from('editorial_label').insert({
    editorial_id: editorialId,
    labeled_by: labeledBy.trim(),
    stance_label: stanceLabel,
    note: note?.trim() || null,
  })
  if (error) throw error
}

export async function getSegyeEditorials(days = 90): Promise<Editorial[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select(`
      editorial_id, media_company_id, title, summary, url,
      published_at, topic, issue, stance_score, stance_label, fetched_at,
      media_company!inner (media_company_id, name, normalized_name, is_our_company)
    `)
    .eq('media_company.is_our_company', true)
    .gte('published_at', since.toISOString())
    .not('stance_score', 'is', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as Editorial[]
}

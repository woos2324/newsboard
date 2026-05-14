import { supabase } from './supabase'

export interface Editorial {
  editorial_id: number
  media_company_id: number | null
  title: string
  summary: string | null
  body: string | null
  url: string
  published_at: string | null
  topic: string | null
  stance_score: number | null
  stance_label: string | null
  ai_analysis: Record<string, unknown> | null
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
}

export async function getTodayEditorials(date?: string): Promise<Editorial[]> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)
  const start = `${targetDate}T00:00:00+09:00`
  const end = `${targetDate}T23:59:59+09:00`

  const { data, error } = await supabase
    .from('editorial')
    .select(`
      *,
      media_company (media_company_id, name, normalized_name, is_our_company)
    `)
    .gte('published_at', start)
    .lte('published_at', end)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Editorial[]
}

export async function getRecentEditorials(days = 30): Promise<Editorial[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select(`
      *,
      media_company (media_company_id, name, normalized_name, is_our_company)
    `)
    .gte('published_at', since.toISOString())
    .not('stance_score', 'is', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Editorial[]
}

export async function getMediaStanceAvg(days = 30): Promise<MediaStance[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select(`
      media_company_id,
      stance_score,
      media_company (media_company_id, name, normalized_name, is_our_company)
    `)
    .gte('published_at', since.toISOString())
    .not('stance_score', 'is', null)

  if (error) throw error

  const map = new Map<number, { sum: number; count: number; mc: Editorial['media_company'] }>()
  for (const row of data ?? []) {
    const id = row.media_company_id
    if (!id) continue
    const existing = map.get(id)
    if (existing) {
      existing.sum += row.stance_score as number
      existing.count += 1
    } else {
      map.set(id, { sum: row.stance_score as number, count: 1, mc: (row as unknown as { media_company: Editorial['media_company'] }).media_company })
    }
  }

  return Array.from(map.entries())
    .map(([id, { sum, count, mc }]) => ({
      media_company_id: id,
      name: mc?.name ?? '',
      normalized_name: mc?.normalized_name ?? '',
      is_our_company: mc?.is_our_company ?? false,
      avg_stance: sum / count,
      editorial_count: count,
    }))
    .sort((a, b) => a.avg_stance - b.avg_stance)
}

export async function getSegyeEditorials(days = 90): Promise<Editorial[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('editorial')
    .select('*, media_company!inner(media_company_id, name, normalized_name, is_our_company)')
    .eq('media_company.is_our_company', true)
    .gte('published_at', since.toISOString())
    .not('stance_score', 'is', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Editorial[]
}

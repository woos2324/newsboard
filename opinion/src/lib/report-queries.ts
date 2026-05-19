import { supabase } from './supabase'
import { supabaseAdmin } from './supabase-admin'

export type ReportSource = 'segye' | 'other'

export interface ReportArticle {
  article_ref_id: number
  section_id: number
  sort_order: number
  source: ReportSource
  article_id: number | null
  article_url: string
  article_title: string
  media_name: string
  published_at: string | null
}

export interface ReportSection {
  section_id: number
  report_id: number
  sort_order: number
  title: string
  comment: string
  articles: ReportArticle[]
}

export interface DailyReport {
  report_id: number
  report_date: string
  created_at: string
  updated_at: string
  sections: ReportSection[]
}

export interface SearchArticleResult {
  article_id: number
  title: string
  url: string
  published_at: string | null
  media_name: string
  is_our_company: boolean
}

export async function getReportByDate(date: string): Promise<DailyReport | null> {
  const { data, error } = await supabaseAdmin
    .from('daily_report')
    .select(`
      *,
      sections: daily_report_section (
        *,
        articles: daily_report_article (*)
      )
    `)
    .eq('report_date', date)
    .order('sort_order', { referencedTable: 'daily_report_section', ascending: true })
    .order('sort_order', { referencedTable: 'daily_report_article', ascending: true })
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return data as unknown as DailyReport
}

export async function searchArticles(
  keyword: string,
  source: ReportSource,
  days = 7,
  limit = 30,
): Promise<SearchArticleResult[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  let query = supabase
    .from('article')
    .select(`
      article_id, title, url, published_at,
      media_company!inner (name, is_our_company)
    `)
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: false })
    .limit(limit)

  if (keyword.trim()) {
    query = query.ilike('title', `%${keyword.trim()}%`)
  }

  if (source === 'segye') {
    query = query.eq('media_company.is_our_company', true)
  } else {
    query = query.eq('media_company.is_our_company', false)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((row) => {
    const mc = (row as unknown as { media_company: { name: string; is_our_company: boolean } }).media_company
    return {
      article_id: row.article_id as number,
      title: row.title as string,
      url: row.url as string,
      published_at: row.published_at as string | null,
      media_name: mc.name,
      is_our_company: mc.is_our_company,
    }
  })
}

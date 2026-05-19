'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function touchReport(reportId: number) {
  await supabaseAdmin
    .from('daily_report')
    .update({ updated_at: new Date().toISOString() })
    .eq('report_id', reportId)
}

export async function ensureReport(date: string): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from('daily_report')
    .select('report_id')
    .eq('report_date', date)
    .maybeSingle()

  if (existing) return existing.report_id

  const { data, error } = await supabaseAdmin
    .from('daily_report')
    .insert({ report_date: date })
    .select('report_id')
    .single()
  if (error) throw error

  revalidatePath('/report')
  return data.report_id
}

export async function addSection(reportId: number): Promise<number> {
  const { data: maxRow } = await supabaseAdmin
    .from('daily_report_section')
    .select('sort_order')
    .eq('report_id', reportId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxRow?.sort_order ?? 0) + 1

  const { data, error } = await supabaseAdmin
    .from('daily_report_section')
    .insert({ report_id: reportId, sort_order: nextOrder })
    .select('section_id')
    .single()
  if (error) throw error

  await touchReport(reportId)
  revalidatePath('/report')
  return data.section_id
}

export async function updateSection(
  sectionId: number,
  patch: { title?: string; comment?: string },
): Promise<void> {
  const { data: sec, error } = await supabaseAdmin
    .from('daily_report_section')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('section_id', sectionId)
    .select('report_id')
    .single()
  if (error) throw error
  if (sec) await touchReport(sec.report_id)
}

export async function deleteSection(sectionId: number): Promise<void> {
  const { data: sec } = await supabaseAdmin
    .from('daily_report_section')
    .select('report_id')
    .eq('section_id', sectionId)
    .maybeSingle()

  const { error } = await supabaseAdmin
    .from('daily_report_section')
    .delete()
    .eq('section_id', sectionId)
  if (error) throw error

  if (sec) await touchReport(sec.report_id)
  revalidatePath('/report')
}

export async function addArticle(
  sectionId: number,
  payload: {
    source: 'segye' | 'other'
    article_id: number | null
    article_url: string
    article_title: string
    media_name: string
    published_at: string | null
  },
): Promise<number> {
  const { data: maxRow } = await supabaseAdmin
    .from('daily_report_article')
    .select('sort_order')
    .eq('section_id', sectionId)
    .eq('source', payload.source)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxRow?.sort_order ?? 0) + 1

  const { data, error } = await supabaseAdmin
    .from('daily_report_article')
    .insert({
      section_id: sectionId,
      sort_order: nextOrder,
      ...payload,
    })
    .select('article_ref_id, section_id')
    .single()
  if (error) throw error

  const { data: sec } = await supabaseAdmin
    .from('daily_report_section')
    .select('report_id')
    .eq('section_id', sectionId)
    .maybeSingle()
  if (sec) await touchReport(sec.report_id)

  revalidatePath('/report')
  return data.article_ref_id
}

export async function deleteArticle(articleRefId: number): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from('daily_report_article')
    .select('section_id')
    .eq('article_ref_id', articleRefId)
    .maybeSingle()

  const { error } = await supabaseAdmin
    .from('daily_report_article')
    .delete()
    .eq('article_ref_id', articleRefId)
  if (error) throw error

  if (row) {
    const { data: sec } = await supabaseAdmin
      .from('daily_report_section')
      .select('report_id')
      .eq('section_id', row.section_id)
      .maybeSingle()
    if (sec) await touchReport(sec.report_id)
  }
  revalidatePath('/report')
}

export async function searchArticlesAction(
  keyword: string,
  source: 'segye' | 'other',
  days = 7,
) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  let query = supabaseAdmin
    .from('article')
    .select(`
      article_id, title, url, published_at,
      media_company!inner (name, is_our_company)
    `)
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: false })
    .limit(30)

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
    }
  })
}

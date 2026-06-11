'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertAuthed } from '@/lib/auth-server'

// fire-and-forget: 응답 안 기다림. 실패해도 무시 (updated_at 갱신은 비핵심)
function touchReportAsync(reportId: number) {
  supabaseAdmin
    .from('daily_report')
    .update({ updated_at: new Date().toISOString() })
    .eq('report_id', reportId)
    .then(() => {})
}

export async function ensureReport(date: string): Promise<number> {
  await assertAuthed()
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
  return data.report_id
}

export async function addSection(reportId: number, sortOrder: number): Promise<number> {
  await assertAuthed()
  const { data, error } = await supabaseAdmin
    .from('daily_report_section')
    .insert({ report_id: reportId, sort_order: sortOrder })
    .select('section_id')
    .single()
  if (error) throw error

  touchReportAsync(reportId)
  return data.section_id
}

export async function updateSection(
  sectionId: number,
  patch: { title?: string; comment?: string },
): Promise<void> {
  await assertAuthed()
  const { data: sec, error } = await supabaseAdmin
    .from('daily_report_section')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('section_id', sectionId)
    .select('report_id')
    .single()
  if (error) throw error
  if (sec) touchReportAsync(sec.report_id)
}

export async function deleteSection(sectionId: number): Promise<void> {
  await assertAuthed()
  const { error } = await supabaseAdmin
    .from('daily_report_section')
    .delete()
    .eq('section_id', sectionId)
  if (error) throw error
}

export async function addArticle(
  sectionId: number,
  sortOrder: number,
  payload: {
    source: 'segye' | 'other'
    article_id: number | null
    article_url: string
    article_title: string
    media_name: string
    published_at: string | null
  },
): Promise<number> {
  await assertAuthed()
  const { data, error } = await supabaseAdmin
    .from('daily_report_article')
    .insert({
      section_id: sectionId,
      sort_order: sortOrder,
      ...payload,
    })
    .select('article_ref_id, section_id')
    .single()
  if (error) throw error

  // section의 report_id 조회는 비동기로 (UI는 이미 응답 받음)
  supabaseAdmin
    .from('daily_report_section')
    .select('report_id')
    .eq('section_id', sectionId)
    .maybeSingle()
    .then(({ data: sec }) => {
      if (sec) touchReportAsync(sec.report_id)
    })

  return data.article_ref_id
}

export async function deleteArticle(articleRefId: number): Promise<void> {
  await assertAuthed()
  const { error } = await supabaseAdmin
    .from('daily_report_article')
    .delete()
    .eq('article_ref_id', articleRefId)
  if (error) throw error
  // updated_at 갱신은 생략 (삭제 후 section 조회 비효율)
}

// editorial 테이블 기반 검색 (사설 일일 동향 보고서용)
// daily_report_article.article_id는 article 테이블 FK라 editorial 결과는 article_id=null로 저장.
// 본문/제목/매체명/URL은 daily_report_article의 스냅샷 컬럼에 그대로 저장됨.
export async function searchArticlesAction(
  keyword: string,
  source: 'segye' | 'other',
  days = 7,
) {
  await assertAuthed()
  const since = new Date()
  since.setDate(since.getDate() - days)

  let query = supabaseAdmin
    .from('editorial')
    .select(`
      editorial_id, title, url, published_at,
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
      article_id: null,
      title: row.title as string,
      url: row.url as string,
      published_at: row.published_at as string | null,
      media_name: mc.name,
    }
  })
}

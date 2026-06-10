import { supabase } from './supabase'

// 5섹션 구조화 결과
export interface ComparisonResult {
  issue_summary: string
  segye_stance: string
  others: { media: string; stance: string }[]
  common: string
  differences: string
  implications: string[]
}

export interface EditorialComparison {
  comparison_id: number
  edition_date: string
  issue: string
  editorial_ids: number[]
  result: ComparisonResult
  model: string
  created_at: string
  updated_at: string
}

// 비교 생성 시 본문 수집용 (body 포함)
export interface CompareEditorial {
  editorial_id: number
  title: string
  body: string | null
  summary: string | null
  url: string
  is_our_company: boolean
  media_name: string
}

/** 그날 생성된 비교 보고서 전체 (카드 리스트용) */
export async function getComparisonsByDate(date: string): Promise<EditorialComparison[]> {
  const { data, error } = await supabase
    .from('editorial_comparison')
    .select('*')
    .eq('edition_date', date)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EditorialComparison[]
}

/** (date, issue) 단건 */
export async function getComparison(
  date: string,
  issue: string,
): Promise<EditorialComparison | null> {
  const { data, error } = await supabase
    .from('editorial_comparison')
    .select('*')
    .eq('edition_date', date)
    .eq('issue', issue)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as EditorialComparison | null
}

/**
 * 특정 (edition_date, issue) 그룹의 사설 본문 일괄 조회 — 생성 액션에서 사용.
 * issue 인자는 TodayTab 그룹 키(= issue_canonical ?? issue). canonical 우선 조회하고,
 * 병합 전/과거 데이터(issue_canonical NULL)는 issue 기준으로 fallback 조회.
 */
export async function getGroupEditorialsForCompare(
  date: string,
  issue: string,
): Promise<CompareEditorial[]> {
  const SELECT = `
      editorial_id, title, body, summary, url,
      media_company!inner (name, is_our_company)
    `
  let { data, error } = await supabase
    .from('editorial')
    .select(SELECT)
    .eq('edition_date', date)
    .eq('issue_canonical', issue)
    .order('published_at', { ascending: true })
  if (error) throw error

  // canonical 미배정(과거/병합 전) 그룹: issue 로 fallback
  if (!data || data.length === 0) {
    ;({ data, error } = await supabase
      .from('editorial')
      .select(SELECT)
      .eq('edition_date', date)
      .eq('issue', issue)
      .order('published_at', { ascending: true }))
    if (error) throw error
  }

  return (data ?? []).map((row) => {
    const mc = (row as unknown as {
      media_company: { name: string; is_our_company: boolean }
    }).media_company
    return {
      editorial_id: row.editorial_id as number,
      title: row.title as string,
      body: (row.body as string | null) ?? null,
      summary: (row.summary as string | null) ?? null,
      url: row.url as string,
      is_our_company: mc?.is_our_company ?? false,
      media_name: mc?.name ?? '알 수 없음',
    }
  })
}

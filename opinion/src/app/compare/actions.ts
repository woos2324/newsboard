'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { chatJson } from '@/lib/ai'
import {
  getGroupEditorialsForCompare,
  type ComparisonResult,
  type EditorialComparison,
} from '@/lib/comparison-queries'

const MODEL = 'gpt-4o'

const SYSTEM = `당신은 한국 신문 사설을 비교 분석하는 전문가입니다.
같은 사안에 대한 세계일보(자사)와 타사 사설들을 비교해, 논설위원 회의 보고용 자료를 작성합니다.
반드시 아래 JSON 객체 하나만 반환하세요 (마크다운/설명 텍스트 금지).`

const SCHEMA_GUIDE = `출력 JSON 스키마:
{
  "issue_summary": "이 사안의 핵심 쟁점을 2~3문장으로 정리",
  "segye_stance": "세계일보 사설의 논조와 핵심 주장 (세계일보 사설이 여러 건이면 종합)",
  "others": [ { "media": "매체명", "stance": "해당 매체 사설의 논조·핵심 주장 서술" } ],
  "common": "세계일보와 타사가 공통적으로 짚은 지점",
  "differences": "세계일보와 타사 간 시각·강조점의 차이",
  "implications": ["세계일보 관점의 시사점·논의 포인트 (회의 안건용 bullet)", "..."]
}

규칙:
- others 배열은 타사 매체별로 하나씩 (같은 매체 여러 건이면 종합).
- 진보/보수 같은 성향 라벨(뱃지)은 붙이지 말 것. 논조는 서술로.
- implications 는 3~5개, 각 항목은 한 문장.
- 제공된 사설 내용에 근거할 것. 없는 내용 창작 금지.
- 모든 텍스트는 한국어. JSON 외 텍스트 금지.`

function bodyOf(e: { body: string | null; summary: string | null; title: string }): string {
  return (e.body && e.body.trim()) || (e.summary && e.summary.trim()) || e.title
}

/**
 * (date, issue) 그룹의 세계일보 vs 타사 사설을 gpt-4o로 비교 → editorial_comparison upsert.
 * 성공 시 저장된 row 반환. 실패 시 throw(저장 안 함).
 */
export async function generateComparison(
  date: string,
  issue: string,
): Promise<EditorialComparison> {
  const group = await getGroupEditorialsForCompare(date, issue)
  const segye = group.filter((e) => e.is_our_company)
  const others = group.filter((e) => !e.is_our_company)

  if (segye.length === 0 || others.length === 0) {
    throw new Error('세계일보 사설과 타사 사설이 모두 있어야 비교할 수 있습니다.')
  }

  const segyeText = segye
    .map((e, i) => `[세계일보 ${segye.length > 1 ? i + 1 : ''}] ${e.title}\n${bodyOf(e)}`)
    .join('\n\n')
  const othersText = others
    .map((e) => `[${e.media_name}] ${e.title}\n${bodyOf(e)}`)
    .join('\n\n')

  const user = `[사안] ${issue}

${SCHEMA_GUIDE}

=== 세계일보(자사) 사설 ===
${segyeText}

=== 타사 사설 ===
${othersText}`

  const { data: result } = await chatJson<ComparisonResult>(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    MODEL,
    0.3,
  )

  const editorialIds = group.map((e) => e.editorial_id)
  const now = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('editorial_comparison')
    .upsert(
      {
        edition_date: date,
        issue,
        editorial_ids: editorialIds,
        result,
        model: MODEL,
        updated_at: now,
      },
      { onConflict: 'edition_date,issue' },
    )
    .select('*')
    .single()

  if (error) throw error
  return data as EditorialComparison
}

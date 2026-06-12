'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertAuthed } from '@/lib/auth-server'
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
  "issue_summary": "이 사안의 배경·전개·핵심 쟁점을 4~6문장으로 충실히 정리",
  "segye_stance": "세계일보 사설의 핵심 주장과 그 논거를 5~8문장으로 구체적으로 (어떤 근거·표현·해법을 제시했는지 포함, 사설이 여러 건이면 종합)",
  "others": [ { "media": "매체명", "stance": "해당 매체 사설의 핵심 주장·강조점·논거를 3~5문장으로 구체적으로 서술" } ],
  "common": "세계일보와 타사가 공통적으로 동의·지적한 지점을 3~5문장으로",
  "differences": "세계일보와 타사 간 시각·강조점·해법의 차이를 3~5문장으로 구체적으로 대비",
  "implications": ["세계일보 관점의 시사점·논의 포인트 (회의 안건용)", "..."]
}

규칙:
- 각 섹션은 위 분량 지침을 지켜 충분히 길고 구체적으로 작성할 것. 한 줄 요약·뭉뚱그린 서술 금지.
- others 배열은 타사 매체별로 하나씩 (같은 매체 여러 건이면 종합). 각 매체를 짧게 한 줄로 끝내지 말 것.
- 진보/보수 같은 성향 라벨(뱃지)은 붙이지 말 것. 논조는 서술로.
- implications 는 5~7개, 각 항목은 1~2문장.
- 제공된 사설 내용에 근거할 것. 없는 내용 창작 금지.
- 모든 텍스트는 한국어. JSON 외 텍스트 금지.`

// 세계일보 사설이 없는 그룹 — 타사 매체 간 비교 (세계일보 전용 섹션 없음)
const SYSTEM_MULTI = `당신은 한국 신문 사설을 비교 분석하는 전문가입니다.
같은 사안에 대한 여러 언론사 사설을 비교해, 논설위원 회의 보고용 자료를 작성합니다.
(이 사안에는 세계일보 사설이 없으므로, 자사 관점이 아닌 매체 간 비교로 작성하세요.)
반드시 아래 JSON 객체 하나만 반환하세요 (마크다운/설명 텍스트 금지).`

const SCHEMA_GUIDE_MULTI = `출력 JSON 스키마:
{
  "issue_summary": "이 사안의 배경·전개·핵심 쟁점을 4~6문장으로 충실히 정리",
  "segye_stance": "",
  "others": [ { "media": "매체명", "stance": "해당 매체 사설의 핵심 주장·강조점·논거를 3~5문장으로 구체적으로 서술" } ],
  "common": "여러 매체가 공통적으로 동의·지적한 지점을 3~5문장으로",
  "differences": "매체 간 시각·강조점·해법의 차이를 3~5문장으로 구체적으로 대비",
  "implications": ["이 사안에 대한 종합 시사점·논의 포인트 (회의 안건용)", "..."]
}

규칙:
- segye_stance 는 반드시 빈 문자열("")로 둘 것. 세계일보 사설이 없으므로 작성하지 말 것.
- others 배열에 제공된 모든 매체를 매체별로 하나씩 담을 것 (같은 매체 여러 건이면 종합). 각 매체를 짧게 한 줄로 끝내지 말 것.
- 각 섹션은 위 분량 지침을 지켜 충분히 길고 구체적으로 작성할 것. 한 줄 요약·뭉뚱그린 서술 금지.
- 진보/보수 같은 성향 라벨(뱃지)은 붙이지 말 것. 논조는 서술로.
- common/differences 는 매체 간(자사 기준 아님) 공통점·차이를 서술할 것.
- implications 는 5~7개, 각 항목은 1~2문장. 특정 매체 관점이 아닌 사안 자체에 대한 중립적 종합으로.
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
  await assertAuthed()
  const group = await getGroupEditorialsForCompare(date, issue)
  const segye = group.filter((e) => e.is_our_company)
  const others = group.filter((e) => !e.is_our_company)

  // 서로 다른 매체가 2곳 이상이어야 비교 의미가 있음
  const distinctMedia = new Set(group.map((e) => e.media_name)).size
  if (distinctMedia < 2) {
    throw new Error('비교하려면 서로 다른 매체의 사설이 2건 이상 있어야 합니다.')
  }

  const hasSegye = segye.length > 0

  const segyeText = segye
    .map((e, i) => `[세계일보 ${segye.length > 1 ? i + 1 : ''}] ${e.title}\n${bodyOf(e)}`)
    .join('\n\n')
  const othersText = others
    .map((e) => `[${e.media_name}] ${e.title}\n${bodyOf(e)}`)
    .join('\n\n')

  // 세계일보 있으면 자사 vs 타사 비교, 없으면 매체 간 비교
  const user = hasSegye
    ? `[사안] ${issue}

${SCHEMA_GUIDE}

=== 세계일보(자사) 사설 ===
${segyeText}

=== 타사 사설 ===
${othersText}`
    : `[사안] ${issue}

${SCHEMA_GUIDE_MULTI}

=== 각 매체 사설 ===
${othersText}`

  const { data: result } = await chatJson<ComparisonResult>(
    [
      { role: 'system', content: hasSegye ? SYSTEM : SYSTEM_MULTI },
      { role: 'user', content: user },
    ],
    MODEL,
    0.3,
  )

  // 세계일보 없는 그룹은 segye_stance 가 비어 있어야 함 (AI 가 채웠어도 무시)
  if (!hasSegye) result.segye_stance = ''

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

/** (date, issue) 비교 보고서 삭제 */
export async function deleteComparison(date: string, issue: string): Promise<void> {
  await assertAuthed()
  const { error } = await supabaseAdmin
    .from('editorial_comparison')
    .delete()
    .eq('edition_date', date)
    .eq('issue', issue)
  if (error) throw error
}

/** (date, issue) 비교 보고서의 result(5섹션) 직접 수정 */
export async function updateComparisonResult(
  date: string,
  issue: string,
  result: ComparisonResult,
): Promise<EditorialComparison> {
  await assertAuthed()
  const { data, error } = await supabaseAdmin
    .from('editorial_comparison')
    .update({ result, updated_at: new Date().toISOString() })
    .eq('edition_date', date)
    .eq('issue', issue)
    .select('*')
    .single()
  if (error) throw error
  return data as EditorialComparison
}

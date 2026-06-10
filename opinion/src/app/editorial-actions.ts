'use server'

import { updateTag } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * 사설 그룹(주제) 수동 보정.
 * issueManual 에 주제명을 넣으면 그 사설이 해당 그룹으로 이동(최우선).
 * null 이면 보정 해제 → AI 자동 판단(issue_canonical→issue)으로 복원.
 * merge_editorial_issues 는 issue_canonical 만 갱신하므로 이 값은 보존된다.
 */
export async function setEditorialIssue(
  editorialId: number,
  issueManual: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value = issueManual?.trim() || null

  const { error } = await supabaseAdmin
    .from('editorial')
    .update({ issue_manual: value })
    .eq('editorial_id', editorialId)

  if (error) return { ok: false, error: error.message }

  // Next 16: Server Action 내 read-your-own-writes 즉시 무효화 (1인자). revalidateTag는 profile 2인자 필수.
  updateTag('editorials')
  return { ok: true }
}

// OpenAI chat/completions 호출 헬퍼 (opinion 전용)
// 메인 newsboard api/lib/ai.py 의 TS 포팅(단순 버전).
// 환경변수: AI_BASE_URL(기본 OpenAI 직접) / OPENAI_API_KEY

const DEFAULT_BASE = 'https://api.openai.com/v1'

function baseUrl(): string {
  return (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || ''
  if (!key || key.startsWith('PLACEHOLDER')) {
    throw new Error('OPENAI_API_KEY 가 설정되지 않았습니다. (opinion Vercel/.env.local 확인)')
  }
  return key
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** JSON mode chat completion. 파싱된 객체와 사용 모델을 반환. */
export async function chatJson<T = Record<string, unknown>>(
  messages: ChatMessage[],
  model = 'gpt-4o',
  temperature = 0.3,
): Promise<{ data: T; model: string }> {
  const resp = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    }),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`AI 호출 실패 (${resp.status}): ${detail.slice(0, 300)}`)
  }

  const json = await resp.json()
  const raw: string = json.choices?.[0]?.message?.content ?? ''
  return { data: extractJson<T>(raw), model }
}

/** 모델이 코드펜스/잡텍스트로 감싸도 첫 JSON 객체를 추출. */
function extractJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error(`JSON 추출 실패: ${raw.slice(0, 200)}`)
    return JSON.parse(m[0]) as T
  }
}

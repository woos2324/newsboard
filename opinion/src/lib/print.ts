// 사설 본문 정리 + 인쇄 유틸 (화면·인쇄 공통)

/**
 * 수집 본문에 섞인 연속 빈 줄을 하나로 축약한다.
 * (네이버 수집 시 부제와 본문 사이 여백이 여러 개의 빈 줄로 들어오는 문제 대응)
 * - 부제 구분용 단일 개행은 보존, 2개 이상 연속 개행(사이 공백 포함)은 빈 줄 1개로.
 */
export function normalizeBody(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')            // 줄 끝 공백 제거
    .replace(/(?:[ \t]*\n){2,}/g, '\n\n')  // 연속 빈 줄 → 빈 줄 1개
    .trim()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

/**
 * 매체·날짜·제목·본문만 담은 인쇄 전용 문서를 새 창에 렌더해 인쇄한다.
 * 절대위치 기반 @media print 방식과 달리 정상 문서 흐름이라 긴 본문도 페이지 분할된다.
 */
export function printEditorial({
  media,
  date,
  title,
  body,
}: {
  media: string
  date: string
  title: string
  body: string | null | undefined
}) {
  const win = window.open('', '_blank', 'width=820,height=1000')
  if (!win) {
    alert('팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.')
    return
  }

  const bodyHtml = escapeHtml(normalizeBody(body)).replace(/\n/g, '<br>')

  win.document.write(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 20mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Malgun Gothic', '맑은 고딕', sans-serif; color: #111827; margin: 0; }
  .meta { font-size: 16px; color: #555; margin-bottom: 8px; }
  h1 { font-size: 22px; font-weight: 700; line-height: 1.4; margin: 0 0 16px; }
  .body { font-size: 17px; line-height: 1.85; }
</style>
</head>
<body>
  <div class="meta">${escapeHtml(media)} · ${escapeHtml(date)}</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="body">${bodyHtml}</div>
</body>
</html>`)
  win.document.close()
  win.focus()
  win.onafterprint = () => win.close()
  // document.write 직후 렌더 완료를 잠깐 기다린 뒤 인쇄
  setTimeout(() => win.print(), 300)
}

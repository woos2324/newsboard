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
 * 매체·날짜·제목·본문만 담은 인쇄 전용 문서를 숨은 iframe에 렌더해 인쇄한다.
 * - 새 창(window.open)을 쓰지 않으므로 팝업 차단에 걸리지 않는다.
 * - iframe 문서는 정상 문서 흐름이라 긴 본문도 페이지 분할된다.
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
  const bodyHtml = escapeHtml(normalizeBody(body)).replace(/\n/g, '<br>')

  const html = `<!doctype html>
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
</html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  const win = iframe.contentWindow!
  const cleanup = () => setTimeout(() => iframe.remove(), 100)
  win.onafterprint = cleanup

  // 렌더 완료를 잠깐 기다린 뒤 인쇄
  setTimeout(() => {
    win.focus()
    win.print()
  }, 300)

  // onafterprint 미발화 브라우저 대비 안전 정리
  setTimeout(() => {
    if (iframe.parentNode) iframe.remove()
  }, 120000)
}

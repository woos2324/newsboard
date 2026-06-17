import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 허용 도메인 (og:image를 수집하는 언론사 CDN만)
const ALLOWED_HOSTS = [
  "imgnews.pstatic.net",
  "newsimg.kmib.co.kr",
  "image.imnews.imbc.com",
  "img.khan.co.kr",
  "cdn.donga.com",
  "thumb.mt.co.kr",
  "images.hankyung.com",
  "file.mk.co.kr",
  "nimage.sedaily.com",
  "nimg.ws.skynews.app",
  "nate.com",
  "news.nate.com",
  "img1.daumcdn.net",
  "t1.daumcdn.net",
  "image.newsis.com",
  "image.ytn.co.kr",
  "newsimg.hankookilbo.com",
  "cdn.chosun.com",
  "pds.joins.com",
  "www.joongang.co.kr",
];

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "유효하지 않은 URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return NextResponse.json({ error: "http/https만 허용" }, { status: 400 });
  }

  const isAllowed = ALLOWED_HOSTS.some(
    (h) => url.hostname === h || url.hostname.endsWith("." + h)
  );
  if (!isAllowed) {
    return NextResponse.json({ error: "허용되지 않은 도메인" }, { status: 403 });
  }

  try {
    const resp = await fetch(raw, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": url.origin,
        "Accept": "image/*,*/*;q=0.8",
      },
    });

    if (!resp.ok) {
      return NextResponse.json({ error: "이미지 fetch 실패" }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") ?? "image/jpeg";
    const buffer = await resp.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "이미지 로드 실패" }, { status: 502 });
  }
}

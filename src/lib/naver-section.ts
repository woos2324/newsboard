export type SectionArticle = { rank: number; title: string; url: string };
export type SectionData = { name: string; articles: SectionArticle[] };
export type MediaSectionRanking = {
  mediaName: string;
  normalizedName: string;
  sections: SectionData[];
};

export const SECTION_ORDER = ["정치", "경제", "사회", "생활/문화", "세계", "IT/과학"];

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: "https://media.naver.com/",
};

export function kstDateString(date?: Date): string {
  const d = date ?? new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseHtml(html: string): SectionData[] {
  const sections: SectionData[] = [];
  // Split on each section block boundary
  const blocks = html.split('class="press_ranking_box is_section"');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const nameMatch = block.match(/class="press_ranking_head_title">([^<]+)</);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    const articles: SectionArticle[] = [];
    const articleRe =
      /href="(https:\/\/n\.news\.naver\.com\/[^"]+)"[\s\S]{0,600}?class="list_title">([\s\S]{0,300}?)<\/strong>/g;
    let m: RegExpExecArray | null;
    while ((m = articleRe.exec(block)) !== null && articles.length < 3) {
      articles.push({
        rank: articles.length + 1,
        title: m[2].replace(/<[^>]+>/g, "").trim(),
        url: m[1],
      });
    }

    if (articles.length > 0) {
      sections.push({ name, articles });
    }
  }

  return sections.sort(
    (a, b) =>
      (SECTION_ORDER.indexOf(a.name) === -1 ? 99 : SECTION_ORDER.indexOf(a.name)) -
      (SECTION_ORDER.indexOf(b.name) === -1 ? 99 : SECTION_ORDER.indexOf(b.name))
  );
}

export async function fetchMediaSectionRankings(
  media: { mediaName: string; normalizedName: string; naverMediaId: string | null }[],
  date?: string
): Promise<MediaSectionRanking[]> {
  const dateStr = date ?? kstDateString();

  return Promise.all(
    media.map(async ({ mediaName, normalizedName, naverMediaId }) => {
      if (!naverMediaId) return { mediaName, normalizedName, sections: [] };
      const paddedId = naverMediaId.padStart(3, "0");
      const url = `https://media.naver.com/press/${paddedId}/ranking?type=section&date=${dateStr}`;
      try {
        const res = await fetch(url, {
          headers: NAVER_HEADERS,
          next: { revalidate: 1800 },
        });
        if (!res.ok) return { mediaName, normalizedName, sections: [] };
        const html = await res.text();
        return { mediaName, normalizedName, sections: parseHtml(html) };
      } catch {
        return { mediaName, normalizedName, sections: [] };
      }
    })
  );
}

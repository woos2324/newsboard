export type SectionArticle = { rank: number; title: string; url: string };
export type SectionData = { name: string; articles: SectionArticle[] };
export type MediaSectionRanking = {
  mediaName: string;
  normalizedName: string;
  sections: SectionData[];
};

export const SECTION_ORDER = ["정치", "경제", "사회", "생활/문화", "세계", "IT/과학"];

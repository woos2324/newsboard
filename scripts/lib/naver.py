from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

# 매체별 인기 랭킹 (네이버 언론사 페이지)
RANKING_URL_TEMPLATE = (
    "https://media.naver.com/press/{naver_media_id}/ranking?type=popular"
)
PRESS_HOME_URL_TEMPLATE = "https://media.naver.com/press/{naver_media_id}"
# 구독자수 JSON endpoint (HTML 파싱보다 안정)
SUBSCRIBER_API_URL_TEMPLATE = (
    "https://media.naver.com/press/{naver_media_id}/channel/followers.json"
)
# 매체별 일자별 발행 기사 목록 (페이지네이션 있음)
PUBLICATION_LIST_URL_TEMPLATE = (
    "https://news.naver.com/main/list.naver"
    "?mode=LPOD&mid=sec&oid={naver_media_id}&listType=summary"
    "&date={date}&page={page}"
)
# 섹션별 기사 목록 (sid1 파라미터 추가)
PUBLICATION_SECTION_URL_TEMPLATE = (
    "https://news.naver.com/main/list.naver"
    "?mode=LPOD&mid=sec&oid={naver_media_id}&listType=summary"
    "&date={date}&sid1={sid1}&page={page}"
)
# 네이버 섹션 코드 → 카테고리 이름
NAVER_SECTIONS: dict[int, str] = {
    100: "politics",
    101: "economy",
    102: "society",
    103: "culture",
    104: "it",
    105: "world",
    106: "entertainment",
    107: "sports",
}


@dataclass
class RankingItem:
    rank: int
    title: str
    url: str


# 네이버 UI 변경 대비 다중 셀렉터 시도. 위에서 아래 순으로 매칭하여 첫 성공을 사용.
# 2026-04-25 검증: media.naver.com/press/{id}/ranking?type=popular 페이지에서
#   <li class="as_thumb"> > <a href> > <strong class="list_title"> 구조.
# selector 가 모두 실패하면 0건 반환되므로 dry-run 으로 검증 후 갱신할 것.
_RANKING_LIST_SELECTORS: list[str] = [
    "li.as_thumb",
    "ul.press_ranking_home_list_wrap li",
    "ul.ranking_list li",
    "ul.list_ranking li",
    "li[class*=ranking]",
]

_TITLE_SELECTORS: list[str] = [
    "strong.list_title",
    ".list_title",
    ".title",
    ".press_news_title",
    "a strong",
]

# 실제 기사 URL 패턴 (이외는 garbage 로 간주하고 필터)
_ARTICLE_URL_PATTERNS = (
    "n.news.naver.com/article/",
    "news.naver.com/article/",
    "news.naver.com/main/read",
)


def _is_article_url(href: str) -> bool:
    return any(p in href for p in _ARTICLE_URL_PATTERNS)


def parse_ranking_html(html: str, limit: int = 10) -> list[RankingItem]:
    soup = BeautifulSoup(html, "html.parser")

    for sel in _RANKING_LIST_SELECTORS:
        nodes = soup.select(sel)
        if not nodes:
            continue
        items: list[RankingItem] = []
        rank = 0
        for node in nodes:
            link = node.select_one("a[href]")
            href = link.get("href") if link else None
            if not href:
                continue
            href = str(href)
            if href.startswith("/"):
                href = "https://news.naver.com" + href
            # 실제 기사 URL 만 채택 (탭 메뉴·안내 링크 등 garbage 필터)
            if not _is_article_url(href):
                continue

            title: str | None = None
            for tsel in _TITLE_SELECTORS:
                tnode = node.select_one(tsel)
                if tnode and tnode.get_text(strip=True):
                    title = tnode.get_text(strip=True)
                    break
            if not title:
                title = node.get_text(" ", strip=True)[:120]

            rank += 1
            items.append(RankingItem(rank=rank, title=title, url=href))
            if rank >= limit:
                break
        if items:
            return items
    return []


@dataclass
class PublicationArticle:
    title: str
    url: str
    section: str | None = None


def _parse_max_page(soup) -> int:
    paging = (
        soup.select_one(".paging")
        or soup.select_one(".paginate")
        or soup.select_one('[class*="paging"]')
    )
    max_page = 1
    if paging:
        for el in paging.select("a, strong, em, span"):
            text = el.get_text(strip=True)
            try:
                n = int(text)
                if n > max_page:
                    max_page = n
            except ValueError:
                continue
    return max_page


_AUTHOR_SELECTORS: list[str] = [
    "em.media_end_head_journalist_name",
    "span.byline_s",
    "em.reporter_name",
    ".journalist_name em",
    ".byline em",
    "div.article_info em",
]

def parse_author_name(html: str) -> str | None:
    """네이버 기사 본문 페이지에서 기자 이름 추출."""
    soup = BeautifulSoup(html, "html.parser")
    for sel in _AUTHOR_SELECTORS:
        node = soup.select_one(sel)
        if node:
            text = node.get_text(strip=True)
            text = re.sub(r"\s*기자\s*$", "", text).strip()
            if text:
                return text
    return None


def parse_publication_articles(html: str, section: str | None = None) -> tuple[list[PublicationArticle], int]:
    """list.naver 페이지 HTML에서 기사 제목+URL 목록과 max_page 추출.
    returns (articles, max_page).
    """
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    articles: list[PublicationArticle] = []

    # 제목 dt(사진 dt 제외) 의 a 태그에서 title + url 추출
    for a in soup.select("dt:not(.photo) a[href]"):
        href = str(a.get("href") or "")
        if "mnews/article" not in href:
            continue
        if href in seen:
            continue
        title = a.get_text(strip=True)
        if title:
            seen.add(href)
            articles.append(PublicationArticle(title=title, url=href, section=section))

    return articles, _parse_max_page(soup)


def count_publication_links(html: str) -> tuple[int, int]:
    """list.naver 페이지 HTML 파싱.
    returns (count_on_this_page, max_page_seen_in_pagination).
    """
    soup = BeautifulSoup(html, "html.parser")
    urls: set[str] = set()
    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        if "n.news.naver.com/mnews/article" in str(href) or (
            "news.naver.com" in str(href) and "/mnews/article" in str(href)
        ):
            urls.add(str(href))
    return len(urls), _parse_max_page(soup)


def extract_subscriber_count(data) -> int | None:
    """followers.json 응답에서 구독자수 추출.
    응답 형식이 변경될 수 있어 다양한 키와 중첩 구조에 대응."""
    if data is None:
        return None
    if isinstance(data, list):
        for item in data:
            r = extract_subscriber_count(item)
            if r is not None:
                return r
        return None
    if isinstance(data, dict):
        for key in (
            "totalCount",
            "total",
            "count",
            "subscriberCount",
            "followerCount",
            "subscribers",
            "followers",
        ):
            v = data.get(key)
            if isinstance(v, int):
                return v
            if isinstance(v, str):
                try:
                    return int(v.replace(",", ""))
                except ValueError:
                    pass
        for nest in ("result", "data", "message", "channel"):
            r = extract_subscriber_count(data.get(nest))
            if r is not None:
                return r
    return None

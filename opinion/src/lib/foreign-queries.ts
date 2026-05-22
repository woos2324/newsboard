import { unstable_cache } from 'next/cache'
import { supabase } from './supabase'

export interface ForeignEditorial {
  foreign_editorial_id: number
  source_code: string
  source_country: string
  source_language: 'en' | 'ja'
  title_original: string
  title_ko: string | null
  body_original: string | null
  body_ko: string | null
  url: string
  published_at: string | null
  edition_date: string | null
  author: string | null
  topic: string | null
  ai_meta: Record<string, unknown> | null
  fetched_at: string
}

export interface ForeignSourceMeta {
  code: string
  name_ko: string
  name_en: string
  country: string
  language: 'en' | 'ja'
}

// 매체 메타 (사이드에 별도 테이블 두지 않고 코드 상수로 관리 — Python 쪽 foreign_sources.py 와 동기 유지)
export const FOREIGN_SOURCES: Record<string, ForeignSourceMeta> = {
  wapo:    { code: 'wapo',    name_ko: '워싱턴포스트',         name_en: 'The Washington Post',     country: 'US', language: 'en' },
  nyt:     { code: 'nyt',     name_ko: '뉴욕타임스',           name_en: 'The New York Times',      country: 'US', language: 'en' },
  ft:      { code: 'ft',      name_ko: '파이낸셜타임스',       name_en: 'Financial Times',         country: 'UK', language: 'en' },
  scmp:    { code: 'scmp',    name_ko: '사우스차이나모닝포스트', name_en: 'South China Morning Post', country: 'HK', language: 'en' },
  wtimes:  { code: 'wtimes',  name_ko: '워싱턴타임스',         name_en: 'The Washington Times',    country: 'US', language: 'en' },
  mainichi:{ code: 'mainichi',name_ko: '마이니치신문',         name_en: '毎日新聞',                country: 'JP', language: 'ja' },
  sankei:  { code: 'sankei',  name_ko: '산케이신문',           name_en: '産経新聞',                country: 'JP', language: 'ja' },
}

// 사이드바 표시 순서 (구독 영문 → 무료 영문 → 일본어)
export const FOREIGN_SOURCE_ORDER: string[] = ['wapo', 'nyt', 'ft', 'scmp', 'wtimes', 'mainichi', 'sankei']

export function getForeignSourceMeta(code: string): ForeignSourceMeta {
  return FOREIGN_SOURCES[code] ?? {
    code,
    name_ko: code,
    name_en: code,
    country: '',
    language: 'en',
  }
}

const LIST_COLS = `
  foreign_editorial_id, source_code, source_country, source_language,
  title_original, title_ko, url, published_at, edition_date, author, topic, fetched_at
`

const fetchForeignByDate = async (date: string): Promise<ForeignEditorial[]> => {
  const { data, error } = await supabase
    .from('foreign_editorial')
    .select(LIST_COLS)
    .eq('edition_date', date)
    .order('published_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ForeignEditorial[]
}

// 오늘: 30분 캐시 (cron 07:00 KST 1회 수집)
export const getTodayForeignEditorials = unstable_cache(
  fetchForeignByDate,
  ['foreign-editorial-today'],
  { revalidate: 1800, tags: ['foreign-editorial'] },
)

// 과거 날짜: 24h 캐시
export const getPastForeignEditorials = unstable_cache(
  fetchForeignByDate,
  ['foreign-editorial-past'],
  { revalidate: 86400, tags: ['foreign-editorial'] },
)

// 검색: title_original OR title_ko (제목만, 본문 제외)
export async function searchForeignEditorials(keyword: string, limit = 10): Promise<ForeignEditorial[]> {
  const q = keyword.trim()
  if (q.length < 2) return []
  const pattern = `%${q}%`
  const { data, error } = await supabase
    .from('foreign_editorial')
    .select(LIST_COLS)
    .or(`title_original.ilike.${pattern},title_ko.ilike.${pattern}`)
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as ForeignEditorial[]
}

export async function getForeignEditorialById(id: number): Promise<ForeignEditorial | null> {
  const { data, error } = await supabase
    .from('foreign_editorial')
    .select('*')
    .eq('foreign_editorial_id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as ForeignEditorial | null
}

// 데이터가 있는 가장 최근 edition_date (오늘에 데이터 없을 때 fallback 용)
export async function getLatestForeignEditionDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from('foreign_editorial')
    .select('edition_date')
    .not('edition_date', 'is', null)
    .order('edition_date', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0]?.edition_date ?? null
}

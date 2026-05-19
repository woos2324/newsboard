const PALETTE = [
  { bg: 'bg-red-50', text: 'text-red-700' },
  { bg: 'bg-orange-50', text: 'text-orange-700' },
  { bg: 'bg-amber-50', text: 'text-amber-700' },
  { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  { bg: 'bg-teal-50', text: 'text-teal-700' },
  { bg: 'bg-sky-50', text: 'text-sky-700' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  { bg: 'bg-purple-50', text: 'text-purple-700' },
  { bg: 'bg-pink-50', text: 'text-pink-700' },
] as const

export function getMediaColor(name: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

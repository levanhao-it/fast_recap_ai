import FlexSearch from 'flexsearch'
import { transcriptText } from './db'
import type { Recording } from './types'

/** In-memory full-text index (diacritic-insensitive), rebuilt from IndexedDB data. */
export function searchRecordings(recs: Recording[], query: string): Recording[] {
  const q = query.trim()
  if (!q) return recs
  const fold = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Ä‘/g, 'd').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const index = new FlexSearch.Index({ tokenize: 'forward', encode: fold })
  recs.forEach((r, i) => index.add(i, `${r.title} ${r.tags.join(' ')} ${r.folder} ${r.summary} ${transcriptText(r)}`))
  const ids = new Set(index.search(q, { limit: 200 }) as number[])
  return recs.filter((_, i) => ids.has(i))
}

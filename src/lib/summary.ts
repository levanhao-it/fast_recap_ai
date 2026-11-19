import { formatTime } from './text'
import type { Segment } from './types'

export type TemplateId = 'meeting' | 'lecture' | 'interview' | 'memo'

export interface Item {
  text: string
  t: number
}
export interface Action {
  task: string
  owner: string
  deadline: string
  t: number
}
export interface Extraction {
  points: Item[]
  decisions: Item[]
  actions: Action[]
}

interface Labels {
  summary: string
  points: string
  decisions: string
  actions: string
  insights: string
  none: string
}

interface Template {
  focus: string
  vi: Labels
  en: Labels
}

export const TEMPLATES: Record<TemplateId, Template> = {
  meeting: {
    focus: 'a business meeting: key points discussed, decisions made, and action items (who does what by when)',
    vi: { summary: 'TÃ³m táº¯t', points: 'Ã chÃ­nh', decisions: 'Quyáº¿t Ä‘á»‹nh', actions: 'Viá»‡c cáº§n lÃ m', insights: 'Nháº­n Ä‘á»‹nh', none: 'KhÃ´ng cÃ³' },
    en: { summary: 'Summary', points: 'Key points', decisions: 'Decisions', actions: 'Action items', insights: 'Insights', none: 'None' },
  },
  lecture: {
    focus: 'a lecture: key concepts (points), definitions and examples (decisions), and things to study or follow up (actions)',
    vi: { summary: 'TÃ³m táº¯t', points: 'KhÃ¡i niá»‡m chÃ­nh', decisions: 'Äá»‹nh nghÄ©a & vÃ­ dá»¥', actions: 'Cáº§n Ã´n táº­p', insights: 'Nháº­n Ä‘á»‹nh', none: 'KhÃ´ng cÃ³' },
    en: { summary: 'Summary', points: 'Key concepts', decisions: 'Definitions & examples', actions: 'To study', insights: 'Insights', none: 'None' },
  },
  interview: {
    focus: 'an interview: main answers and topics (points), notable quotes (decisions), and follow-ups (actions)',
    vi: { summary: 'TÃ³m táº¯t', points: 'Chá»§ Ä‘á» & cÃ¢u tráº£ lá»i', decisions: 'TrÃ­ch dáº«n Ä‘Ã¡ng chÃº Ã½', actions: 'Cáº§n theo dÃµi', insights: 'Nháº­n Ä‘á»‹nh', none: 'KhÃ´ng cÃ³' },
    en: { summary: 'Summary', points: 'Topics & answers', decisions: 'Notable quotes', actions: 'Follow-ups', insights: 'Insights', none: 'None' },
  },
  memo: {
    focus: 'a personal voice memo: ideas (points), decisions, and to-dos (actions)',
    vi: { summary: 'TÃ³m táº¯t', points: 'Ã tÆ°á»Ÿng', decisions: 'Quyáº¿t Ä‘á»‹nh', actions: 'Viá»‡c cáº§n lÃ m', insights: 'Nháº­n Ä‘á»‹nh', none: 'KhÃ´ng cÃ³' },
    en: { summary: 'Summary', points: 'Ideas', decisions: 'Decisions', actions: 'To-dos', insights: 'Insights', none: 'None' },
  },
}

/** Rough token estimate; Vietnamese/CJK text costs far more tokens per character than English. */
export function estimateTokens(s: string): number {
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0) < 128 ? 0.28 : 0.8
  return Math.ceil(n)
}

export function parseTime(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  const m = v.match(/(\d+):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:]+$/g, '').trim()

/** Removes Whisper artefacts: consecutive duplicates, looping phrases, and tiny fragments. */
export function cleanSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const text = s.text.replace(/(.{3,60}?)(?:[\s,.]*\1){3,}/gu, '$1').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const prev = out[out.length - 1]
    if (prev && norm(prev.text) === norm(text)) continue
    if (prev && text.length < 20) {
      prev.text += ' ' + text
      prev.end = s.end
      continue
    }
    out.push({ ...s, text })
  }
  return out
}

export interface TokenChunk {
  start: number
  end: number
  text: string
}

/** Chunks timestamp-prefixed lines by estimated tokens, repeating `overlap` lines for context. */
export function chunkByTokens(segments: Segment[], maxTokens = 1100, overlap = 1): TokenChunk[] {
  const lines = segments
    .filter((s) => s.text.trim())
    .map((s) => {
      const line = `[${formatTime(s.start)}] ${s.text.trim()}`
      return { start: s.start, end: s.end, line, tok: estimateTokens(line) }
    })
  const chunks: TokenChunk[] = []
  let cur: typeof lines = []
  let used = 0
  let fresh = 0
  const flush = () =>
    chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((l) => l.line).join('\n') })
  for (const l of lines) {
    if (cur.length && used + l.tok > maxTokens) {
      flush()
      cur = overlap > 0 ? cur.slice(-overlap) : []
      used = cur.reduce((a, x) => a + x.tok, 0)
      fresh = 0
    }
    cur.push(l)
    used += l.tok
    fresh++
  }
  if (cur.length && fresh > 0) flush()
  return chunks
}

/** Parses JSON from LLM output that may contain fences, chatter or trailing commas. */
export function parseJsonLoose(s: string): unknown {
  const body = s.replace(/```[a-z]*/gi, '').trim()
  const attempts = [body]
  const a = body.indexOf('{')
  const b = body.lastIndexOf('}')
  if (a >= 0 && b > a) attempts.push(body.slice(a, b + 1))
  for (const t of attempts) {
    for (const candidate of [t, t.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        return JSON.parse(candidate)
      } catch {
        /* try next */
      }
    }
  }
  return null
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function toItem(v: unknown, fallbackT: number): Item | null {
  if (typeof v === 'string') return v.trim() ? { text: v.trim(), t: parseTime(v.match(/^\[?(\d+:\d{2}(?::\d{2})?)\]?/)?.[1]) ?? fallbackT } : null
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const text = str(o.text ?? o.point ?? o.decision ?? o.content ?? o.quote)
  if (!text) return null
  return { text, t: parseTime(o.time ?? o.t ?? o.timestamp) ?? fallbackT }
}

/** Tolerant normalisation of one map-step result. */
export function normalizeExtraction(raw: unknown, fallbackT: number): Extraction {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const items = (v: unknown) => asArray(v).map((x) => toItem(x, fallbackT)).filter((x): x is Item => !!x)
  const actions = asArray(o.actions).flatMap((v): Action[] => {
    if (typeof v === 'string') return v.trim() ? [{ task: v.trim(), owner: '', deadline: '', t: fallbackT }] : []
    if (!v || typeof v !== 'object') return []
    const a = v as Record<string, unknown>
    const task = str(a.task ?? a.text ?? a.action)
    if (!task) return []
    const clean = (x: string) => (/^(none|n\/a|null|unknown|khÃ´ng|-)$/i.test(x) ? '' : x)
    return [{ task, owner: clean(str(a.owner ?? a.who)), deadline: clean(str(a.deadline ?? a.due)), t: parseTime(a.time ?? a.t) ?? fallbackT }]
  })
  return { points: items(o.points), decisions: items(o.decisions), actions }
}

const words = (s: string) => new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))
function similar(a: string, b: string): boolean {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return norm(a) === norm(b)
  let inter = 0
  for (const w of x) if (y.has(w)) inter++
  return inter / (x.size + y.size - inter) > 0.7
}

export function dedupe<T>(list: T[], key: (x: T) => string): T[] {
  const out: T[] = []
  for (const x of list) if (!out.some((y) => similar(key(x), key(y)))) out.push(x)
  return out
}

export function mergeExtractions(list: Extraction[]): Extraction {
  return {
    points: dedupe(list.flatMap((e) => e.points), (x) => x.text),
    decisions: dedupe(list.flatMap((e) => e.decisions), (x) => x.text),
    actions: dedupe(list.flatMap((e) => e.actions), (x) => x.task),
  }
}

const ts = (t: number) => `[${formatTime(t)}]`

export function composeSummary(opts: {
  labels: Labels
  summary: string
  insights: string[]
  data: Extraction
}): string {
  const { labels: L, summary, insights, data } = opts
  const list = (xs: string[]) => (xs.length ? xs.join('\n') : `- ${L.none}`)
  const items = (xs: Item[]) => list(xs.map((x) => `- ${ts(x.t)} ${x.text}`))
  const actions = list(
    data.actions.map((a) => {
      const meta = [a.owner, a.deadline].filter(Boolean).join(' · ')
      return `- [ ] ${a.task}${meta ? ` — ${meta}` : ''} ${ts(a.t)}`
    }),
  )
  return [
    `## ${L.summary}\n${summary.trim() || L.none}`,
    `## ${L.points}\n${items(data.points)}`,
    `## ${L.decisions}\n${items(data.decisions)}`,
    `## ${L.actions}\n${actions}`,
    `## ${L.insights}\n${list(insights.filter(Boolean).map((i) => `- ${i}`))}`,
  ].join('\n\n')
}

/** Toggles "- [ ]" / "- [x]" on one line of markdown. */
export function toggleCheckbox(md: string, lineIdx: number): string {
  const lines = md.split('\n')
  const l = lines[lineIdx]
  if (l === undefined) return md
  lines[lineIdx] = /\[ \]/.test(l) ? l.replace('[ ]', '[x]') : l.replace(/\[[xX]\]/, '[ ]')
  return lines.join('\n')
}

import type { Segment } from './types'

/** Group consecutive segments into chunks of at most `max` characters. */
export function chunkSegments(segments: Segment[], max = 1200): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = []
  let cur: { start: number; text: string } | null = null
  for (const s of segments) {
    const t = s.text.trim()
    if (!t) continue
    if (!cur) cur = { start: s.start, text: t }
    else if (cur.text.length + t.length + 1 > max) {
      out.push(cur)
      cur = { start: s.start, text: t }
    } else cur.text += ' ' + t
  }
  if (cur) out.push(cur)
  return out
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)

/** Keyword overlap score, used when embeddings are unavailable. */
export function keywordScore(query: string, text: string): number {
  const q = new Set(tokens(query))
  if (!q.size) return 0
  const t = new Set(tokens(text))
  let hit = 0
  for (const w of q) if (t.has(w)) hit++
  return hit / q.size
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export interface Slide {
  title: string
  bullets: string[]
}

/** Parses "## Title" + "- bullet" markdown produced by the LLM into slides. */
export function parseSlides(md: string): Slide[] {
  const slides: Slide[] = []
  let cur: Slide | null = null
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line || /^```/.test(line) || /^-{3,}$/.test(line)) continue
    const h = line.match(/^#{1,3}\s+(.*)$/)
    if (h) {
      cur = { title: h[1].replace(/^(slide\s*\d+\s*[:.-]\s*)/i, '').trim(), bullets: [] }
      slides.push(cur)
      continue
    }
    const b = line.match(/^(?:[-*â€¢]|\d+[.)])\s+(.*)$/)
    if (b && cur) cur.bullets.push(b[1].trim())
    else if (cur && !b) cur.bullets.push(line)
  }
  return slides.filter((s) => s.title)
}

/** Strips code fences / chatter so markmap receives a clean heading + list tree. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/^```[a-z]*\n?/gim, '')
    .replace(/```$/gm, '')
    .trim()
}

/** Splits markdown on "## Heading" into a map keyed by lowercase heading. */
export function parseSections(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key = ''
  for (const line of md.split('\n')) {
    const h = line.match(/^#{1,3}\s+(.*)$/)
    if (h) {
      key = h[1].trim().toLowerCase()
      out[key] = ''
    } else if (key) out[key] += line + '\n'
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim()
  return out
}

export function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(?:(\d+):)?(\d{1,2}):(\d{2})\]/g, (m, h, mm, ss) => {
        const sec = (h ? +h * 3600 : 0) + +mm * 60 + +ss
        return `<a href="#" data-seek="${sec}" class="font-mono text-xs text-indigo-600">${m}</a>`
      })
  const html: string[] = []
  let inList = false
  md.split('\n').forEach((raw, idx) => {
    const line = raw.trim()
    const li = line.match(/^(?:[-*â€¢]|\d+[.)])\s+(.*)$/)
    if (li) {
      if (!inList) html.push('<ul>')
      inList = true
      const cb = li[1].match(/^\[([ xX])\]\s*(.*)$/)
      if (cb) {
        const done = cb[1] !== ' '
        html.push(
          `<li class="list-none -ml-5"><label><input type="checkbox" data-line="${idx}"${done ? ' checked' : ''}> <span${done ? ' class="line-through opacity-60"' : ''}>${inline(cb[2])}</span></label></li>`,
        )
      } else html.push(`<li>${inline(li[1])}</li>`)
      return
    }
    if (inList) html.push('</ul>')
    inList = false
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h) html.push(`<h2>${inline(h[1])}</h2>`)
    else if (line) html.push(`<p>${inline(line)}</p>`)
  })
  if (inList) html.push('</ul>')
  return html.join('')
}

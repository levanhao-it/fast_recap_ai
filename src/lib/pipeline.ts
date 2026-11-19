import { chat, type ChatOpts, type Msg } from './llm'
import { db, transcriptText } from './db'
import { embedTexts } from './ml'
import { langName, useSettings } from './models'
import {
  TEMPLATES,
  chunkByTokens,
  cleanSegments,
  composeSummary,
  estimateTokens,
  mergeExtractions,
  normalizeExtraction,
  parseJsonLoose,
  type Extraction,
} from './summary'
import { chunkSegments, cleanMarkdown, cosine, keywordScore } from './text'
import type { Recording } from './types'

type Opts = Pick<ChatOpts, 'onToken' | 'onProgress'> & { onStep?: (s: string) => void }

const outLang = (rec?: Recording) => {
  const l = useSettings.getState().outputLang
  if (l !== 'auto') return langName(l)
  return rec && rec.language !== 'auto' ? langName(rec.language) : 'the same language as the transcript'
}

const sys = (lang: string): Msg => ({
  role: 'system',
  content: `You are a precise meeting assistant. Only use facts from the provided text. Write in ${lang}.`,
})

const timeItem = {
  type: 'object',
  properties: { time: { type: 'string' }, text: { type: 'string' } },
  required: ['time', 'text'],
}
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    points: { type: 'array', items: timeItem },
    decisions: { type: 'array', items: timeItem },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { task: { type: 'string' }, owner: { type: 'string' }, deadline: { type: 'string' }, time: { type: 'string' } },
        required: ['task', 'owner', 'deadline', 'time'],
      },
    },
  },
  required: ['points', 'decisions', 'actions'],
}
const OVERVIEW_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, insights: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'insights'],
}

const labelLang = (rec: Recording): 'vi' | 'en' => {
  const l = useSettings.getState().outputLang
  return (l === 'auto' ? rec.language : l) === 'vi' ? 'vi' : 'en'
}

/** Removes timestamps and checkbox markers so summaries can feed other prompts. */
const plain = (md: string) => md.replace(/\s*\[(?:\d+:)?\d{1,2}:\d{2}\]/g, '').replace(/\[[ xX]\]\s*/g, '')

async function chatJson(messages: Msg[], schema: object, maxTokens: number, o: Opts): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(messages, { schema, maxTokens, temperature: attempt ? 0 : 0.2, onProgress: o.onProgress })
    const parsed = parseJsonLoose(raw)
    if (parsed) return parsed
  }
  return null
}

/**
 * Map-reduce summary: (1) clean transcript, (2) extract structured facts per chunk with JSON-constrained
 * output, (3) merge + dedupe, (4) write a short overview from the merged facts only.
 */
export async function summarize(rec: Recording, o: Opts = {}): Promise<string> {
  const lang = outLang(rec)
  const tpl = TEMPLATES[rec.template ?? 'meeting']
  const chunks = chunkByTokens(cleanSegments(rec.segments))
  if (!chunks.length) throw new Error('empty transcript')

  const extracted: Extraction[] = []
  for (let i = 0; i < chunks.length; i++) {
    o.onStep?.(`${i + 1}/${chunks.length}`)
    const c = chunks[i]
    const raw = await chatJson(
      [
        sys(lang),
        {
          role: 'user',
          content: `The transcript excerpt below is from ${tpl.focus}. Every line starts with a [m:ss] timestamp.
Extract ONLY what is explicitly said; never invent facts. Return JSON:
{"points":[{"time":"m:ss","text":"..."}],"decisions":[{"time":"m:ss","text":"..."}],"actions":[{"task":"...","owner":"","deadline":"","time":"m:ss"}]}
Rules: at most 5 points; "time" is copied from the nearest timestamp; leave owner/deadline empty ("") if not stated; use empty arrays if nothing applies; write text in ${lang}.

${c.text}`,
        },
      ],
      EXTRACT_SCHEMA,
      600,
      o,
    )
    if (raw) extracted.push(normalizeExtraction(raw, c.start))
  }
  const data = mergeExtractions(extracted)
  if (!data.points.length && !data.decisions.length && !data.actions.length) throw new Error('Could not extract a summary')

  o.onStep?.('final')
  // Cap facts fed to the overview so it fits small context windows
  let budget = 1500
  const facts: string[] = []
  for (const f of [...data.points.map((p) => p.text), ...data.decisions.map((d) => 'Decision: ' + d.text), ...data.actions.map((a) => 'Task: ' + a.task)]) {
    budget -= estimateTokens(f)
    if (budget < 0) break
    facts.push('- ' + f)
  }
  const overview = (await chatJson(
    [
      sys(lang),
      {
        role: 'user',
        content: `These are facts extracted from ${tpl.focus}.
Write JSON {"summary":"2-4 sentences in ${lang}","insights":["up to 3 non-obvious takeaways in ${lang}"]}. Use only the facts below.

${facts.join('\n')}`,
      },
    ],
    OVERVIEW_SCHEMA,
    500,
    o,
  )) as { summary?: unknown; insights?: unknown } | null

  return composeSummary({
    labels: tpl[labelLang(rec)],
    summary: typeof overview?.summary === 'string' ? overview.summary : '',
    insights: Array.isArray(overview?.insights) ? overview.insights.filter((x): x is string => typeof x === 'string') : [],
    data,
  })
}

export async function makeMindmap(rec: Recording, o: Opts = {}): Promise<string> {
  const source = plain(rec.summary) || transcriptText(rec).slice(0, 6000)
  const md = await chat(
    [
      sys(outLang(rec)),
      {
        role: 'user',
        content: `Turn this content into a mind map as Markdown: one "# " root heading, then "## " main topics, then nested "- " bullets (max 3 levels, short phrases, no sentences). Output only the Markdown.\n\n${source}`,
      },
    ],
    { maxTokens: 600, onToken: o.onToken, onProgress: o.onProgress },
  )
  return cleanMarkdown(md)
}

export async function makeSlides(rec: Recording, o: Opts = {}): Promise<string> {
  const source = plain(rec.summary) || transcriptText(rec).slice(0, 6000)
  const md = await chat(
    [
      sys(outLang(rec)),
      {
        role: 'user',
        content: `Create a presentation of 6-10 slides from this content. First slide: title slide. Format each slide as "## Slide title" followed by 3-5 short "- " bullets. Last slide: next steps. Output only the Markdown.\n\n${source}`,
      },
    ],
    { maxTokens: 900, onToken: o.onToken, onProgress: o.onProgress },
  )
  return cleanMarkdown(md)
}

export async function suggestTitle(rec: Recording): Promise<string> {
  const t = await chat(
    [sys(outLang(rec)), { role: 'user', content: `Give a title of at most 8 words for this meeting. Output only the title.\n\n${transcriptText(rec).slice(0, 2500)}` }],
    { maxTokens: 24, temperature: 0.2 },
  )
  return t.replace(/^["'#\s]+|["'.\s]+$/g, '').slice(0, 80)
}

/** Builds the Q&A index: chunks + (best-effort) embeddings. */
export async function indexRecording(rec: Recording): Promise<void> {
  await db.chunks.where('recordingId').equals(rec.id).delete()
  const chunks = chunkSegments(rec.segments, 500).map((c) => ({ recordingId: rec.id, ...c }))
  let vecs: number[][] | null = null
  try {
    vecs = await embedTexts(chunks.map((c) => 'passage: ' + c.text))
  } catch {
    vecs = null
  }
  await db.chunks.bulkAdd(chunks.map((c, i) => ({ ...c, vec: vecs ? Float32Array.from(vecs[i]) : undefined })))
}

export async function retrieve(rec: Recording, question: string, k = 4) {
  let chunks = await db.chunks.where('recordingId').equals(rec.id).toArray()
  if (!chunks.length) {
    await indexRecording(rec)
    chunks = await db.chunks.where('recordingId').equals(rec.id).toArray()
  }
  let scored: { c: (typeof chunks)[number]; s: number }[]
  if (chunks.every((c) => c.vec)) {
    try {
      const [q] = await embedTexts(['query: ' + question])
      scored = chunks.map((c) => ({ c, s: cosine(q, c.vec!) }))
    } catch {
      scored = chunks.map((c) => ({ c, s: keywordScore(question, c.text) }))
    }
  } else scored = chunks.map((c) => ({ c, s: keywordScore(question, c.text) }))
  return scored.sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.c)
}

export async function ask(rec: Recording, question: string, history: Msg[], o: Opts = {}) {
  const ctx = (await retrieve(rec, question)).sort((a, b) => a.start - b.start)
  const context = ctx.map((c) => `[${Math.floor(c.start)}s] ${c.text}`).join('\n\n')
  const answer = await chat(
    [
      {
        role: 'system',
        content: `You answer questions about a meeting transcript. Use only the excerpts below; if the answer is not there, say you don't know. Answer in ${outLang(rec)}. Be concise.\n\nExcerpts:\n${context}`,
      },
      ...history.slice(-4),
      { role: 'user', content: question },
    ],
    { maxTokens: 400, onToken: o.onToken, onProgress: o.onProgress },
  )
  return { answer, sources: ctx.map((c) => c.start) }
}

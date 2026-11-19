import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { schema?: object; prompt: string }[] = []

vi.mock('./llm', () => ({
  chat: vi.fn(async (messages: { content: string }[], opts: { schema?: object }) => {
    const prompt = messages[messages.length - 1].content
    calls.push({ schema: opts.schema, prompt })
    if (prompt.includes('"insights"')) return '{"summary":"Há»p vá» ngÃ¢n sÃ¡ch.","insights":["Cáº§n theo dÃµi chi phÃ­"]}'
    return '```json\n{"points":[{"time":"0:10","text":"NgÃ¢n sÃ¡ch quÃ½ 3 tÄƒng"}],"decisions":[],"actions":[{"task":"Gá»­i bÃ¡o cÃ¡o","owner":"Lan","deadline":"thá»© SÃ¡u","time":"0:20"}]}\n```'
  }),
}))
vi.mock('./ml', () => ({ embedTexts: vi.fn(), call: vi.fn() }))
vi.mock('./db', () => ({ db: {}, transcriptText: (r: { segments: { text: string }[] }) => r.segments.map((s) => s.text).join(' ') }))

import { summarize } from './pipeline'
import type { Recording } from './types'

const filler = Array.from({ length: 30 }, (_, k) => `tá»«${k}`).join(' ')
const rec = (n: number): Recording => ({
  id: '1',
  title: 't',
  createdAt: 0,
  updatedAt: 0,
  duration: 0,
  language: 'vi',
  folder: '',
  tags: [],
  status: 'transcribed',
  summary: '',
  slides: '',
  mindmap: '',
  segments: Array.from({ length: n }, (_, i) => ({ start: i * 5, end: i * 5 + 4, text: `CÃ¢u sá»‘ ${i} nÃ³i vá» ngÃ¢n sÃ¡ch quÃ½ ba vÃ  káº¿ hoáº¡ch chi tiÃªu cá»§a cÃ´ng ty ${filler}` })),
})

describe('summarize', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('runs map (JSON schema) then reduce and composes structured markdown', async () => {
    const md = await summarize(rec(30))
    const extractCalls = calls.filter((c) => !c.prompt.includes('"insights"'))
    expect(extractCalls.length).toBeGreaterThan(1)
    expect(extractCalls.every((c) => c.schema)).toBe(true)
    expect(md).toContain('## Ã chÃ­nh')
    expect(md).toContain('- [0:10] NgÃ¢n sÃ¡ch quÃ½ 3 tÄƒng')
    expect(md).toContain('- [ ] Gá»­i bÃ¡o cÃ¡o â€” Lan Â· thá»© SÃ¡u [0:20]')
    expect(md).toContain('Há»p vá» ngÃ¢n sÃ¡ch.')
    // duplicated facts across chunks are merged
    expect(md.match(/NgÃ¢n sÃ¡ch quÃ½ 3 tÄƒng/g)).toHaveLength(1)
  })

  it('rejects empty transcripts', async () => {
    await expect(summarize(rec(0))).rejects.toThrow('empty transcript')
  })
})

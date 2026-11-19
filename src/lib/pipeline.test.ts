import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { schema?: object; prompt: string }[] = []

vi.mock('./llm', () => ({
  chat: vi.fn(async (messages: { content: string }[], opts: { schema?: object }) => {
    const prompt = messages[messages.length - 1].content
    calls.push({ schema: opts.schema, prompt })
    if (prompt.includes('"insights"')) return '{"summary":"Họp về ngân sách.","insights":["Cần theo dõi chi phí"]}'
    return '```json\n{"points":[{"time":"0:10","text":"Ngân sách quý 3 tăng"}],"decisions":[],"actions":[{"task":"Gửi báo cáo","owner":"Lan","deadline":"thứ Sáu","time":"0:20"}]}\n```'
  }),
}))
vi.mock('./ml', () => ({ embedTexts: vi.fn(), call: vi.fn() }))
vi.mock('./db', () => ({ db: {}, transcriptText: (r: { segments: { text: string }[] }) => r.segments.map((s) => s.text).join(' ') }))

import { summarize } from './pipeline'
import type { Recording } from './types'

const filler = Array.from({ length: 30 }, (_, k) => `từ${k}`).join(' ')
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
  segments: Array.from({ length: n }, (_, i) => ({ start: i * 5, end: i * 5 + 4, text: `Câu số ${i} nói về ngân sách quý ba và kế hoạch chi tiêu của công ty ${filler}` })),
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
    expect(md).toContain('## Ý chính')
    expect(md).toContain('- [0:10] Ngân sách quý 3 tăng')
    expect(md).toContain('- [ ] Gửi báo cáo — Lan · thứ Sáu [0:20]')
    expect(md).toContain('Họp về ngân sách.')
    // duplicated facts across chunks are merged
    expect(md.match(/Ngân sách quý 3 tăng/g)).toHaveLength(1)
  })

  it('rejects empty transcripts', async () => {
    await expect(summarize(rec(0))).rejects.toThrow('empty transcript')
  })
})

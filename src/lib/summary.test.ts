import { describe, expect, it } from 'vitest'
import {
  chunkByTokens,
  cleanSegments,
  composeSummary,
  dedupe,
  estimateTokens,
  mergeExtractions,
  normalizeExtraction,
  parseJsonLoose,
  parseTime,
  TEMPLATES,
  toggleCheckbox,
} from './summary'
import { renderMarkdown } from './text'

const seg = (start: number, text: string) => ({ start, end: start + 2, text })

describe('summary helpers', () => {
  it('parses times', () => {
    expect(parseTime('12:30')).toBe(750)
    expect(parseTime('[1:02:03]')).toBe(3723)
    expect(parseTime('abc')).toBeNull()
    expect(parseTime(42)).toBe(42)
  })

  it('estimates more tokens for non-ASCII text', () => {
    expect(estimateTokens('họp ngân sách quý ba')).toBeGreaterThan(estimateTokens('budget meeting q3 ok'))
  })

  it('cleans duplicates, loops and tiny fragments', () => {
    const out = cleanSegments([
      seg(0, 'Hello everyone welcome'),
      seg(2, 'Hello everyone welcome'),
      seg(4, 'ok'),
      seg(6, 'Cảm ơn các bạn đã theo dõi. Cảm ơn các bạn đã theo dõi. Cảm ơn các bạn đã theo dõi. Cảm ơn các bạn đã theo dõi.'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].text).toBe('Hello everyone welcome ok')
  })

  it('chunks by tokens with overlap and timestamps', () => {
    const segs = Array.from({ length: 10 }, (_, i) => seg(i * 10, 'word '.repeat(40)))
    const chunks = chunkByTokens(segs, 100, 1)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[0].text.startsWith('[0:00]')).toBe(true)
    // overlap: the first line of chunk 2 is the last line of chunk 1
    const lastOfFirst = chunks[0].text.split('\n').pop()
    expect(chunks[1].text.split('\n')[0]).toBe(lastOfFirst)
    expect(chunks.at(-1)!.end).toBe(92)
  })

  it('does not emit a trailing chunk made only of overlap', () => {
    const chunks = chunkByTokens([seg(0, 'a'.repeat(100)), seg(5, 'b'.repeat(100))], 1000, 1)
    expect(chunks).toHaveLength(1)
  })

  it('parses loose JSON', () => {
    expect(parseJsonLoose('```json\n{"a":1,}\n```')).toEqual({ a: 1 })
    expect(parseJsonLoose('Sure! {"a":[1,2]} done')).toEqual({ a: [1, 2] })
    expect(parseJsonLoose('nope')).toBeNull()
  })

  it('normalizes extraction output tolerantly', () => {
    const e = normalizeExtraction(
      {
        points: [{ time: '1:30', text: 'A' }, 'B', { text: '' }, 5],
        decisions: [{ text: 'D' }],
        actions: [{ task: 'Send report', owner: 'Lan', deadline: 'N/A', time: '2:00' }, 'Call Bob', {}],
      },
      60,
    )
    expect(e.points).toEqual([{ text: 'A', t: 90 }, { text: 'B', t: 60 }])
    expect(e.decisions[0].t).toBe(60)
    expect(e.actions[0]).toEqual({ task: 'Send report', owner: 'Lan', deadline: '', t: 120 })
    expect(e.actions[1].task).toBe('Call Bob')
    expect(e.actions).toHaveLength(2)
  })

  it('dedupes near-identical items', () => {
    const out = dedupe(['Launch the new pricing in May', 'launch new pricing in May.', 'Hire two engineers'], (x) => x)
    expect(out).toEqual(['Launch the new pricing in May', 'Hire two engineers'])
  })

  it('merges extractions', () => {
    const a = normalizeExtraction({ points: ['Alpha beta gamma'] }, 0)
    const b = normalizeExtraction({ points: ['alpha beta gamma'] }, 100)
    expect(mergeExtractions([a, b]).points).toHaveLength(1)
  })

  it('composes markdown that renders checkboxes and seek links', () => {
    const md = composeSummary({
      labels: TEMPLATES.meeting.en,
      summary: 'Short.',
      insights: ['Insight one'],
      data: {
        points: [{ text: 'Point', t: 75 }],
        decisions: [],
        actions: [{ task: 'Ship', owner: 'An', deadline: 'Fri', t: 3700, }],
      },
    })
    expect(md).toContain('- [1:15] Point')
    expect(md).toContain('- [ ] Ship — An · Fri [1:01:40]')
    expect(md).toContain('## Decisions\n- None')
    const html = renderMarkdown(md)
    expect(html).toContain('data-seek="75"')
    expect(html).toContain('data-seek="3700"')
    expect(html).toContain('type="checkbox"')
  })

  it('toggles checkboxes by line', () => {
    const md = 'x\n- [ ] a\n- [x] b'
    expect(toggleCheckbox(md, 1)).toBe('x\n- [x] a\n- [x] b')
    expect(toggleCheckbox(md, 2)).toBe('x\n- [ ] a\n- [ ] b')
    expect(toggleCheckbox(md, 9)).toBe(md)
  })
})

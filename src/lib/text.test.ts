import { describe, expect, it } from 'vitest'
import { chunkSegments, cleanMarkdown, cosine, formatTime, keywordScore, parseSections, parseSlides, renderMarkdown } from './text'

describe('text utils', () => {
  it('chunks segments by size', () => {
    const segs = [
      { start: 0, end: 1, text: 'a'.repeat(60) },
      { start: 1, end: 2, text: 'b'.repeat(60) },
      { start: 2, end: 3, text: ' ' },
    ]
    const c = chunkSegments(segs, 100)
    expect(c).toHaveLength(2)
    expect(c[1].start).toBe(1)
  })

  it('computes cosine', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })

  it('scores keywords incl. unicode', () => {
    expect(keywordScore('ngÃ¢n sÃ¡ch quÃ½', 'Há»p vá» ngÃ¢n sÃ¡ch quÃ½ 3')).toBe(1)
    expect(keywordScore('xyz', 'abc')).toBe(0)
  })

  it('formats time', () => {
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('parses slides', () => {
    const s = parseSlides('# Deck\n## Slide 1: Intro\n- one\n- two\n---\n## Next\n1. a\n```')
    expect(s.map((x) => x.title)).toEqual(['Deck', 'Intro', 'Next'])
    expect(s[1].bullets).toEqual(['one', 'two'])
    expect(s[2].bullets).toEqual(['a'])
  })

  it('parses sections and cleans markdown', () => {
    expect(parseSections('## Summary\nhi\n## Decisions\n- x')['decisions']).toBe('- x')
    expect(cleanMarkdown('```markdown\n# A\n```')).toBe('# A')
  })

  it('renders safe markdown', () => {
    expect(renderMarkdown('## T\n- **a** <b>')).toBe('<h2>T</h2><ul><li><strong>a</strong> &lt;b&gt;</li></ul>')
  })
})

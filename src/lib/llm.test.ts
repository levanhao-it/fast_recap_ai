import { describe, expect, it, vi } from 'vitest'
import { chat } from './llm'
import { useSettings } from './models'

const sse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        for (const t of chunks) c.enqueue(enc.encode(t))
        c.close()
      },
    }),
    { status: 200 },
  )

describe('cloud provider', () => {
  it('streams SSE deltas (even split mid-line) and sends JSON mode', async () => {
    useSettings.setState({ llmProvider: 'groq', cloudKey: 'k' })
    const fetchMock = vi.fn(async () =>
      sse(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n', 'data: {"choices":[{"delta":{"con', 'tent":"lo"}}]}\n\ndata: [DONE]\n']),
    )
    vi.stubGlobal('fetch', fetchMock)
    const tokens: string[] = []
    const out = await chat([{ role: 'user', content: 'hi JSON' }], { schema: { type: 'object' }, onToken: (t) => tokens.push(t) })
    expect(out).toBe('Hello')
    expect(tokens).toEqual(['Hel', 'lo'])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('api.groq.com')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body as string).response_format).toEqual({ type: 'json_object' })
  })

  it('requires an API key', async () => {
    useSettings.setState({ llmProvider: 'gemini', cloudKey: '' })
    await expect(chat([{ role: 'user', content: 'x' }])).rejects.toThrow('API key')
  })
})

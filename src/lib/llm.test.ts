import { describe, expect, it, vi } from 'vitest'
import { chat } from './llm'
import { call } from './ml'
import { useSettings } from './models'

vi.mock('./ml', () => ({
  call: vi.fn(() => ({ promise: Promise.resolve(' WASM response ') })),
}))

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

  it('uses WASM instead of initializing WebGPU when the adapter limit is too low', async () => {
    const requestAdapter = vi.fn().mockResolvedValue({
      limits: { maxComputeWorkgroupStorageSize: 16384 },
    })
    vi.stubGlobal('navigator', { gpu: { requestAdapter } })
    useSettings.setState({ llmProvider: 'local', uiLang: 'vi' })
    const onProgress = vi.fn()

    try {
      await expect(chat([{ role: 'user', content: 'Tóm tắt' }], { onProgress })).resolves.toBe('WASM response')
      expect(requestAdapter).toHaveBeenCalledOnce()
      expect(call).toHaveBeenCalledWith(
        'generate',
        expect.objectContaining({ model: expect.any(String) }),
        expect.any(Function),
      )
      expect(onProgress).toHaveBeenCalledWith({ status: expect.stringContaining('WASM') })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

import { pipeline, TextStreamer, env } from '@huggingface/transformers'
import { EMBED_MODEL } from '../lib/models'

env.allowLocalModels = false
env.useBrowserCache = true

const ctx = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent) => void) | null
}

const WINDOW_S = 30
const SR = 16000

type AnyPipe = (input: unknown, opts?: unknown) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
const cache = new Map<string, Promise<AnyPipe>>()
let cancelled = new Set<number>()

function load(task: string, model: string, webgpu: boolean, id: number, dtype?: unknown): Promise<AnyPipe> {
  const key = `${task}:${model}:${webgpu}`
  let p = cache.get(key)
  if (!p) {
    p = (pipeline as unknown as (...a: unknown[]) => Promise<AnyPipe>)(task, model, {
      device: webgpu ? 'webgpu' : 'wasm',
      dtype,
      progress_callback: (pr: { status: string; progress?: number; file?: string }) =>
        ctx.postMessage({ id, type: 'progress', status: pr.status, progress: pr.progress, file: pr.file }),
    })
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

function rms(a: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s / Math.max(1, a.length))
}

async function transcribe(id: number, d: { audio: Float32Array; model: string; language: string; webgpu: boolean }) {
  const dtype = d.webgpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8'
  const asr = await load('automatic-speech-recognition', d.model, d.webgpu, id, dtype)
  const segments: { start: number; end: number; text: string }[] = []
  const win = WINDOW_S * SR
  const total = Math.ceil(d.audio.length / win)
  for (let w = 0; w < total; w++) {
    if (cancelled.has(id)) throw new Error('cancelled')
    const chunk = d.audio.subarray(w * win, (w + 1) * win)
    const offset = w * WINDOW_S
    // Whisper hallucinates on silence, so skip near-silent windows
    if (rms(chunk) > 0.003) {
      const out = await asr(chunk, {
        return_timestamps: true,
        language: d.language === 'auto' ? undefined : d.language,
        task: 'transcribe',
      })
      const chunks = (out.chunks as { timestamp: [number, number | null]; text: string }[] | undefined) ?? [
        { timestamp: [0, WINDOW_S], text: out.text as string },
      ]
      for (const c of chunks) {
        const text = c.text.trim()
        if (!text) continue
        segments.push({ start: offset + (c.timestamp[0] ?? 0), end: offset + (c.timestamp[1] ?? c.timestamp[0] ?? WINDOW_S), text })
      }
    }
    ctx.postMessage({ id, type: 'partial', progress: (w + 1) / total, segments: segments.slice() })
  }
  return segments
}

async function embed(id: number, d: { texts: string[]; webgpu: boolean }) {
  const ex = await load('feature-extraction', EMBED_MODEL, false, id, 'q8')
  const out: number[][] = []
  for (let i = 0; i < d.texts.length; i += 8) {
    const t = await ex(d.texts.slice(i, i + 8), { pooling: 'mean', normalize: true })
    out.push(...(t.tolist() as number[][]))
  }
  return out
}

async function generate(
  id: number,
  d: { model: string; messages: { role: string; content: string }[]; maxTokens: number; temperature: number },
) {
  const gen = await load('text-generation', d.model, false, id, 'q4')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tok = (gen as any).tokenizer
  const streamer = new TextStreamer(tok, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t: string) => ctx.postMessage({ id, type: 'token', token: t }),
  })
  const out = await gen(d.messages, {
    max_new_tokens: d.maxTokens,
    temperature: d.temperature,
    do_sample: d.temperature > 0,
    streamer,
  })
  const msgs = out[0].generated_text as { role: string; content: string }[]
  return msgs[msgs.length - 1].content as string
}

ctx.onmessage = async (e: MessageEvent) => {
  const { id, type, data } = e.data as { id: number; type: string; data: never }
  try {
    if (type === 'cancel') {
      cancelled.add(id)
      return
    }
    let result: unknown
    if (type === 'transcribe') result = await transcribe(id, data)
    else if (type === 'embed') result = await embed(id, data)
    else if (type === 'generate') result = await generate(id, data)
    ctx.postMessage({ id, type: 'done', result })
  } catch (err) {
    ctx.postMessage({ id, type: 'error', error: err instanceof Error ? err.message : String(err) })
  } finally {
    cancelled = new Set([...cancelled].filter((c) => c !== id))
  }
}

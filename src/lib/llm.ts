import type { MLCEngineInterface } from '@mlc-ai/web-llm'
import { call, type Progress } from './ml'
import { CLOUD, WASM_LLM, hasWebGPU, useSettings } from './models'

export interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOpts {
  maxTokens?: number
  temperature?: number
  /** JSON schema: forces valid JSON output (WebLLM grammar / cloud JSON mode). */
  schema?: object
  onToken?: (t: string) => void
  onProgress?: (p: Progress) => void
}

let engine: MLCEngineInterface | null = null
let engineModel = ''
let loading: Promise<MLCEngineInterface> | null = null
let webgpuDisabled = false
let webgpuStorageSupported: Promise<boolean> | null = null
const REQUIRED_WORKGROUP_STORAGE_SIZE = 32768

async function getEngine(model: string, onProgress?: (p: Progress) => void) {
  if (engine && engineModel === model) return engine
  if (loading && engineModel === model) return loading
  engineModel = model
  loading = (async () => {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
    const w = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' })
    try {
      const e = await CreateWebWorkerMLCEngine(w, model, {
        initProgressCallback: (r) => onProgress?.({ status: r.text, progress: r.progress * 100 }),
      })
      engine = e
      return e
    } catch (error) {
      w.terminate()
      throw error
    }
  })()
  loading.catch(() => {
    loading = null
    engineModel = ''
  })
  return loading
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isWorkgroupStorageLimitError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : String(error)
  return /maxComputeWorkgroupStorageSize/i.test(message)
}

async function canRunWebGPU(): Promise<boolean> {
  if (webgpuDisabled || !hasWebGPU()) return false
  if (!webgpuStorageSupported) {
    webgpuStorageSupported = navigator.gpu
      .requestAdapter()
      .then((adapter) => {
        const supported = (adapter?.limits.maxComputeWorkgroupStorageSize ?? 0) >= REQUIRED_WORKGROUP_STORAGE_SIZE
        if (!supported) webgpuDisabled = true
        return supported
      })
      .catch((error: unknown) => {
        webgpuStorageSupported = null
        throw error
      })
  }
  return webgpuStorageSupported
}

function wasmChat(messages: Msg[], maxTokens: number, temperature: number, opts: ChatOpts): Promise<string> {
  const job = call<string>('generate', { model: WASM_LLM, messages, maxTokens, temperature }, (m) => {
    if (m.type === 'token') opts.onToken?.(m.token as string)
    else if (m.type === 'progress') opts.onProgress?.({ status: m.status as string, progress: m.progress as number, file: m.file as string })
  })
  return job.promise.then((result) => result.trim())
}

function workgroupFallbackStatus(): string {
  return useSettings.getState().uiLang === 'vi'
    ? 'GPU không đủ bộ nhớ xử lý cho WebGPU; đang chuyển sang WASM (chậm hơn).'
    : 'GPU does not provide enough workgroup storage for WebGPU; falling back to WASM (slower).'
}

function disableWebGPU(): void {
  webgpuDisabled = true
  engine = null
  engineModel = ''
  loading = null
}

/** OpenAI-compatible streaming call (Groq / Gemini free tiers). Opt-in: sends text to the provider. */
async function cloudChat(provider: 'groq' | 'gemini', messages: Msg[], opts: ChatOpts): Promise<string> {
  const { cloudKey } = useSettings.getState()
  if (!cloudKey) throw new Error('Missing API key (Settings)')
  const cfg = CLOUD[provider]
  const body = JSON.stringify({
    model: cfg.model,
    messages,
    max_tokens: opts.maxTokens ?? 700,
    temperature: opts.temperature ?? 0.3,
    stream: true,
    ...(opts.schema ? { response_format: { type: 'json_object' } } : {}),
  })

  let res: Response | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudKey}` },
      body,
    })
    if (res.status !== 429) break
    // Free tiers are rate limited: wait and retry
    const wait = Math.min(20, Number(res.headers.get('retry-after')) || 5 * (attempt + 1))
    opts.onProgress?.({ status: `Rate limited, retrying in ${wait}s` })
    await sleep(wait * 1000)
  }
  if (!res || !res.ok || !res.body) throw new Error(`${provider} ${res?.status}: ${(await res?.text().catch(() => ''))?.slice(0, 200)}`)

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const l of lines) {
      const m = l.match(/^data:\s*(.*)$/)
      if (!m || m[1] === '[DONE]') continue
      try {
        const t = JSON.parse(m[1]).choices?.[0]?.delta?.content ?? ''
        if (t) {
          out += t
          opts.onToken?.(t)
        }
      } catch {
        /* partial SSE line */
      }
    }
  }
  return out.trim()
}

/** Runs a chat completion: on-device by default (WebLLM on WebGPU, Transformers.js WASM otherwise). */
export async function chat(messages: Msg[], opts: ChatOpts = {}): Promise<string> {
  const { maxTokens = 700, temperature = 0.3, schema } = opts
  const { llmProvider } = useSettings.getState()
  if (llmProvider !== 'local') return cloudChat(llmProvider, messages, opts)

  if (await canRunWebGPU()) {
    try {
      const e = await getEngine(useSettings.getState().llmModel, opts.onProgress)
      const stream = await e.chat.completions.create({
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        ...(schema ? { response_format: { type: 'json_object' as const, schema: JSON.stringify(schema) } } : {}),
      })
      let out = ''
      for await (const part of stream) {
        const t = part.choices[0]?.delta?.content ?? ''
        if (t) {
          out += t
          opts.onToken?.(t)
        }
      }
      return out.trim()
    } catch (error) {
      if (!isWorkgroupStorageLimitError(error)) throw error
      disableWebGPU()
      opts.onProgress?.({ status: workgroupFallbackStatus() })
      return wasmChat(messages, maxTokens, temperature, opts)
    }
  }
  if (webgpuDisabled) opts.onProgress?.({ status: workgroupFallbackStatus() })
  return wasmChat(messages, maxTokens, temperature, opts)
}

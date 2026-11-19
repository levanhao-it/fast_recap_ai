import type { Segment } from './types'
import { hasWebGPU } from './models'

export interface Progress {
  status: string
  progress?: number
  file?: string
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<
  number,
  { resolve: (v: never) => void; reject: (e: Error) => void; onEvent?: (m: Record<string, unknown>) => void }
>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/ml.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; type: string; result?: never; error?: string }
      const p = pending.get(m.id)
      if (!p) return
      if (m.type === 'done') {
        pending.delete(m.id)
        p.resolve(m.result as never)
      } else if (m.type === 'error') {
        pending.delete(m.id)
        p.reject(new Error(m.error))
      } else p.onEvent?.(m as unknown as Record<string, unknown>)
    }
  }
  return worker
}

export function call<T>(type: string, data: unknown, onEvent?: (m: Record<string, unknown>) => void, transfer: Transferable[] = []) {
  const id = ++seq
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: never) => void, reject, onEvent })
  })
  getWorker().postMessage({ id, type, data }, transfer)
  return { id, promise, cancel: () => getWorker().postMessage({ id, type: 'cancel' }) }
}

/** Decode any browser-supported audio blob into 16kHz mono Float32 for Whisper. */
export async function decodeAudio(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  try {
    const decoded = await ctx.decodeAudioData(buf)
    const length = Math.ceil(decoded.duration * 16000)
    const off = new OfflineAudioContext(1, length, 16000)
    const src = off.createBufferSource()
    src.buffer = decoded
    src.connect(off.destination)
    src.start()
    const rendered = await off.startRendering()
    return rendered.getChannelData(0)
  } finally {
    void ctx.close()
  }
}

export function transcribeAudio(
  audio: Float32Array,
  opts: { model: string; language: string },
  onUpdate: (p: { progress: number; segments: Segment[]; download?: Progress }) => void,
) {
  const job = call<Segment[]>(
    'transcribe',
    { audio, model: opts.model, language: opts.language, webgpu: hasWebGPU() },
    (m) => {
      if (m.type === 'partial') onUpdate({ progress: m.progress as number, segments: m.segments as Segment[] })
      else if (m.type === 'progress')
        onUpdate({ progress: 0, segments: [], download: { status: m.status as string, progress: m.progress as number, file: m.file as string } })
    },
  )
  return job
}

export function embedTexts(texts: string[]): Promise<number[][]> {
  return call<number[][]>('embed', { texts }).promise
}

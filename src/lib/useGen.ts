import { useRef, useState } from 'react'

export interface GenState {
  busy: boolean
  text: string
  step: string
  error: string
  progress?: { status: string; progress?: number; file?: string }
}

/** Runs an LLM job with streaming text, progress and error state. */
export function useGen() {
  const [st, setSt] = useState<GenState>({ busy: false, text: '', step: '', error: '' })
  const running = useRef(false)

  const run = async <T,>(
    fn: (cb: {
      onToken: (t: string) => void
      onStep: (s: string) => void
      onProgress: (p: NonNullable<GenState['progress']>) => void
    }) => Promise<T>,
  ): Promise<T | undefined> => {
    if (running.current) return
    running.current = true
    setSt({ busy: true, text: '', step: '', error: '' })
    try {
      const out = await fn({
        onToken: (t) => setSt((s) => ({ ...s, text: s.text + t })),
        onStep: (step) => setSt((s) => ({ ...s, step, text: '' })),
        onProgress: (progress) => setSt((s) => ({ ...s, progress })),
      })
      setSt({ busy: false, text: '', step: '', error: '' })
      return out
    } catch (e) {
      setSt({ busy: false, text: '', step: '', error: e instanceof Error ? e.message : String(e) })
    } finally {
      running.current = false
    }
  }
  return { st, run }
}

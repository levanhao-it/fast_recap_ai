import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRecording, db } from '../lib/db'
import { transcribeRecording } from '../lib/jobs'
import { useT } from '../lib/i18n'
import { formatTime } from '../lib/text'

function pickMime(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m))
}

export default function Record() {
  const t = useT()
  const nav = useNavigate()
  const [state, setState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const [secs, setSecs] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const refs = useRef<{
    rec?: MediaRecorder
    chunks: Blob[]
    stream?: MediaStream
    timer?: number
    raf?: number
    wake?: WakeLockSentinel
    ctx?: AudioContext
    elapsed: number
    startedAt: number
  }>({ chunks: [], elapsed: 0, startedAt: 0 })

  const cleanup = () => {
    const r = refs.current
    clearInterval(r.timer)
    if (r.raf) cancelAnimationFrame(r.raf)
    r.stream?.getTracks().forEach((tr) => tr.stop())
    void r.ctx?.close()
    void r.wake?.release().catch(() => undefined)
    setLevel(0)
  }

  const start = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const r = refs.current
      r.stream = stream
      r.chunks = []
      r.elapsed = 0
      r.startedAt = Date.now()
      const mime = pickMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      rec.ondataavailable = (e) => e.data.size && r.chunks.push(e.data)
      rec.start(1000)
      r.rec = rec

      const ctx = new AudioContext()
      r.ctx = ctx
      const an = ctx.createAnalyser()
      an.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      const loop = () => {
        an.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(peak / 128)
        r.raf = requestAnimationFrame(loop)
      }
      loop()

      r.timer = window.setInterval(() => {
        if (rec.state === 'recording') setSecs(Math.floor((r.elapsed + Date.now() - r.startedAt) / 1000))
      }, 500)
      try {
        r.wake = await navigator.wakeLock?.request('screen')
      } catch {
        /* wake lock is best-effort */
      }
      setSecs(0)
      setState('recording')
    } catch {
      setError(t('micDenied'))
    }
  }

  const pause = () => {
    const r = refs.current
    r.rec?.pause()
    r.elapsed += Date.now() - r.startedAt
    setState('paused')
  }
  const resume = () => {
    const r = refs.current
    r.rec?.resume()
    r.startedAt = Date.now()
    setState('recording')
  }

  const stop = () => {
    const r = refs.current
    const rec = r.rec
    if (!rec) return
    rec.onstop = async () => {
      cleanup()
      const blob = new Blob(r.chunks, { type: rec.mimeType || 'audio/webm' })
      const row = await createRecording({ duration: secs })
      await db.audio.put({ id: row.id, blob })
      void transcribeRecording(row.id)
      nav(`/n/${row.id}`, { replace: true })
    }
    rec.stop()
    setState('idle')
  }

  const bars = 24
  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <div className="font-mono text-5xl tabular-nums">{formatTime(secs)}</div>
      <div className="flex h-16 items-end gap-1" aria-hidden>
        {Array.from({ length: bars }, (_, i) => {
          const h = state === 'recording' ? Math.max(6, level * 64 * (0.5 + Math.abs(Math.sin(i * 1.7 + secs)) * 0.5)) : 6
          return <div key={i} className="w-1.5 rounded bg-indigo-500" style={{ height: h }} />
        })}
      </div>
      {state === 'idle' ? (
        <button className="grid h-24 w-24 place-items-center rounded-full bg-red-600 text-white shadow-lg active:scale-95" onClick={start} aria-label={t('start')}>
          â—
        </button>
      ) : (
        <div className="flex gap-3">
          {state === 'recording' ? (
            <button className="btn-ghost" onClick={pause}>
              â¸ {t('pause')}
            </button>
          ) : (
            <button className="btn-ghost" onClick={resume}>
              â–¶ {t('resume')}
            </button>
          )}
          <button className="btn bg-red-600" onClick={stop}>
            â–  {t('stop')}
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500">{t('wakeHint')}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

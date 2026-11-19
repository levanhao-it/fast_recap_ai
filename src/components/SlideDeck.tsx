import { useEffect, useState } from 'react'
import { parseSlides } from '../lib/text'

export default function SlideDeck({ markdown }: { markdown: string }) {
  const slides = parseSlides(markdown)
  const [i, setI] = useState(0)
  const [full, setFull] = useState(false)
  const n = slides.length
  const idx = Math.min(i, Math.max(0, n - 1))

  useEffect(() => {
    if (!full) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setI((v) => Math.min(n - 1, v + 1))
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
      else if (e.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [full, n])

  if (!n) return null
  const s = slides[idx]
  const first = idx === 0

  const view = (
    <div
      className={`flex aspect-video w-full flex-col justify-center rounded-xl p-6 sm:p-10 ${first ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900'} ${full ? 'h-full max-h-screen' : 'border border-slate-200'}`}
      onClick={() => full && setI((v) => Math.min(n - 1, v + 1))}
    >
      <h2 className={`font-bold ${first ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'}`}>{s.title}</h2>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-base sm:text-2xl">
        {s.bullets.map((b, k) => (
          <li key={k}>{b}</li>
        ))}
      </ul>
    </div>
  )

  const nav = (
    <div className="mt-2 flex items-center justify-between gap-2 print:hidden">
      <button className="btn-ghost" disabled={idx === 0} onClick={() => setI(idx - 1)}>
        ‹
      </button>
      <span className="text-sm">
        {idx + 1} / {n}
      </span>
      <button className="btn-ghost" disabled={idx >= n - 1} onClick={() => setI(idx + 1)}>
        ›
      </button>
      <button className="btn-ghost" onClick={() => setFull((f) => !f)}>
        ⛶
      </button>
    </div>
  )

  if (full)
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-2">
        {view}
        <div className="w-full max-w-md text-white">{nav}</div>
      </div>
    )

  return (
    <div>
      {view}
      {nav}
      <div className="print-area hidden print:block">
        {slides.map((sl, k) => (
          <section key={k} className="break-after-page p-8">
            <h2 className="text-3xl font-bold">{sl.title}</h2>
            <ul className="mt-4 list-disc pl-6 text-xl">
              {sl.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

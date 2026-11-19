import type { Progress } from '../lib/ml'

export default function ProgressBar({ label, value, p }: { label?: string; value?: number; p?: Progress }) {
  const v = p?.progress ?? value
  const text = [label, p?.file?.split('/').pop() ?? p?.status].filter(Boolean).join(' · ')
  return (
    <div className="my-2 text-xs text-slate-600 dark:text-slate-300">
      <div className="mb-1 truncate">{text}</div>
      <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full bg-indigo-600 transition-all ${v === undefined ? 'w-1/3 animate-pulse' : ''}`}
          style={v === undefined ? undefined : { width: `${Math.max(2, Math.min(100, v <= 1 && !p ? v * 100 : v))}%` }}
        />
      </div>
    </div>
  )
}

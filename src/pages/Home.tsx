import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { createRecording, db } from '../lib/db'
import { transcribeRecording } from '../lib/jobs'
import { useT } from '../lib/i18n'
import { searchRecordings } from '../lib/search'
import { formatTime } from '../lib/text'

export default function Home() {
  const t = useT()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [folder, setFolder] = useState('')
  const [tag, setTag] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const all = useLiveQuery(() => db.recordings.orderBy('createdAt').reverse().filter((r) => !r.deleted).toArray(), [])

  const folders = useMemo(() => [...new Set((all ?? []).map((r) => r.folder).filter(Boolean))], [all])
  const tags = useMemo(() => [...new Set((all ?? []).flatMap((r) => r.tags))], [all])
  const list = useMemo(
    () => searchRecordings((all ?? []).filter((r) => (!folder || r.folder === folder) && (!tag || r.tags.includes(tag))), q),
    [all, q, folder, tag],
  )

  const onImport = async (f?: File) => {
    if (!f) return
    const rec = await createRecording({ title: f.name.replace(/\.[^.]+$/, '') })
    await db.audio.put({ id: rec.id, blob: f })
    void transcribeRecording(rec.id, false)
    nav(`/n/${rec.id}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input" type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost shrink-0" onClick={() => file.current?.click()}>
          â¬†
        </button>
        <input ref={file} type="file" accept="audio/*,video/*" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
      </div>
      {(folders.length > 0 || tags.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {folders.map((f) => (
            <button key={f} className={`rounded-full border px-3 py-1 ${folder === f ? 'bg-indigo-600 text-white' : ''}`} onClick={() => setFolder(folder === f ? '' : f)}>
              ðŸ“ {f}
            </button>
          ))}
          {tags.map((x) => (
            <button key={x} className={`rounded-full border px-3 py-1 ${tag === x ? 'bg-indigo-600 text-white' : ''}`} onClick={() => setTag(tag === x ? '' : x)}>
              #{x}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="py-10 text-center text-slate-500">{t('empty')}</p>}
      {list.map((r) => (
        <Link key={r.id} to={`/n/${r.id}`} className="card block">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-medium">{r.title}</h3>
            <span className="shrink-0 text-xs text-slate-500">{r.duration ? formatTime(r.duration) : ''}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
            {r.status === 'transcribing' ? 'â³ â€¦' : r.summary.replace(/^#+\s.*$/gm, '').replace(/\[(?:\d+:)?\d{1,2}:\d{2}\]|\[[ xX]\]|[-*]\s/g, '').trim() || r.segments[0]?.text || ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            {r.folder && <span>ðŸ“ {r.folder}</span>}
            {r.tags.map((x) => (
              <span key={x}>#{x}</span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  )
}

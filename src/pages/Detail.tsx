import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import MindMap from '../components/MindMap'
import ProgressBar from '../components/ProgressBar'
import SlideDeck from '../components/SlideDeck'
import { db, deleteRecording, updateRecording } from '../lib/db'
import { exportMarkdown, exportPptx } from '../lib/export'
import { useT } from '../lib/i18n'
import { transcribeRecording, useJobs } from '../lib/jobs'
import { ask, makeMindmap, makeSlides, summarize } from '../lib/pipeline'
import { createShare } from '../lib/sync'
import { formatTime, renderMarkdown } from '../lib/text'
import { toggleCheckbox } from '../lib/summary'
import type { Recording } from '../lib/types'
import { useGen, type GenState } from '../lib/useGen'

type Tab = 'transcript' | 'summary' | 'qa' | 'slides' | 'mindmap'

function GenStatus({ st }: { st: GenState }) {
  const t = useT()
  if (!st.busy && !st.error) return null
  return (
    <div>
      {st.busy && <ProgressBar label={`${t('loading')} ${st.step}`} p={st.progress} />}
      {st.text && <pre className="whitespace-pre-wrap text-sm">{st.text}</pre>}
      {st.error && <p className="text-sm text-red-600">{st.error}</p>}
    </div>
  )
}

export default function Detail() {
  const { id = '' } = useParams()
  const t = useT()
  const nav = useNavigate()
  const rec = useLiveQuery(() => db.recordings.get(id), [id])
  const job = useJobs((s) => s.jobs[id])
  const [tab, setTab] = useState<Tab>('transcript')
  const [audioUrl, setAudioUrl] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const gen = useGen()

  useEffect(() => {
    let url = ''
    void db.audio.get(id).then((a) => {
      if (a) setAudioUrl((url = URL.createObjectURL(a.blob)))
    })
    return () => URL.revokeObjectURL(url)
  }, [id])

  if (rec === undefined) return <p>{t('loading')}</p>
  if (!rec || rec.deleted) return <button className="btn" onClick={() => nav('/')}>{t('back')}</button>

  const seek = (s: number) => {
    if (audio.current) {
      audio.current.currentTime = s
      void audio.current.play()
    }
  }
  const hasText = rec.segments.length > 0
  const patch = (p: Partial<Recording>) => void updateRecording(rec.id, p)

  const tabs: [Tab, string][] = [
    ['transcript', t('transcript')],
    ['summary', t('summary')],
    ['qa', t('qa')],
    ['slides', t('slides')],
    ['mindmap', t('mindmap')],
  ]

  const share = async () => {
    try {
      const url = await createShare(rec.id)
      await navigator.clipboard?.writeText(url)
      alert(`${t('copyLink')}\n${url}`)
    } catch {
      alert(t('needSync'))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => nav('/')} aria-label={t('back')}>
          â€¹
        </button>
        <input className="input font-medium" aria-label={t('titleLabel')} defaultValue={rec.title} key={rec.title} onBlur={(e) => e.target.value !== rec.title && patch({ title: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder={t('folder')} defaultValue={rec.folder} onBlur={(e) => patch({ folder: e.target.value.trim() })} />
        <input
          className="input"
          placeholder={t('tags')}
          defaultValue={rec.tags.join(', ')}
          onBlur={(e) => patch({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
        />
      </div>
      {audioUrl && <audio ref={audio} src={audioUrl} controls className="w-full" />}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap px-3 py-2 text-sm ${tab === k ? 'border-b-2 border-indigo-600 font-semibold' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'transcript' && (
        <section className="space-y-2">
          {job && (
            <>
              <ProgressBar label={job.label} value={job.label === 'transcribe' ? job.progress : undefined} p={job.label === 'download' ? job.download : undefined} />
              <button className="btn-ghost" onClick={() => job.cancel?.()}>
                {t('cancel')}
              </button>
            </>
          )}
          {!job && audioUrl && (rec.status !== 'transcribed' || !hasText) && (
            <button className="btn" onClick={() => void transcribeRecording(rec.id)}>
              {t('transcribe')}
            </button>
          )}
          {rec.status === 'error' && <p className="text-sm text-red-600">{t('errorGeneric')}</p>}
          {!hasText && !job && <p className="text-slate-500">{t('noTranscript')}</p>}
          {rec.segments.map((s, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <button className="shrink-0 font-mono text-xs text-indigo-600" onClick={() => seek(s.start)}>
                {formatTime(s.start)}
              </button>
              <p
                contentEditable
                suppressContentEditableWarning
                className="flex-1 outline-none"
                onBlur={(e) => {
                  const text = e.currentTarget.textContent ?? ''
                  if (text !== s.text) patch({ segments: rec.segments.map((x, j) => (j === i ? { ...x, text } : x)) })
                }}
              >
                {s.text}
              </p>
            </div>
          ))}
        </section>
      )}

      {tab === 'summary' && (
        <>
          <label className="flex items-center gap-2 text-sm">
            {t('template')}
            <select className="input w-auto" value={rec.template ?? 'meeting'} onChange={(e) => patch({ template: e.target.value as Recording['template'] })}>
              <option value="meeting">{t('tplMeeting')}</option>
              <option value="lecture">{t('tplLecture')}</option>
              <option value="interview">{t('tplInterview')}</option>
              <option value="memo">{t('tplMemo')}</option>
            </select>
          </label>
          <Generated rec={rec} field="summary" gen={gen} disabled={!hasText} make={(cb) => summarize(rec, cb)} render={(md) => <SummaryView rec={rec} md={md} seek={seek} />} />
        </>
      )}

      {tab === 'slides' && (
        <>
          <Generated rec={rec} field="slides" gen={gen} disabled={!hasText} make={(cb) => makeSlides(rec, cb)} render={(md) => <SlideDeck markdown={md} />} />
          {rec.slides && (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => void exportPptx(rec)}>
                {t('exportPptx')}
              </button>
              <button className="btn-ghost" onClick={() => window.print()}>
                {t('exportPdf')}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'mindmap' && (
        <Generated rec={rec} field="mindmap" gen={gen} disabled={!hasText} make={(cb) => makeMindmap(rec, cb)} render={(md) => <MindMap markdown={md} name={rec.title} />} />
      )}

      {tab === 'qa' && <QA rec={rec} disabled={!hasText} seek={seek} />}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <button className="btn-ghost" onClick={() => exportMarkdown(rec)}>
          {t('exportMd')}
        </button>
        <button className="btn-ghost" onClick={() => void share()}>
          {t('share')}
        </button>
        <button
          className="btn-ghost text-red-600"
          onClick={async () => {
            if (confirm(t('confirmDelete'))) {
              await deleteRecording(rec.id)
              nav('/')
            }
          }}
        >
          {t('delete')}
        </button>
      </div>
    </div>
  )
}

function SummaryView({ rec, md, seek }: { rec: Recording; md: string; seek: (s: number) => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(md)
  const [copied, setCopied] = useState(false)

  if (editing)
    return (
      <div className="space-y-2">
        <textarea className="input h-80 font-mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={async () => {
              await updateRecording(rec.id, { summary: draft })
              setEditing(false)
            }}
          >
            {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)}>
            {t('cancel')}
          </button>
        </div>
      </div>
    )

  return (
    <div>
      <div
        className="prose-md text-sm"
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest('a[data-seek]')
          if (a) {
            e.preventDefault()
            seek(Number(a.getAttribute('data-seek')))
          }
        }}
        onChange={(e) => {
          const line = (e.target as HTMLInputElement).dataset.line
          if (line !== undefined) void updateRecording(rec.id, { summary: toggleCheckbox(md, Number(line)) })
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
      />
      <div className="mt-3 flex gap-2">
        <button
          className="btn-ghost"
          onClick={() => {
            setDraft(md)
            setEditing(true)
          }}
        >
          {t('edit')}
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            await navigator.clipboard?.writeText(md)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
    </div>
  )
}

function Generated({
  rec,
  field,
  gen,
  disabled,
  make,
  render,
}: {
  rec: Recording
  field: 'summary' | 'slides' | 'mindmap'
  gen: ReturnType<typeof useGen>
  disabled: boolean
  make: (cb: Parameters<Parameters<ReturnType<typeof useGen>['run']>[0]>[0]) => Promise<string>
  render: (md: string) => React.ReactNode
}) {
  const t = useT()
  const value = rec[field]
  const { st, run } = gen
  return (
    <section className="space-y-3">
      <button
        className="btn"
        disabled={disabled || st.busy}
        onClick={() =>
          void run(async (cb) => {
            const out = await make(cb)
            await updateRecording(rec.id, { [field]: out })
          })
        }
      >
        {value ? t('regenerate') : t('generate')}
      </button>
      <GenStatus st={st} />
      {value && !st.busy && render(value)}
    </section>
  )
}

function QA({ rec, disabled, seek }: { rec: Recording; disabled: boolean; seek: (s: number) => void }) {
  const t = useT()
  const msgs = useLiveQuery(() => db.chats.where('recordingId').equals(rec.id).toArray(), [rec.id]) ?? []
  const [q, setQ] = useState('')
  const [sources, setSources] = useState<number[]>([])
  const { st, run } = useGen()
  const history = msgs.map((m) => ({ role: m.role, content: m.content }))

  const send = () => {
    const question = q.trim()
    if (!question || st.busy) return
    setQ('')
    void run(async (cb) => {
      await db.chats.add({ recordingId: rec.id, role: 'user', content: question, createdAt: Date.now() })
      const { answer, sources } = await ask(rec, question, history, cb)
      await db.chats.add({ recordingId: rec.id, role: 'assistant', content: answer, createdAt: Date.now() })
      setSources(sources)
    })
  }

  return (
    <section className="space-y-3">
      {msgs.map((m) => (
        <div key={m.id} className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'card'}`}>
          {m.content}
        </div>
      ))}
      <GenStatus st={st} />
      {sources.length > 0 && !st.busy && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {t('sources')}:
          {sources.map((s) => (
            <button key={s} className="rounded bg-slate-200 px-2 py-1 dark:bg-slate-700" onClick={() => seek(s)}>
              {formatTime(s)}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input className="input" placeholder={t('askPlaceholder')} value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn" disabled={disabled || st.busy} onClick={send}>
          {t('send')}
        </button>
      </div>
    </section>
  )
}

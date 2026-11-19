import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import MindMap from '../components/MindMap'
import SlideDeck from '../components/SlideDeck'
import { useT } from '../lib/i18n'
import { fetchShared, type Shared } from '../lib/sync'
import { formatTime, renderMarkdown } from '../lib/text'

export default function SharedNote() {
  const { token = '' } = useParams()
  const t = useT()
  const [data, setData] = useState<Shared | null | undefined>()
  const [error, setError] = useState('')

  useEffect(() => {
    fetchShared(token).then(setData).catch((e: Error) => {
      setError(e.message)
      setData(null)
    })
  }, [token])

  if (data === undefined) return <p>{t('loading')}</p>
  if (!data) return <p className="text-red-600">{error || t('errorGeneric')}</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t('sharedBy')}</p>
      <h1 className="text-xl font-bold">{data.title}</h1>
      {data.summary && (
        <div
          className="prose-md text-sm"
          onClick={(e) => (e.target as HTMLElement).closest('a[data-seek]') && e.preventDefault()}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(data.summary) }}
        />
      )}
      {data.slides && <SlideDeck markdown={data.slides} />}
      {data.mindmap && <MindMap markdown={data.mindmap} name={data.title} />}
      <h2 className="font-semibold">{t('transcript')}</h2>
      {data.segments.map((s, i) => (
        <p key={i} className="text-sm">
          <span className="mr-2 font-mono text-xs text-indigo-600">{formatTime(s.start)}</span>
          {s.text}
        </p>
      ))}
    </div>
  )
}

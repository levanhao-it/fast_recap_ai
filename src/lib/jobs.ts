import { create } from 'zustand'
import { db, updateRecording } from './db'
import { decodeAudio, transcribeAudio, type Progress } from './ml'
import { useSettings } from './models'
import { indexRecording, suggestTitle, summarize } from './pipeline'

interface Job {
  label: string
  progress: number
  download?: Progress
  cancel?: () => void
}

export const useJobs = create<{ jobs: Record<string, Job | undefined>; patch: (id: string, j?: Job) => void }>((set) => ({
  jobs: {},
  patch: (id, j) => set((s) => ({ jobs: { ...s.jobs, [id]: j } })),
}))

/** Transcribes the stored audio of a recording; keeps running if the user leaves the page. */
export async function transcribeRecording(id: string, autoTitle = true): Promise<void> {
  const { patch } = useJobs.getState()
  const { sttModel, audioLang } = useSettings.getState()
  try {
    const row = await db.audio.get(id)
    if (!row) throw new Error('Audio not found')
    await updateRecording(id, { status: 'transcribing', language: audioLang })
    patch(id, { label: 'decode', progress: 0 })
    const audio = await decodeAudio(row.blob)
    await updateRecording(id, { duration: audio.length / 16000 })

    const job = transcribeAudio(audio, { model: sttModel, language: audioLang }, (p) => {
      if (p.download) patch(id, { ...useJobs.getState().jobs[id]!, label: 'download', download: p.download, cancel: job.cancel })
      else {
        patch(id, { label: 'transcribe', progress: p.progress, cancel: job.cancel })
        void db.recordings.update(id, { segments: p.segments })
      }
    })
    patch(id, { label: 'download', progress: 0, cancel: job.cancel })
    const segments = await job.promise
    await updateRecording(id, { segments, status: 'transcribed' })
    const rec = (await db.recordings.get(id))!
    if (autoTitle && segments.length) {
      try {
        const title = await suggestTitle(rec)
        if (title) await updateRecording(id, { title })
      } catch {
        /* title is optional */
      }
    }
    await indexRecording(rec)
    if (useSettings.getState().autoSummary && segments.length) {
      try {
        patch(id, { label: 'summarize', progress: 0 })
        const fresh = (await db.recordings.get(id))!
        await updateRecording(id, { summary: await summarize(fresh) })
      } catch (e) {
        console.error(e)
      }
    }
  } catch (e) {
    const cancelled = e instanceof Error && e.message === 'cancelled'
    await updateRecording(id, { status: cancelled ? 'recorded' : 'error' })
    if (!cancelled) console.error(e)
  } finally {
    patch(id, undefined)
  }
}

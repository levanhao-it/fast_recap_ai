import Dexie, { type Table } from 'dexie'
import type { AudioBlob, ChatMessage, Chunk, Recording } from './types'

class RecapDB extends Dexie {
  recordings!: Table<Recording, string>
  audio!: Table<AudioBlob, string>
  chats!: Table<ChatMessage, number>
  chunks!: Table<Chunk, number>

  constructor() {
    super('fast_recap_ai')
    this.version(1).stores({
      recordings: 'id, createdAt, updatedAt, folder, *tags',
      audio: 'id',
      chats: '++id, recordingId',
      chunks: '++id, recordingId',
    })
  }
}

export const db = new RecapDB()

export async function createRecording(partial: Partial<Recording> = {}): Promise<Recording> {
  const now = Date.now()
  const rec: Recording = {
    id: crypto.randomUUID(),
    title: new Date(now).toLocaleString(),
    createdAt: now,
    updatedAt: now,
    duration: 0,
    language: 'auto',
    folder: '',
    tags: [],
    status: 'recorded',
    segments: [],
    summary: '',
    slides: '',
    mindmap: '',
    ...partial,
  }
  await db.recordings.add(rec)
  return rec
}

export async function updateRecording(id: string, patch: Partial<Recording>) {
  await db.recordings.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteRecording(id: string) {
  await db.transaction('rw', db.recordings, db.audio, db.chats, db.chunks, async () => {
    // Tombstone keeps deletion syncable
    await db.recordings.update(id, { deleted: true, updatedAt: Date.now(), segments: [], summary: '', slides: '', mindmap: '' })
    await db.audio.delete(id)
    await db.chats.where('recordingId').equals(id).delete()
    await db.chunks.where('recordingId').equals(id).delete()
  })
}

export function transcriptText(rec: Pick<Recording, 'segments'>): string {
  return rec.segments.map((s) => s.text.trim()).join(' ')
}

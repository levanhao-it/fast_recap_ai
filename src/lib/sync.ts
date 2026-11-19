import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db } from './db'
import { useSettings } from './models'
import type { Recording } from './types'

let client: SupabaseClient | null = null
let clientKey = ''

export function supabase(): SupabaseClient | null {
  const { supabaseUrl, supabaseKey } = useSettings.getState()
  if (!supabaseUrl || !supabaseKey) return null
  const k = supabaseUrl + supabaseKey
  if (!client || clientKey !== k) {
    client = createClient(supabaseUrl, supabaseKey)
    clientKey = k
  }
  return client
}

interface Row {
  id: string
  user_id: string
  title: string
  created_at: number
  updated_at: number
  duration: number
  language: string
  folder: string
  tags: string[]
  segments: Recording['segments']
  summary: string
  slides: string
  mindmap: string
  deleted: boolean
}

const toRow = (r: Recording, userId: string): Row => ({
  id: r.id,
  user_id: userId,
  title: r.title,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
  duration: r.duration,
  language: r.language,
  folder: r.folder,
  tags: r.tags,
  segments: r.segments,
  summary: r.summary,
  slides: r.slides,
  mindmap: r.mindmap,
  deleted: !!r.deleted,
})

const fromRow = (r: Row): Recording => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  duration: r.duration,
  language: r.language,
  folder: r.folder,
  tags: r.tags ?? [],
  status: r.segments?.length ? 'transcribed' : 'recorded',
  segments: r.segments ?? [],
  summary: r.summary,
  slides: r.slides,
  mindmap: r.mindmap,
  deleted: r.deleted,
})

/** Two-way last-write-wins sync of text data (audio stays on device). */
export async function syncNow(): Promise<{ pushed: number; pulled: number }> {
  const sb = supabase()
  if (!sb) throw new Error('Supabase not configured')
  const { data: auth } = await sb.auth.getUser()
  const user = auth.user
  if (!user) throw new Error('Not signed in')

  const { data: remote, error } = await sb.from('recordings').select('*')
  if (error) throw error
  const remoteMap = new Map((remote as Row[]).map((r) => [r.id, r]))
  const locals = await db.recordings.toArray()

  const toPush: Row[] = []
  for (const l of locals) {
    const r = remoteMap.get(l.id)
    if (!r || r.updated_at < l.updatedAt) toPush.push(toRow(l, user.id))
  }
  if (toPush.length) {
    const { error: e } = await sb.from('recordings').upsert(toPush)
    if (e) throw e
  }

  const localMap = new Map(locals.map((l) => [l.id, l]))
  const toPull = (remote as Row[]).filter((r) => {
    const l = localMap.get(r.id)
    return !l || l.updatedAt < r.updated_at
  })
  for (const r of toPull) {
    const incoming = fromRow(r)
    const existing = localMap.get(r.id)
    // Keep a local status when the audio/transcribe state is still relevant
    await db.recordings.put({ ...incoming, status: existing?.status === 'transcribing' ? 'transcribing' : incoming.status })
  }
  return { pushed: toPush.length, pulled: toPull.length }
}

export async function createShare(recordingId: string): Promise<string> {
  const sb = supabase()
  if (!sb) throw new Error('Supabase not configured')
  const token = crypto.randomUUID().replace(/-/g, '')
  const { error } = await sb.from('shares').insert({ token, recording_id: recordingId })
  if (error) throw error
  return `${location.origin}/s/${token}`
}

export interface Shared {
  title: string
  summary: string
  slides: string
  mindmap: string
  segments: Recording['segments']
  created_at: number
}

export async function fetchShared(token: string): Promise<Shared | null> {
  const sb = supabase()
  if (!sb) throw new Error('Supabase not configured')
  const { data, error } = await sb.rpc('get_shared', { share_token: token })
  if (error) throw error
  return (data as Shared[] | null)?.[0] ?? null
}

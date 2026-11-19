export interface Segment {
  start: number
  end: number
  text: string
}

export interface Recording {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  duration: number
  language: string
  folder: string
  tags: string[]
  status: 'recorded' | 'transcribing' | 'transcribed' | 'error'
  segments: Segment[]
  summary: string
  slides: string
  mindmap: string
  template?: 'meeting' | 'lecture' | 'interview' | 'memo'
  deleted?: boolean
}

export interface AudioBlob {
  id: string
  blob: Blob
}

export interface ChatMessage {
  id?: number
  recordingId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface Chunk {
  id?: number
  recordingId: string
  start: number
  text: string
  vec?: Float32Array
}

export interface Settings {
  sttModel: string
  llmModel: string
  uiLang: 'vi' | 'en'
  outputLang: string
  audioLang: string
  supabaseUrl: string
  supabaseKey: string
  llmProvider: 'local' | 'groq' | 'gemini'
  cloudKey: string
  autoSummary: boolean
}

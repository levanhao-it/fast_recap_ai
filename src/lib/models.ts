import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Settings } from './types'

export const STT_MODELS = [
  { id: 'onnx-community/whisper-tiny', label: 'Whisper Tiny (~75MB, nhanh)', mb: 75 },
  { id: 'onnx-community/whisper-base', label: 'Whisper Base (~150MB, cÃ¢n báº±ng)', mb: 150 },
  { id: 'onnx-community/whisper-small', label: 'Whisper Small (~250MB, chÃ­nh xÃ¡c)', mb: 250 },
]

export const LLM_MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B (~0.4GB, nhanh)', mb: 400 },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B (~1GB, cÃ¢n báº±ng)', mb: 1000 },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 3B (~2GB, chÃ­nh xÃ¡c)', mb: 2000 },
]

// Used when WebGPU is unavailable (runs through Transformers.js on WASM)
export const WASM_LLM = 'onnx-community/Qwen2.5-0.5B-Instruct'
export const EMBED_MODEL = 'Xenova/multilingual-e5-small'

// Opt-in free-tier cloud LLMs (OpenAI-compatible); the user supplies their own key
export const CLOUD = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', label: 'Groq (Llama 3.3 70B)' },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.5-flash',
    label: 'Google Gemini (2.5 Flash)',
  },
} as const

export const LANGS = [
  ['auto', 'Auto'],
  ['vi', 'Tiếng Việt'],
  ['en', 'English'],
  ['zh', '中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['de', 'Deutsch'],
  ['th', 'ภาษาไทย'],
  ['id', 'Bahasa Indonesia'],
] as const

export function langName(code: string): string {
  return LANGS.find(([c]) => c === code)?.[1] ?? code
}

export const hasWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator

export const useSettings = create<Settings & { set: (p: Partial<Settings>) => void }>()(
  persist(
    (set) => ({
      sttModel: STT_MODELS[1].id,
      llmModel: LLM_MODELS[1].id,
      uiLang: navigator.language.startsWith('vi') ? 'vi' : 'en',
      outputLang: 'vi',
      audioLang: 'auto',
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
      supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      llmProvider: 'local',
      cloudKey: '',
      autoSummary: false,
      set: (p) => set(p),
    }),
    { name: 'recap-settings' },
  ),
)

export async function storageUsage(): Promise<string> {
  const est = await navigator.storage?.estimate?.()
  if (!est?.usage) return '0 MB'
  return `${Math.round(est.usage / 1048576)} MB / ${Math.round((est.quota ?? 0) / 1048576)} MB`
}

export async function clearModelCache() {
  for (const name of await caches.keys()) {
    if (name.startsWith('transformers') || name.startsWith('webllm')) await caches.delete(name)
  }
}

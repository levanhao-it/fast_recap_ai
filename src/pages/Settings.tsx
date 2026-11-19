import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { CLOUD, LANGS, LLM_MODELS, STT_MODELS, clearModelCache, hasWebGPU, storageUsage, useSettings } from '../lib/models'
import type { Settings as SettingsState } from '../lib/types'
import { supabase, syncNow } from '../lib/sync'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

export default function Settings() {
  const t = useT()
  const s = useSettings()
  const [usage, setUsage] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void storageUsage().then(setUsage)
  }, [])
  useEffect(() => {
    void supabase()?.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null))
  }, [s.supabaseUrl, s.supabaseKey])

  const auth = async (mode: 'in' | 'up') => {
    const sb = supabase()
    if (!sb) return setMsg(t('needSync'))
    const { data, error } = mode === 'in' ? await sb.auth.signInWithPassword({ email, password: pw }) : await sb.auth.signUp({ email, password: pw })
    setMsg(error ? error.message : '')
    setUser(data.user?.email ?? null)
  }

  const sync = async () => {
    try {
      const r = await syncNow()
      setMsg(`${t('syncDone')}: â†‘${r.pushed} â†“${r.pulled}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('errorGeneric'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <Field label={t('uiLang')}>
          <select className="input" value={s.uiLang} onChange={(e) => s.set({ uiLang: e.target.value as 'vi' | 'en' })}>
            <option value="vi">Tiáº¿ng Viá»‡t</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('audioLang')}>
          <select className="input" value={s.audioLang} onChange={(e) => s.set({ audioLang: e.target.value })}>
            {LANGS.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('outputLang')}>
          <select className="input" value={s.outputLang} onChange={(e) => s.set({ outputLang: e.target.value })}>
            {LANGS.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="card space-y-3">
        <Field label={t('llmProvider')}>
          <select className="input" value={s.llmProvider} onChange={(e) => s.set({ llmProvider: e.target.value as SettingsState['llmProvider'] })}>
            <option value="local">{t('providerLocal')}</option>
            <option value="groq">{CLOUD.groq.label}</option>
            <option value="gemini">{CLOUD.gemini.label}</option>
          </select>
        </Field>
        {s.llmProvider !== 'local' && (
          <>
            <input className="input" type="password" autoComplete="off" placeholder={t('apiKey')} value={s.cloudKey} onChange={(e) => s.set({ cloudKey: e.target.value.trim() })} />
            <p className="text-xs text-amber-600">{t('cloudWarning')}</p>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.autoSummary} onChange={(e) => s.set({ autoSummary: e.target.checked })} />
          {t('autoSummary')}
        </label>
      </div>

      <div className="card space-y-3">
        <Field label={t('sttModel')}>
          <select className="input" value={s.sttModel} onChange={(e) => s.set({ sttModel: e.target.value })}>
            {STT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('llmModel')}>
          <select className="input" value={s.llmModel} disabled={!hasWebGPU()} onChange={(e) => s.set({ llmModel: e.target.value })}>
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        {!hasWebGPU() && <p className="text-xs text-amber-600">{t('noWebGpu')}</p>}
        <p className="text-xs text-slate-500">{t('downloadHint')}</p>
        <div className="flex items-center justify-between text-sm">
          <span>
            {t('storage')}: {usage}
          </span>
          <button
            className="btn-ghost"
            onClick={async () => {
              await clearModelCache()
              setUsage(await storageUsage())
            }}
          >
            {t('clearModels')}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-medium">{t('sync')} (Supabase)</h3>
        <p className="text-xs text-slate-500">{t('privacy')}</p>
        <input className="input" placeholder="https://xxxx.supabase.co" value={s.supabaseUrl} onChange={(e) => s.set({ supabaseUrl: e.target.value.trim() })} />
        <input className="input" placeholder="anon key" value={s.supabaseKey} onChange={(e) => s.set({ supabaseKey: e.target.value.trim() })} />
        {user ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{user}</span>
            <button className="btn" onClick={() => void sync()}>
              {t('syncNow')}
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await supabase()?.auth.signOut()
                setUser(null)
              }}
            >
              {t('signOut')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="input" type="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="input" type="password" placeholder={t('password')} value={pw} onChange={(e) => setPw(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn" onClick={() => void auth('in')}>
                {t('signIn')}
              </button>
              <button className="btn-ghost" onClick={() => void auth('up')}>
                {t('signUp')}
              </button>
            </div>
          </div>
        )}
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  )
}

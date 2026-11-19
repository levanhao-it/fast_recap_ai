import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useT } from './lib/i18n'
import Detail from './pages/Detail'
import Home from './pages/Home'
import Record from './pages/Record'
import Settings from './pages/Settings'
import SharedNote from './pages/Shared'

function Nav() {
  const t = useT()
  const cls = ({ isActive }: { isActive: boolean }) => `flex-1 py-3 text-center text-sm ${isActive ? 'font-semibold text-indigo-600' : 'text-slate-500'}`
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-800 print:hidden">
      <NavLink to="/" end className={cls}>
        ðŸ“ {t('notes')}
      </NavLink>
      <NavLink to="/record" className={cls}>
        ðŸŽ™ {t('record')}
      </NavLink>
      <NavLink to="/settings" className={cls}>
        âš™ {t('settings')}
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <main className="mx-auto max-w-2xl p-4 pb-24">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/record" element={<Record />} />
          <Route path="/n/:id" element={<Detail />} />
          <Route path="/s/:token" element={<SharedNote />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <Nav />
    </BrowserRouter>
  )
}

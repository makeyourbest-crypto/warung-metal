import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import { ToastProvider } from './components/Toast'
import Barang from './pages/Barang'
import Kasir from './pages/Kasir'
import Laporan from './pages/Laporan'
import Pengaturan from './pages/Pengaturan'
import Stok from './pages/Stok'

const NAV = [
  { to: '/', label: 'Kasir', icon: '🛒' },
  { to: '/barang', label: 'Barang', icon: '📦' },
  { to: '/stok', label: 'Stok', icon: '📊' },
  { to: '/laporan', label: 'Laporan', icon: '🧾' },
  { to: '/pengaturan', label: 'Setelan', icon: '⚙️' },
]

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb)
      window.addEventListener('offline', cb)
      return () => {
        window.removeEventListener('online', cb)
        window.removeEventListener('offline', cb)
      }
    },
    () => navigator.onLine,
    () => true,
  )
}

export default function App() {
  const online = useOnline()
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-semibold lg:flex-none lg:flex-row lg:gap-2 lg:rounded-lg lg:px-4 lg:py-2 lg:text-sm ${
      isActive ? 'text-ember lg:bg-steel-700' : 'text-steel-400 hover:text-white'
    }`

  return (
    <ToastProvider>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-steel-700 bg-steel-900 px-4 py-2">
          <div className="text-lg font-extrabold tracking-wider text-white">
            WARUNG <span className="text-ember">METAL</span> 🤘
          </div>
          <nav className="ml-6 hidden gap-1 lg:flex" aria-label="Menu utama">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
                <span aria-hidden>{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            {online ? 'Online' : 'Offline'} · data lokal
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
          <Routes>
            <Route path="/" element={<Kasir />} />
            <Route path="/barang" element={<Barang />} />
            <Route path="/stok" element={<Stok />} />
            <Route path="/laporan" element={<Laporan />} />
            <Route path="/pengaturan" element={<Pengaturan />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-steel-700 bg-steel-900 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Menu utama">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
              <span className="text-xl" aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  )
}

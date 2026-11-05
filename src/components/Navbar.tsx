import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShoppingCart, Package, ArrowLeftRight, BarChart3, FileSpreadsheet, LogOut } from 'lucide-react'

export const Navbar: React.FC = () => {
  const location = useLocation()
  const { user, signOut, isConfigured } = useAuth()

  const navLinks = [
    { to: '/', label: 'Kasir', icon: ShoppingCart },
    { to: '/barang', label: 'Katalog Barang', icon: Package },
    { to: '/stok', label: 'Riwayat Stok', icon: ArrowLeftRight },
    { to: '/laporan', label: 'Laporan & Omzet', icon: BarChart3 },
    { to: '/report', label: 'Report', icon: FileSpreadsheet },
  ]

  return (
    <header className="bg-slate-900/95 border-b border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
      
      {/* Brand & Desktop Navigation */}
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-lg font-black shadow-lg shadow-amber-500/20 group-hover:scale-105 transition">
            🤘
          </div>
          <span className="text-base font-black tracking-wider text-white">
            WARUNG METAL
          </span>
        </Link>

        {/* Desktop Nav Items */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-200">
                {user.email?.split('@')[0] || 'Kasir'}
              </p>
              <p className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">
                {user.email}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 uppercase">
              {user.email?.[0] || 'K'}
            </div>
            <button
              onClick={() => signOut()}
              title="Keluar dari akun"
              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        ) : (
          isConfigured && (
            <Link
              to="/login"
              className="text-xs px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5"
            >
              Masuk Kasir
            </Link>
          )
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 p-2 flex justify-around items-center z-50 backdrop-blur-md">
        {navLinks.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-medium transition ${
                isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label.split(' ')[0]}</span>
            </Link>
          )
        })}
      </nav>
    </header>
  )
}

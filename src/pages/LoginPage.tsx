import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { signIn, isConfigured } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setIsSubmitting(true)

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password.trim()

    try {
      const { error } = await signIn(cleanEmail, cleanPassword)
      if (error) {
        setErrorMsg(
          error.message === 'Invalid login credentials'
            ? 'Email atau kata sandi salah. Pastikan akun sudah dibuat di database Supabase.'
            : error.message
        )
      } else {
        navigate('/')
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Terjadi kesalahan sistem saat login')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-emerald-500 selection:text-white">
      <div className="w-full max-w-md">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 items-center justify-center text-3xl shadow-xl shadow-amber-500/10 mb-3">
            🤘
          </div>
          <h1 className="text-2xl font-black text-white tracking-wider">
            WARUNG METAL
          </h1>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white">Masuk Kasir</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Masukkan email dan kata sandi untuk membuka kasir
            </p>
          </div>

          {!isConfigured && (
            <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Supabase Belum Dikonfigurasi</p>
                <p className="text-amber-400/80 text-[11px] mt-0.5">
                  Isi URL & Anon Key di file <code className="bg-slate-950 px-1 py-0.5 rounded">.env</code> untuk mengaktifkan sinkronisasi database cloud permanen.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Akun Kasir
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kasir@warungmetal.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Masuk ke Kasir</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Info */}
          <div className="mt-5 pt-4 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500">
              Akun kasir dikelola langsung oleh pemilik warung melalui database Supabase.
            </p>
          </div>

          {/* Quick bypass button if not configured */}
          {!isConfigured && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-xs text-slate-400 hover:text-emerald-400 font-medium transition"
              >
                Lanjut ke Dasbor Kasir Sementara (Mode Offline) →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

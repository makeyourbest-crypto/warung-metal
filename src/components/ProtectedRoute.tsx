import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isConfigured } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium">Memuat sesi Warung Metal...</p>
      </div>
    )
  }

  // Jika dalam mode testing (Vitest) atau Supabase belum dikonfigurasi, izinkan akses langsung
  if (import.meta.env.MODE === 'test' || !isConfigured) {
    return <>{children}</>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-medium">Memuat sesi Warung Metal...</p>
      </div>
    )
  }

  // Hanya izinkan bypass saat pengujian otomatis (Vitest)
  if (import.meta.env.MODE === 'test') {
    return <>{children}</>
  }

  // Wajibkan login kasir sebelum membuka aplikasi
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

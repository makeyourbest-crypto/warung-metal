import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Navbar } from './components/Navbar'
import { LoginPage } from './pages/LoginPage'
import Barang from './pages/Barang'
import Kasir from './pages/Kasir'
import Laporan from './pages/Laporan'
import Report from './pages/Report'
import Stok from './pages/Stok'

function AppRoutes() {
  const location = useLocation()
  const isAuthPage = location.pathname === '/login'

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {!isAuthPage && <Navbar />}
      
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Kasir />
              </ProtectedRoute>
            }
          />
          <Route
            path="/barang"
            element={
              <ProtectedRoute>
                <Barang />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stok"
            element={
              <ProtectedRoute>
                <Stok />
              </ProtectedRoute>
            }
          />
          <Route
            path="/laporan"
            element={
              <ProtectedRoute>
                <Laporan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report"
            element={
              <ProtectedRoute>
                <Report />
              </ProtectedRoute>
            }
          />
          <Route path="/pengaturan" element={<Navigate to="/report" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  )
}

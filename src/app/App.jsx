import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import AppShell from '../components/layout/AppShell'
import Dashboard from '../pages/Dashboard'
import Login from '../pages/Login'
import Pos from '../pages/Pos'
import Queue from '../pages/Queue'
import Reports from '../pages/Reports'
import MasterProducts from '../pages/MasterProducts'
import MasterCategories from '../pages/MasterCategories'
import MasterStaff from '../pages/MasterStaff'

/**
 * ProtectedRoute — Guard route yang memerlukan user sudah login.
 * Redirect ke /login jika belum ada sesi auth aktif.
 * Menampilkan loading screen saat status sesi masih dicek.
 */
function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * PublicRoute — Route yang hanya bisa diakses saat belum login (misal: halaman Login).
 * Jika sudah login:
 * - Owner  → redirect ke /dashboard
 * - Staff  → redirect ke /pos
 */
function PublicRoute({ children }) {
  const { session, profile, loading, loadingProfile } = useAuth()

  if (loading || (session && loadingProfile)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Loading...
      </div>
    )
  }

  if (session && profile) {
    if (profile.role === 'owner') {
      return <Navigate to="/dashboard" replace />
    }
    return <Navigate to="/pos" replace />
  }

  return children
}

/**
 * LandingRedirect — Komponen untuk route "/" (root).
 * Mengarahkan user ke halaman yang sesuai berdasarkan status login dan role:
 * - Belum login       → /login
 * - Login sebagai owner → /dashboard
 * - Login sebagai staff → /pos
 */
function LandingRedirect() {
  const { session, profile, loading, loadingProfile } = useAuth()

  if (loading || (session && loadingProfile)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (profile?.role === 'owner') {
    return <Navigate to="/dashboard" replace />
  }

  return <Navigate to="/pos" replace />
}

/**
 * RequireRole — Guard route berdasarkan role user.
 * Digunakan untuk halaman yang hanya bisa diakses oleh role tertentu (misal: 'owner').
 * Jika role tidak sesuai, user diarahkan kembali ke /pos.
 *
 * @param {string} role - Role yang diizinkan mengakses halaman (e.g. 'owner')
 */
function RequireRole({ role, children }) {
  const { profile, loadingProfile } = useAuth()
  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
        Loading...
      </div>
    )
  }
  if (role && profile?.role !== role) {
    return <Navigate to="/pos" replace />
  }
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Pos />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/queue"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Queue />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <RequireRole role="owner">
                  <AppShell>
                    <Dashboard />
                  </AppShell>
                </RequireRole>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <RequireRole role="owner">
                  <AppShell>
                    <Reports />
                  </AppShell>
                </RequireRole>
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/products"
            element={
              <ProtectedRoute>
                <RequireRole role="owner">
                  <AppShell>
                    <MasterProducts />
                  </AppShell>
                </RequireRole>
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/categories"
            element={
              <ProtectedRoute>
                <RequireRole role="owner">
                  <AppShell>
                    <MasterCategories />
                  </AppShell>
                </RequireRole>
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/staff"
            element={
              <ProtectedRoute>
                <RequireRole role="owner">
                  <AppShell>
                    <MasterStaff />
                  </AppShell>
                </RequireRole>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Register from './pages/Register'
import Trips from './pages/Trips'
import TripLayout from './pages/TripLayout'
import Schedule from './pages/Schedule'
import Members from './pages/Members'
import Expenses from './pages/Expenses'
import Stats from './pages/Stats'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <main className="page">
        <p className="muted">Đang kiểm tra đăng nhập…</p>
      </main>
    )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user, loading } = useAuth()

  if (!isConfigured) {
    return (
      <main className="page">
        <div className="alert alert-error">
          Chưa cấu hình Supabase. Copy <code>.env.example</code> thành <code>.env</code>, điền{' '}
          <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code>, rồi chạy lại{' '}
          <code>npm run dev</code>.
        </div>
      </main>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!user && !loading ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/register" element={!user && !loading ? <Register /> : <Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Trips />
          </RequireAuth>
        }
      />
      <Route
        path="/trip/:tripId"
        element={
          <RequireAuth>
            <TripLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Schedule />} />
        <Route path="members" element={<Members />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="stats" element={<Stats />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { isConfigured } from './lib/supabase'
import AppLayout from './components/AppLayout'
import AuthLayout from './components/AuthLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import Trips from './pages/Trips'
import TripLayout from './pages/TripLayout'
import Schedule from './pages/Schedule'
import Members from './pages/Members'
import Expenses from './pages/Expenses'
import Stats from './pages/Stats'
import NotFound from './pages/NotFound'

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
      {/* element falsy bị react-router coi là "không có element" -> render thẳng
          Outlet, khiến /login hiện TRẦN (không nền nước, không căn giữa) rồi
          remount khi loading xong, xoá sạch email/mật khẩu vừa gõ. */}
      <Route element={user && !loading ? <Navigate to="/" replace /> : <AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      {/* Layout route không có path: wallpaper mount 1 lần cho MỌI trang trong app */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Trips />} />
        <Route path="/trip/:tripId" element={<TripLayout />}>
          <Route index element={<Schedule />} />
          <Route path="members" element={<Members />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="stats" element={<Stats />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

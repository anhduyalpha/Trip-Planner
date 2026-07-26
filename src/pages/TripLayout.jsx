import { NavLink, Outlet, useParams, Link } from 'react-router-dom'
import { TripProvider, useTrip } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'
import { fmtClock } from '../lib/schedule'

export default function TripLayout() {
  const { tripId } = useParams()
  return (
    <TripProvider tripId={tripId}>
      <Shell />
    </TripProvider>
  )
}

function Shell() {
  const { trip, loading, error, now, isLead, pendingEvents } = useTrip()
  const { signOut, profile } = useAuth()

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Đang tải chuyến đi…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page">
        <div className="alert alert-error">{error}</div>
        <Link className="btn btn-ghost" to="/">
          ← Về danh sách chuyến đi
        </Link>
      </main>
    )
  }

  const tab = ({ isActive }) => `tab${isActive ? ' active' : ''}`

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">
            <Link to="/">Chuyến đi</Link> · {isLead ? 'Lead' : 'Member'} · {profile?.full_name}
          </div>
          <h1>{trip.name}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="eyebrow">Giờ hiện tại</div>
          <div className="clock">{fmtClock(now)}</div>
        </div>
        <button className="btn btn-ghost" style={{ color: '#fff', borderColor: '#3d5560' }} onClick={signOut}>
          Đăng xuất
        </button>
      </header>

      <nav className="tabs">
        <NavLink end to={`/trip/${trip.id}`} className={tab}>
          Lịch trình{pendingEvents.length ? ` (${pendingEvents.length} chờ duyệt)` : ''}
        </NavLink>
        <NavLink to={`/trip/${trip.id}/members`} className={tab}>
          Thành viên
        </NavLink>
        <NavLink to={`/trip/${trip.id}/expenses`} className={tab}>
          Chi tiêu
        </NavLink>
        <NavLink to={`/trip/${trip.id}/stats`} className={tab}>
          Thống kê
        </NavLink>
      </nav>

      <Outlet />
    </>
  )
}

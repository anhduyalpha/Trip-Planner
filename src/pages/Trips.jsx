import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Trips() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('trips').select('*').order('created_at', { ascending: false })
    setTrips(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const join = async (e) => {
    e.preventDefault()
    setMessage('')
    const { data, error } = await supabase.rpc('join_trip', { p_code: joinCode })
    if (error) {
      setMessage(error.message)
      return
    }
    navigate(`/trip/${data}`)
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Lịch trình chuyến đi</div>
          <h1>Chào {profile?.full_name ?? user?.email}</h1>
        </div>
        <button className="btn btn-ghost" onClick={signOut}>
          Đăng xuất
        </button>
      </header>

      <main className="page">
        <div className="page-head">
          <div>
            <div className="eyebrow">Chuyến đi của bạn</div>
            <h2>{trips.length} chuyến</h2>
          </div>
          <button className="btn" onClick={() => setShowCreate(true)}>
            + Tạo chuyến đi
          </button>
        </div>

        {message && <div className="alert alert-error">{message}</div>}

        {loading ? (
          <p className="muted">Đang tải…</p>
        ) : trips.length === 0 ? (
          <div className="empty">
            <p>Chưa có chuyến đi nào.</p>
            <p className="muted">Tạo một chuyến mới, hoặc nhập mã của nhóm bên dưới để tham gia.</p>
          </div>
        ) : (
          <div className="trip-grid">
            {trips.map((t) => (
              <Link key={t.id} to={`/trip/${t.id}`} className="trip-card">
                <div className="eyebrow">{t.lead_id === user?.id ? 'Bạn là Lead' : 'Thành viên'}</div>
                <h3 style={{ margin: '4px 0 8px' }}>{t.name}</h3>
                {t.description && <p className="muted" style={{ fontSize: '0.88rem', margin: '0 0 10px' }}>{t.description}</p>}
                <div className="mono muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                  {t.start_date ?? '—'} → {t.end_date ?? '—'}
                </div>
                <span className="code-badge">{t.join_code}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="panel panel-join" style={{ marginTop: 26, maxWidth: 440 }}>
          <div className="eyebrow">Tham gia nhóm</div>
          <h3 style={{ margin: '4px 0 12px' }}>Nhập mã chuyến đi</h3>
          <form onSubmit={join} style={{ display: 'flex', gap: 8 }}>
            <input
              className="mono"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="VD: K7MP2X"
              maxLength={6}
              required
            />
            <button className="btn">Tham gia</button>
          </form>
        </div>
      </main>

      {showCreate && <CreateTrip onClose={() => setShowCreate(false)} />}
    </>
  )
}

function CreateTrip({ onClose }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Tên chuyến đi không được để trống.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error: err } = await supabase
      .from('trips')
      .insert({
        name: form.name.trim(),
        description: form.description.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        lead_id: user.id,
        join_code: makeCode()
      })
      .select('id')
      .single()

    if (err) {
      setBusy(false)
      setError(err.message)
      return
    }

    // Người tạo trip mặc định là Lead trong danh sách thành viên
    await supabase.from('trip_members').insert({
      trip_id: data.id,
      user_id: user.id,
      display_name: profile?.full_name ?? 'Lead',
      role_desc: 'Dẫn đoàn',
      permission: 'lead'
    })

    setBusy(false)
    navigate(`/trip/${data.id}`)
  }

  return (
    <Modal
      title="Tạo chuyến đi"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? 'Đang tạo…' : 'Tạo chuyến đi'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field">
        <label htmlFor="t-name">Tên chuyến đi *</label>
        <input id="t-name" value={form.name} onChange={set('name')} placeholder="Đà Lạt 3 ngày 2 đêm" />
      </div>
      <div className="field">
        <label htmlFor="t-desc">Mô tả</label>
        <textarea id="t-desc" value={form.description} onChange={set('description')} />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="t-start">Ngày đi</label>
          <input id="t-start" type="date" value={form.start_date} onChange={set('start_date')} />
        </div>
        <div className="field">
          <label htmlFor="t-end">Ngày về</label>
          <input id="t-end" type="date" value={form.end_date} onChange={set('end_date')} />
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.84rem', marginBottom: 0 }}>
        Bạn sẽ là Lead của chuyến đi này. Sau khi tạo, chia sẻ mã chuyến đi cho cả nhóm để mọi người tham gia.
      </p>
    </Modal>
  )
}

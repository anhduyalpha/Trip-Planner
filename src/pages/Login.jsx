import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError('Email hoặc mật khẩu không đúng.')
    else navigate('/', { replace: true })
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-mark">Lịch trình chuyến đi</div>
        <h1 style={{ marginBottom: 18 }}>Đăng nhập</h1>
        <div className="panel">
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>
          <p className="muted center" style={{ marginBottom: 0, marginTop: 14, fontSize: '0.88rem' }}>
            Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

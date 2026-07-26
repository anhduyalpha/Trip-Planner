import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [errorNonce, setErrorNonce] = useState(0)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await signIn(email.trim(), password)
    setBusy(false)
    if (err) {
      setError('Email hoặc mật khẩu không đúng.')
      setErrorNonce((n) => n + 1)
    } else navigate('/', { replace: true })
  }

  return (
    <div className="auth-panel">
      <div className="brand-mark">Lịch trình chuyến đi</div>
      <h1>Đăng nhập</h1>
      {error && (
        <div key={errorNonce} role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Mật khẩu</label>
          <div className="input-wrap">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="pw-toggle" aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'ẨN' : 'HIỆN'}
            </button>
          </div>
        </div>
        <button className="btn btn-auth" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      <p className="muted center auth-foot">
        Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
      </p>
    </div>
  )
}

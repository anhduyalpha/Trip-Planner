import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error: err } = await signUp(email.trim(), password, fullName.trim() || 'Thành viên')
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    if (data.session) navigate('/', { replace: true })
    else setNotice('Đăng ký xong. Kiểm tra email để xác nhận, sau đó quay lại đăng nhập.')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-mark">Lịch trình chuyến đi</div>
        <h1 style={{ marginBottom: 18 }}>Tạo tài khoản</h1>
        <div className="panel">
          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-ok">{notice}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="name">Tên của bạn</label>
              <input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
            </button>
          </form>
          <p className="muted center" style={{ marginBottom: 0, marginTop: 14, fontSize: '0.88rem' }}>
            Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

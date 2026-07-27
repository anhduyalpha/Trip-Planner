import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const emailRef = useRef(null)
  const [mode, setMode] = useState(() => (location.state?.openForgot ? 'forgot' : 'login'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [errorNonce, setErrorNonce] = useState(0)
  const [notice, setNotice] = useState(() => location.state?.notice ?? '')
  const [busy, setBusy] = useState(false)

  const fail = (message) => {
    setError(message)
    setErrorNonce((n) => n + 1)
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: err } = await signIn(email.trim(), password)
      if (err) fail('Email hoặc mật khẩu không đúng.')
      else navigate('/', { replace: true })
    } catch {
      fail('Chưa thể đăng nhập. Kiểm tra kết nối mạng rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const sendResetEmail = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: err } = await requestPasswordReset(email.trim())
      if (err) {
        fail('Chưa gửi được email khôi phục. Vui lòng chờ một lát rồi thử lại.')
        return
      }
      setNotice(
        'Nếu email này đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư rác.'
      )
    } catch {
      fail('Chưa gửi được email khôi phục. Kiểm tra kết nối mạng rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setNotice('')
    requestAnimationFrame(() => emailRef.current?.focus())
  }

  return (
    <div className="auth-panel">
      <div className="brand-mark">Lịch trình chuyến đi</div>
      <h1>{mode === 'login' ? 'Đăng nhập' : 'Quên mật khẩu?'}</h1>
      {mode === 'forgot' && (
        <p className="muted auth-subtitle">
          Nhập email đã đăng ký. Chúng tôi sẽ gửi cho bạn một liên kết khôi phục an toàn.
        </p>
      )}
      {error && (
        <div key={errorNonce} role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert alert-ok">
          {notice}
        </div>
      )}

      {mode === 'login' ? (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <div className="auth-label-row">
              <label htmlFor="login-password">Mật khẩu</label>
              <button type="button" className="auth-inline-action" onClick={() => switchMode('forgot')}>
                Quên mật khẩu?
              </button>
            </div>
            <div className="input-wrap">
              <input
                id="login-password"
                name="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pw-toggle"
                aria-pressed={showPw}
                aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? 'ẨN' : 'HIỆN'}
              </button>
            </div>
          </div>
          <button className="btn btn-auth" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      ) : (
        <form onSubmit={sendResetEmail}>
          <div className="field">
            <label htmlFor="recovery-email">Email</label>
            <input
              ref={emailRef}
              id="recovery-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ban@example.com"
            />
          </div>
          <button className="btn btn-auth" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Đang gửi…' : 'Gửi liên kết khôi phục'}
          </button>
        </form>
      )}

      {mode === 'login' ? (
        <p className="muted center auth-foot">
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
      ) : (
        <p className="muted center auth-foot">
          Đã nhớ mật khẩu?{' '}
          <button
            type="button"
            className="auth-inline-action auth-inline-action--foot"
            onClick={() => switchMode('login')}
          >
            Quay lại đăng nhập
          </button>
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ResetPassword() {
  const { user, loading, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [errorNonce, setErrorNonce] = useState(0)
  const [busy, setBusy] = useState(false)

  const fail = (message) => {
    setError(message)
    setErrorNonce((n) => n + 1)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      fail('Mật khẩu mới cần ít nhất 6 ký tự.')
      return
    }
    if (password !== confirmPassword) {
      fail('Hai ô mật khẩu chưa khớp nhau.')
      return
    }

    setBusy(true)
    try {
      const { error: err } = await updatePassword(password)
      if (err) {
        fail('Không cập nhật được mật khẩu. Liên kết có thể đã hết hạn; hãy yêu cầu một liên kết mới.')
        return
      }
      // Chỉ kết thúc session khôi phục trên thiết bị hiện tại; không đăng xuất
      // các thiết bị khác của người dùng một cách bất ngờ.
      await signOut({ scope: 'local' })
      navigate('/login', {
        replace: true,
        state: { notice: 'Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.' }
      })
    } catch {
      fail('Không cập nhật được mật khẩu. Kiểm tra kết nối mạng rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="auth-panel" aria-busy="true">
        <div className="brand-mark">Lịch trình chuyến đi</div>
        <h1>Đang kiểm tra liên kết…</h1>
        <p className="muted auth-subtitle">Vui lòng chờ trong giây lát.</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-panel">
        <div className="brand-mark">Lịch trình chuyến đi</div>
        <h1>Liên kết không còn hiệu lực</h1>
        <div role="alert" className="alert alert-error">
          Liên kết khôi phục đã hết hạn, đã được sử dụng hoặc không hợp lệ.
        </div>
        <p className="muted auth-subtitle">Hãy quay lại trang đăng nhập để yêu cầu một email mới.</p>
        <Link className="btn btn-auth auth-btn-link" to="/login" state={{ openForgot: true }}>
          Yêu cầu liên kết mới
        </Link>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <div className="brand-mark">Lịch trình chuyến đi</div>
      <h1>Đặt mật khẩu mới</h1>
      <p className="muted auth-subtitle">Chọn mật khẩu có ít nhất 6 ký tự và nhập lại để xác nhận.</p>
      {error && (
        <div key={errorNonce} role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      <form onSubmit={submit}>
        {/* Giúp password manager gắn mật khẩu mới đúng tài khoản dù email không
            cần hiển thị lại trong bước này. */}
        <input type="email" name="username" autoComplete="username" value={user.email ?? ''} readOnly hidden />
        <div className="field">
          <label htmlFor="new-password">Mật khẩu mới</label>
          <div className="input-wrap">
            <input
              id="new-password"
              name="new-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-help"
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
          <p className="field-help" id="password-help">
            Ít nhất 6 ký tự.
          </p>
        </div>

        <div className="field">
          <label htmlFor="confirm-password">Nhập lại mật khẩu mới</label>
          <div className="input-wrap">
            <input
              id="confirm-password"
              name="confirm-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={6}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="pw-toggle"
              aria-pressed={showPw}
              aria-label={showPw ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? 'ẨN' : 'HIỆN'}
            </button>
          </div>
        </div>

        <button className="btn btn-auth" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
        </button>
      </form>

      <p className="muted center auth-foot">
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import WaterBackground from './WaterBackground'

// Layout chung cho /login, /register và /reset-password: mặt nước phía sau giữ nguyên
// khi chuyển giữa hai trang, chỉ nội dung thẻ kính thay đổi.
export default function AuthLayout() {
  return (
    <div className="auth-wrap auth-wrap--sea">
      <WaterBackground />
      <div className="auth-card">
        <Outlet />
      </div>
    </div>
  )
}

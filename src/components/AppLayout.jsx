import { Outlet } from 'react-router-dom'
import WaterBackground from './WaterBackground'

// Khung chung của mọi trang đã đăng nhập.
// Wallpaper mount MỘT lần ở đây -> không remount khi đổi route, và WebGL
// context chỉ tồn tại đúng một cái trong toàn app (auth và app loại trừ nhau).
export default function AppLayout() {
  return (
    <>
      {/* Phần tử focus được đầu tiên: bàn phím không phải Tab qua 4 tab và
          nút Đăng xuất mới tới nội dung. Chỉ hiện khi được focus. */}
      <a className="skip-link" href="#noi-dung-chinh">
        Bỏ qua điều hướng
      </a>
      <div className="wallpaper" aria-hidden="true">
        <WaterBackground variant="wallpaper" />
        <div className="wp-veil" />
      </div>
      <Outlet />
    </>
  )
}

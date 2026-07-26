import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WaterBackground from '../components/WaterBackground'

// Trang 404 có thương hiệu. Trước đây route "*" lặng lẽ chuyển hướng về "/",
// nghĩa là gõ sai địa chỉ thì người dùng không hề biết mình đã gõ sai.
export default function NotFound() {
  const { user } = useAuth()

  return (
    <>
      {/* Route "*" nằm ngoài AppLayout nên phải tự mang nền theo, nếu không
          trang 404 sẽ là một mảng tối phẳng trông như lỗi render. */}
      <div className="wallpaper" aria-hidden="true">
        <WaterBackground variant="wallpaper" />
        <div className="wp-veil" />
      </div>
      <main className="page">
      <section className="notfound">
        <p className="mast-kicker">Không tìm thấy</p>
        <p className="notfound-code mono" aria-hidden="true">
          404
        </p>
        <h1 className="notfound-h">Chuyến này không có trên bảng giờ.</h1>
        <p className="notfound-sub">
          Địa chỉ bạn vừa mở không tồn tại, hoặc chuyến đi đã bị xóa. Kiểm tra lại đường dẫn, hoặc quay về danh
          sách chuyến đi của bạn.
        </p>
        <div className="btn-row notfound-actions">
          <Link className="btn" to={user ? '/' : '/login'}>
            {user ? 'Về danh sách chuyến đi' : 'Về trang đăng nhập'}
          </Link>
          <button className="btn btn-ghost" type="button" onClick={() => window.history.back()}>
            Quay lại trang trước
          </button>
        </div>
        </section>
      </main>
    </>
  )
}

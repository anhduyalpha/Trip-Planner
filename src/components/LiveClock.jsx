import { useEffect, useState } from 'react'
import { fmtClock } from '../lib/schedule'

// Đồng hồ giây sống ở một lá riêng, KHÔNG lấy giờ từ TripContext.
// Nếu context giữ một `now` nhảy mỗi giây thì mọi trang đọc useTrip (Chi tiêu,
// Thành viên, Thống kê) đều render lại 1 lần/giây dù không hiển thị giây nào.
// Tách ra thế này thì mỗi giây chỉ một node text đổi.
export default function LiveClock({ className = 'clock' }) {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className={className}>{fmtClock(t)}</span>
}

// ============================================================
//  Định dạng tiếng Việt cho phần hiển thị.
//  Intl là API sẵn có của trình duyệt — KHÔNG phải npm package.
//  Lý do tồn tại: input[type=date]/[datetime-local] luôn hiển thị theo
//  locale của TRÌNH DUYỆT (07/26/2026), không theo lang="vi" của tài liệu,
//  và không ép được thứ tự ô bằng CSS. Cách trung thực: giữ control gốc
//  rồi in một dòng echo tiếng Việt ngay bên dưới.
// ============================================================

// LƯU Ý: 'vi-VN' với weekday + ngày + giờ trong CÙNG một formatter trả về
// "14:30 Thứ 2, 27/07/2026" (giờ đứng trước) -> phải ghép 2 formatter.
const DATE_LONG = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})
const DATE_SHORT = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})
const TIME_24 = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

const ok = (d) => d instanceof Date && !Number.isNaN(d.getTime())
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** 'yyyy-mm-dd' -> 'Thứ Hai, 27/07/2026'. Ghép T00:00:00 để không bị đọc là UTC. */
export const echoDate = (v) => {
  if (!v) return 'Chưa chọn'
  const d = new Date(`${v}T00:00:00`)
  return ok(d) ? cap(DATE_LONG.format(d)) : 'Ngày không hợp lệ'
}

/** 'yyyy-mm-ddThh:mm' -> 'Thứ 2, 27/07/2026 · 14:30' (24 giờ). */
export const echoDateTime = (v) => {
  if (!v) return 'Chưa chọn'
  const d = new Date(v)
  if (!ok(d)) return 'Thời điểm không hợp lệ'
  return `${cap(DATE_SHORT.format(d))} · ${TIME_24.format(d)}`
}

/** '3 ngày 2 đêm' — vừa hữu ích vừa khử mơ hồ dd/mm. */
export const echoRange = (start, end) => {
  if (!start || !end) return ''
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  if (!ok(a) || !ok(b) || b < a) return ''
  const nights = Math.round((b - a) / 86400000)
  return nights === 0 ? 'Đi về trong ngày' : `${nights + 1} ngày ${nights} đêm`
}

/** 'Nguyễn Văn An' -> 'VA' (tiếng Việt: tên riêng ở cuối). */
export const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[p.length - 2][0] + p[p.length - 1][0]).toUpperCase()
}

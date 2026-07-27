// ============================================================
//  Toàn bộ business logic về thời gian & trạng thái event
//  (tách khỏi UI để dễ đọc và dễ test)
// ============================================================

export const CATEGORIES = [
  { value: 'food', label: 'Ăn uống' },
  { value: 'sightseeing', label: 'Ngắm cảnh' },
  { value: 'bonding', label: 'Bonding' },
  { value: 'move', label: 'Di chuyển' },
  { value: 'rest', label: 'Nghỉ ngơi' },
  { value: 'other', label: 'Khác' }
]

export const STATUSES = [
  { value: 'upcoming', label: 'Sắp tới' },
  { value: 'ongoing', label: 'Đang diễn ra' },
  { value: 'done', label: 'Đã xong' },
  { value: 'postponed', label: 'Tạm hoãn' },
  { value: 'cancelled', label: 'Hủy' }
]

// Trạng thái người dùng được chọn tay. upcoming/ongoing/done do engine tự tính.
export const MANUAL_STATUSES = ['upcoming', 'postponed', 'cancelled']

export const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label ?? 'Khác'
export const statusLabel = (v) => STATUSES.find((s) => s.value === v)?.label ?? v

/**
 * Realtime engine (phía client).
 * - Hủy / Tạm hoãn: giữ nguyên, không áp dụng business logic tự động.
 * - Còn lại: suy ra từ giờ hiện tại.
 */
export function deriveStatus(event, now = new Date()) {
  if (event.status === 'cancelled' || event.status === 'postponed') return event.status
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  if (now < start) return 'upcoming'
  if (now >= end) return 'done'
  return 'ongoing'
}

/** Event đang diễn ra ở thời điểm `now` (đã duyệt, không bị hủy/hoãn). */
export function findOngoing(events, now = new Date()) {
  return events.filter((e) => e.approval === 'approved' && deriveStatus(e, now) === 'ongoing')
}

/**
 * "Chồng chéo hoàn toàn đè lên nhau": một khung giờ nằm trọn trong khung giờ kia
 * (bao gồm trường hợp trùng khít). Event Hủy vẫn chiếm khung giờ nên vẫn tính.
 */
export function fullyOverlaps(aStart, aEnd, bStart, bEnd) {
  const [a1, a2, b1, b2] = [+new Date(aStart), +new Date(aEnd), +new Date(bStart), +new Date(bEnd)]
  return (a1 <= b1 && a2 >= b2) || (b1 <= a1 && b2 >= a2)
}

export function findFullOverlap(events, draft, ignoreId = null) {
  return events.find(
    (e) => e.id !== ignoreId && fullyOverlaps(draft.start_time, draft.end_time, e.start_time, e.end_time)
  )
}

/** Validate form event. Trả về mảng thông báo lỗi (rỗng = hợp lệ). */
export function validateEvent(draft, allEvents, ignoreId = null) {
  const errors = []
  if (!draft.title?.trim()) errors.push('Tiêu đề không được để trống.')
  const cost = draft.cost === '' || draft.cost == null ? 0 : Number(draft.cost)
  const start = draft.start_time ? new Date(draft.start_time) : null
  const end = draft.end_time ? new Date(draft.end_time) : null
  const ok = (d) => d instanceof Date && !Number.isNaN(d.getTime())

  if (!start || !end) errors.push('Cần chọn cả giờ bắt đầu và giờ kết thúc.')
  // Mọi phép so sánh với Invalid Date đều trả về false, nên một chuỗi không đọc
  // được sẽ lọt hết các cửa rồi mới nổ ở saveEvent với 'Invalid time value'
  // bằng tiếng Anh. Trình duyệt không hỗ trợ datetime-local sẽ hạ input về ô
  // chữ thường và người dùng gõ '27/07/2026 14:00' là rơi vào đúng ca này.
  else if (!ok(start) || !ok(end)) errors.push('Giờ bắt đầu hoặc giờ kết thúc không hợp lệ.')
  else if (end <= start) errors.push('Giờ kết thúc phải sau giờ bắt đầu.')

  if (!Number.isFinite(cost) || cost < 0 || !Number.isInteger(cost))
    errors.push('Chi phí VND phải là số nguyên không âm.')
  else if (cost > 0 && !draft.payer_member_id)
    errors.push('Có chi phí thì phải chọn người đại diện trả.')

  if (ok(start) && ok(end) && end > start) {
    const clash = findFullOverlap(allEvents, draft, ignoreId)
    if (clash) errors.push(`Khung giờ đè hoàn toàn lên hoạt động "${clash.title}". Hãy chỉnh lại giờ.`)
  }
  return errors
}

// ---------- Format ----------
const pad = (n) => String(n).padStart(2, '0')

export const fmtTime = (d) => {
  const x = new Date(d)
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`
}

export const fmtClock = (d) => {
  const x = new Date(d)
  return `${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`
}

export const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

/** Số ngày lịch địa phương từ lúc bắt đầu tới lúc kết thúc. */
export const endDayOffset = (e) => {
  const start = new Date(e.start_time)
  const end = new Date(e.end_time)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(0, Math.round((endDay - startDay) / 86400000))
}

export const fmtDayLabel = (key) => {
  const d = new Date(`${key}T00:00:00`)
  const label = d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const today = dayKey(new Date()) === key
  return today ? `${label} · hôm nay` : label
}

export const fmtDuration = (start, end) => {
  const mins = Math.round((new Date(end) - new Date(start)) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h${m ? pad(m) : ''}` : `${m}p`
}

/** Chuyển timestamptz -> chuỗi cho input datetime-local (giờ địa phương). */
export const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Nhóm event theo ngày, sắp xếp tăng dần theo giờ bắt đầu. */
export function groupByDay(events) {
  const map = new Map()
  ;[...events]
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .forEach((e) => {
      const key = dayKey(e.start_time)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(e)
    })
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
}

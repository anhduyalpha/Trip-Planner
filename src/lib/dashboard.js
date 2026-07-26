// ============================================================
//  Tổng hợp dữ liệu cho DASHBOARD (route /).
//  Toàn bộ là hàm thuần: không gọi network, không chạm React.
//  Database KHÔNG có RPC đếm -> mọi phép cộng dồn làm ở client.
// ============================================================
import { dayKey, deriveStatus, findOngoing } from './schedule'
import { computeLedger, suggestSettlements } from './money'

export const DAY_MS = 86400000

/** 'YYYY-MM-DD' -> Date lúc 00:00 giờ địa phương. null nếu không parse được. */
const toDate = (key) => {
  if (!key) return null
  const d = new Date(`${String(key).slice(0, 10)}T00:00:00`)
  return Number.isNaN(+d) ? null : d
}

/** 'YYYY-MM-DD' -> 'DD/MM' */
const shortDate = (key) => {
  const [, m, d] = String(key).slice(0, 10).split('-')
  return d && m ? `${d}/${m}` : String(key)
}

/** Nhãn khoảng ngày của chuyến đi. */
export function dateRangeLabel(trip) {
  if (trip.start_date && trip.end_date) return `${shortDate(trip.start_date)} → ${shortDate(trip.end_date)}`
  if (trip.start_date) return `Từ ${shortDate(trip.start_date)}`
  if (trip.end_date) return `Đến ${shortDate(trip.end_date)}`
  return 'Chưa đặt ngày'
}

/** Giai đoạn của chuyến so với hôm nay. So sánh chuỗi ISO là đủ và đúng. */
export function tripPhase(trip, now) {
  const today = dayKey(now)
  if (!trip.start_date && !trip.end_date) return 'open'
  const s = trip.start_date ?? trip.end_date
  const e = trip.end_date ?? trip.start_date
  if (today < s) return 'soon'
  if (today > e) return 'past'
  return 'during'
}

/** Thứ tự hiển thị: đang diễn ra -> sắp tới -> chưa đặt ngày -> đã xong. */
const PHASE_RANK = { during: 0, soon: 1, open: 2, past: 3 }

/**
 * Mini-timeline: 1 cột = 1 ngày, chiều cao cột = số hoạt động của ngày đó.
 * Chuyến dài hơn maxCols ngày thì gộp nhiều ngày vào một cột, nên không bao
 * giờ render quá maxCols phần tử (giữ thẻ đọc được ở 375px).
 */
export function buildTimeline(trip, events, now, maxCols = 18) {
  const today = dayKey(now)

  const perDay = new Map()
  events.forEach((e) => {
    const k = dayKey(e.start_time)
    perDay.set(k, (perDay.get(k) ?? 0) + 1)
  })

  let days = []
  const start = toDate(trip.start_date)
  if (start) {
    const end = toDate(trip.end_date) ?? start
    const raw = Math.round((end - start) / DAY_MS) + 1
    const span = Math.min(Math.max(raw, 1), 120) // chặn dữ liệu ngày lỗi
    for (let i = 0; i < span; i += 1) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(dayKey(d))
    }
  } else {
    days = [...perDay.keys()].sort()
  }

  if (days.length === 0) return { cols: [], max: 1, dayCount: 0, label: 'Chưa có ngày nào trong lịch trình' }

  const size = Math.ceil(days.length / maxCols)
  const cols = []
  for (let i = 0; i < days.length; i += size) {
    const bucket = days.slice(i, i + size)
    cols.push({
      key: bucket[0],
      count: bucket.reduce((s, k) => s + (perDay.get(k) ?? 0), 0),
      isToday: bucket.includes(today)
    })
  }

  const max = cols.reduce((m, c) => Math.max(m, c.count), 0) || 1
  // Đếm theo số thực sự nằm trong khoảng ngày (hoạt động ngoài khoảng không có cột)
  const shown = cols.reduce((s, c) => s + c.count, 0)
  return {
    cols,
    max,
    dayCount: days.length,
    label: `Mật độ hoạt động: ${days.length} ngày, ${shown} hoạt động nằm trong khoảng ngày, nhiều nhất ${max} hoạt động trong một ngày`
  }
}

/** Gói dữ liệu cho MỘT thẻ chuyến đi. */
export function buildTripCard(trip, tripMembers, tripEvents, userId, now) {
  const isLead = trip.lead_id === userId
  const me = tripMembers.find((m) => m.user_id === userId) ?? null

  const approved = tripEvents.filter((e) => e.approval === 'approved')
  // "live" = đã duyệt và chưa bị hủy/hoãn -> mẫu số của tiến độ
  const live = approved.filter((e) => e.status !== 'cancelled' && e.status !== 'postponed')
  const pending = tripEvents.filter((e) => e.approval === 'pending')

  // "Xong" = đã qua giờ kết thúc HOẶC được đánh dấu hoàn thành tay, để không
  // mâu thuẫn với ô "Đã hoàn thành" ở trang Thống kê.
  const doneCount = live.filter((e) => e.is_completed || deriveStatus(e, now) === 'done').length
  const ongoing = findOngoing(tripEvents, now) // hàm tự lọc approval === 'approved'

  const future = live
    .filter((e) => new Date(e.start_time) > now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  const horizon = +now + DAY_MS
  const soon = future.filter((e) => +new Date(e.start_time) <= horizon)

  const { ledger, total } = computeLedger(tripEvents, tripMembers)
  const myRow = me ? (ledger.find((r) => r.member.id === me.id) ?? null) : null
  const settlements = me
    ? suggestSettlements(ledger).filter((s) => s.fromId === me.id || s.toId === me.id)
    : []

  return {
    trip,
    isLead,
    me,
    memberCount: tripMembers.length,
    eventCount: live.length,
    doneCount,
    progress: live.length ? Math.round((doneCount / live.length) * 100) : 0,
    ongoing,
    next: future[0] ?? null,
    soon,
    pendingCount: pending.length,
    myPendingCount: pending.filter((e) => e.created_by === userId).length,
    totalCost: total,
    myBalance: myRow ? myRow.balance : 0,
    settlements,
    phase: tripPhase(trip, now),
    // Lead thấy trip (trips_select) nhưng events_select CHỈ dựa vào is_trip_member
    // theo user_id. Lead thiếu DÒNG CỦA CHÍNH MÌNH => 0 event trả về, dù trip có
    // bao nhiêu thành viên khác đi nữa. Cờ này để KHÔNG hiện số 0 sai.
    orphanLead: isLead && !me,
    rank: ongoing.length > 0 ? -1 : PHASE_RANK[tripPhase(trip, now)],
    timeline: buildTimeline(trip, live, now)
  }
}

/** Sắp xếp thẻ: đang diễn ra -> sắp tới -> chưa đặt ngày -> đã xong.
 *  Cùng nhóm thì chuyến khởi hành sớm hơn đứng trước. */
export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    const sa = a.trip.start_date ?? a.trip.end_date ?? ''
    const sb = b.trip.start_date ?? b.trip.end_date ?? ''
    if (sa && sb && sa !== sb) return sa < sb ? -1 : 1
    return 0
  })
}

/** Gộp tất cả thẻ thành hàng chỉ số + hai danh sách hành động. */
export function buildOverview(cards, now) {
  const soon = []
  const ongoing = []
  const debts = []

  cards.forEach((c) => {
    c.ongoing.forEach((e) => ongoing.push({ ...e, tripName: c.trip.name, tripId: c.trip.id }))
    c.soon.forEach((e) => soon.push({ ...e, tripName: c.trip.name, tripId: c.trip.id }))
    c.settlements.forEach((s) =>
      debts.push({ ...s, tripName: c.trip.name, tripId: c.trip.id, iPay: s.fromId === c.me?.id })
    )
  })

  soon.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  ongoing.sort((a, b) => new Date(a.end_time) - new Date(b.end_time))
  debts.sort((a, b) => b.amount - a.amount)

  const needApproval = cards.reduce((s, c) => s + (c.isLead ? c.pendingCount : 0), 0)
  const myPending = cards.reduce((s, c) => s + (c.isLead ? 0 : c.myPendingCount), 0)
  const iOwe = debts.filter((d) => d.iPay).reduce((s, d) => s + d.amount, 0)
  const owedToMe = debts.filter((d) => !d.iPay).reduce((s, d) => s + d.amount, 0)

  return {
    soon,
    ongoing,
    debts,
    needApproval,
    myPending,
    iOwe,
    owedToMe,
    net: owedToMe - iOwe,
    activeCount: cards.filter((c) => c.ongoing.length > 0 || c.phase === 'during').length,
    startingSoon: cards.filter((c) => c.phase === 'soon').length,
    approvalTrip: cards.find((c) => c.isLead && c.pendingCount > 0)?.trip.name ?? '',
    orphanCount: cards.filter((c) => c.orphanLead).length,
    now
  }
}

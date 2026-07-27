// ============================================================
//  Chia tiền nhóm
//  Quy tắc: chi phí mỗi event chia đều cho các thành viên được assign.
//  Event bị Hủy không tính vào chi tiêu.
// ============================================================

const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
})

/** Số tiền -> '1.110.000 ₫'. Mọi giá trị không hữu hạn đều quy về 0. */
export const fmtVND = (n) => {
  const v = Math.round(Number(n))
  // `Number(n) || 0` cũ để lọt Infinity (in ra '∞ ₫') và -0 (in ra '-0 ₫').
  // Object.is bắt được -0, còn isFinite bắt NaN lẫn ±Infinity.
  if (!Number.isFinite(v) || Object.is(v, -0)) return VND.format(0)
  return VND.format(v)
}

/**
 * @param {Array} events  event đã kèm mảng assigned (id trip_members)
 * @param {Array} members danh sách trip_members
 */
export function computeLedger(events, members) {
  const rows = new Map(
    members.map((m) => [m.id, { member: m, paid: 0, owed: 0, balance: 0, eventCount: 0 }])
  )

  let total = 0
  let unassignedCost = 0
  let orphanPaidCost = 0

  const billable = events.filter((e) => {
    const cost = Number(e.cost)
    return e.approval === 'approved' && e.status !== 'cancelled' && Number.isFinite(cost) && cost > 0
  })

  billable.forEach((e) => {
    // VND không có phần thập phân. Chuẩn hóa cả dữ liệu cũ/API trực tiếp để
    // tổng, số đã ứng và số phải gánh luôn dùng cùng một đơn vị nguyên.
    const cost = Math.round(Number(e.cost))
    // Sắp theo id: `event_members` trả về không có thứ tự bảo đảm, mà phần dư
    // bên dưới lại rải theo vị trí. Không sắp thì 1đ lẻ nhảy từ người này sang
    // người khác sau mỗi lần tải lại, số trên màn hình tự đổi.
    const assigned = (e.assigned || []).filter((id) => rows.has(id)).sort()
    total += cost

    // Xoá một thành viên sẽ set payer_member_id về null (ON DELETE SET NULL),
    // nên khoản họ đã ứng không còn được ghi có cho ai. Nếu chỉ im lặng bỏ qua
    // thì cả nhóm vẫn bị tính nợ phần của mình mà không ai là chủ nợ: mọi số dư
    // đều âm, danh sách "ai nợ ai" rỗng, và trang báo là đã cân bằng.
    if (rows.has(e.payer_member_id)) rows.get(e.payer_member_id).paid += cost
    else orphanPaidCost += cost

    if (assigned.length === 0) {
      unassignedCost += cost
      return
    }
    // VND không có đơn vị nhỏ hơn đồng, nên phải chia thành số nguyên rồi rải
    // phần dư, chứ không để mỗi người ôm một phân số. Trước đây 1.000.000 chia
    // 3 hiện 333.333 x 3 = 999.999: cột "Dư / nợ" không cộng về 0 và người ứng
    // tiền bị trả thiếu 1đ. Phần dư rải cho những người đầu danh sách, thứ tự
    // ổn định vì `assigned` đã được sắp theo id.
    const base = Math.floor(cost / assigned.length)
    const remainder = cost - base * assigned.length
    assigned.forEach((id, i) => {
      const r = rows.get(id)
      r.owed += base + (i < remainder ? 1 : 0)
      r.eventCount += 1
    })
  })

  const ledger = [...rows.values()].map((r) => ({ ...r, balance: r.paid - r.owed }))
  ledger.sort((a, b) => b.balance - a.balance)

  return { ledger, total, unassignedCost, orphanPaidCost, billableCount: billable.length }
}

/**
 * Gợi ý "ai nợ ai bao nhiêu" — ghép người dư với người nợ theo thuật toán greedy
 * để số lần chuyển tiền là ít nhất.
 */
export function suggestSettlements(ledger) {
  const EPS = 1 // bỏ qua lệch dưới 1đ
  // Kèm id: hai thành viên có thể trùng display_name (user_id NULL được phép
  // lặp), nên nơi gọi phải lọc theo id chứ không theo tên.
  const creditors = ledger
    .filter((r) => r.balance > EPS)
    .map((r) => ({ id: r.member.id, name: r.member.display_name, amount: r.balance }))
  const debtors = ledger
    .filter((r) => r.balance < -EPS)
    .map((r) => ({ id: r.member.id, name: r.member.display_name, amount: -r.balance }))

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const out = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    out.push({
      from: debtors[i].name,
      to: creditors[j].name,
      fromId: debtors[i].id,
      toId: creditors[j].id,
      amount
    })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if (debtors[i].amount <= EPS) i += 1
    if (creditors[j].amount <= EPS) j += 1
  }
  return out
}

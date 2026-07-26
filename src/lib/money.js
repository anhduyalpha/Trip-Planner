// ============================================================
//  Chia tiền nhóm
//  Quy tắc: chi phí mỗi event chia đều cho các thành viên được assign.
//  Event bị Hủy không tính vào chi tiêu.
// ============================================================

export const fmtVND = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  )

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

  const billable = events.filter(
    (e) => e.approval === 'approved' && e.status !== 'cancelled' && Number(e.cost) > 0
  )

  billable.forEach((e) => {
    const cost = Number(e.cost)
    const assigned = (e.assigned || []).filter((id) => rows.has(id))
    total += cost

    if (rows.has(e.payer_member_id)) rows.get(e.payer_member_id).paid += cost

    if (assigned.length === 0) {
      unassignedCost += cost
      return
    }
    const share = cost / assigned.length
    assigned.forEach((id) => {
      const r = rows.get(id)
      r.owed += share
      r.eventCount += 1
    })
  })

  const ledger = [...rows.values()].map((r) => ({ ...r, balance: r.paid - r.owed }))
  ledger.sort((a, b) => b.balance - a.balance)

  return { ledger, total, unassignedCost, billableCount: billable.length }
}

/**
 * Gợi ý "ai nợ ai bao nhiêu" — ghép người dư với người nợ theo thuật toán greedy
 * để số lần chuyển tiền là ít nhất.
 */
export function suggestSettlements(ledger) {
  const EPS = 1 // bỏ qua lệch dưới 1đ
  const creditors = ledger.filter((r) => r.balance > EPS).map((r) => ({ name: r.member.display_name, amount: r.balance }))
  const debtors = ledger.filter((r) => r.balance < -EPS).map((r) => ({ name: r.member.display_name, amount: -r.balance }))

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const out = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    out.push({ from: debtors[i].name, to: creditors[j].name, amount })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if (debtors[i].amount <= EPS) i += 1
    if (creditors[j].amount <= EPS) j += 1
  }
  return out
}

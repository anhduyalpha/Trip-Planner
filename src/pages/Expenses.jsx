import { useMemo } from 'react'
import { useTrip } from '../context/TripContext'
import { computeLedger, fmtVND, suggestSettlements } from '../lib/money'
import { fmtTime, dayKey } from '../lib/schedule'

export default function Expenses() {
  const { events, members, memberName } = useTrip()
  const { ledger, total, unassignedCost, billableCount } = useMemo(
    () => computeLedger(events, members),
    [events, members]
  )
  const settlements = useMemo(() => suggestSettlements(ledger), [ledger])

  const costEvents = events
    .filter((e) => e.approval === 'approved' && e.status !== 'cancelled' && Number(e.cost) > 0)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const perHead = members.length ? total / members.length : 0

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Chi tiêu</div>
          <h1>{fmtVND(total)}</h1>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat">
          <span className="eyebrow">Tổng chi phí chuyến đi</span>
          <span className="stat-num">{fmtVND(total)}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Trung bình mỗi người</span>
          <span className="stat-num">{fmtVND(perHead)}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Hoạt động có chi phí</span>
          <span className="stat-num">{billableCount}</span>
        </div>
      </div>

      {unassignedCost > 0 && (
        <div className="alert alert-error">
          {fmtVND(unassignedCost)} chưa chia được vì hoạt động chưa assign thành viên nào. Mở hoạt động đó và chọn người
          tham gia.
        </div>
      )}

      {/* Bảng cân đối */}
      <section className="panel">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Đã trả – phải trả = dư/nợ
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th className="num">Đã chi</th>
              <th className="num">Phải trả</th>
              <th className="num">Dư / nợ</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={r.member.id}>
                <td>
                  <strong>{r.member.display_name}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    tham gia {r.eventCount} hoạt động có chi phí
                  </div>
                </td>
                <td className="num">{fmtVND(r.paid)}</td>
                <td className="num">{fmtVND(r.owed)}</td>
                <td className={`num ${r.balance >= 0 ? 'pos' : 'neg'}`}>
                  {r.balance >= 0 ? '+' : '−'}
                  {fmtVND(Math.abs(r.balance))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ledger.length === 0 && <div className="empty" style={{ marginTop: 14 }}>Chưa có thành viên nào.</div>}
      </section>

      {/* Ai trả cho ai */}
      <section className="panel">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Ai nợ ai bao nhiêu
        </div>
        {settlements.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Cả nhóm đã cân bằng — không ai phải trả thêm cho ai.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 7 }}>
            {settlements.map((s, i) => (
              <li key={i}>
                <strong>{s.from}</strong> trả <strong>{s.to}</strong>{' '}
                <span className="mono" style={{ fontWeight: 700 }}>
                  {fmtVND(s.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 0, marginTop: 12 }}>
          Gợi ý được ghép sao cho số lần chuyển tiền là ít nhất.
        </p>
      </section>

      {/* Chi tiết từng hoạt động */}
      <section className="panel">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Chi tiết theo hoạt động
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Hoạt động</th>
              <th>Người trả</th>
              <th className="num">Số tiền</th>
              <th className="num">Chia đều</th>
            </tr>
          </thead>
          <tbody>
            {costEvents.map((e) => {
              const n = (e.assigned || []).length
              return (
                <tr key={e.id}>
                  <td>
                    <strong>{e.title}</strong>
                    <div className="muted mono" style={{ fontSize: '0.78rem' }}>
                      {dayKey(e.start_time)} · {fmtTime(e.start_time)}
                    </div>
                  </td>
                  <td>{memberName(e.payer_member_id)}</td>
                  <td className="num">{fmtVND(e.cost)}</td>
                  <td className="num">{n ? `${fmtVND(e.cost / n)} × ${n}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {costEvents.length === 0 && (
          <div className="empty" style={{ marginTop: 14 }}>Chưa có hoạt động nào phát sinh chi phí.</div>
        )}
      </section>
    </main>
  )
}

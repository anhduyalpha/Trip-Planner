import { useMemo } from 'react'
import { useTrip } from '../context/TripContext'
import { computeLedger, fmtVND, suggestSettlements } from '../lib/money'
import { echoDateTime } from '../lib/format'

export default function Expenses() {
  const { events, members, memberName } = useTrip()
  const { ledger, total, unassignedCost, orphanPaidCost, billableCount } = useMemo(
    () => computeLedger(events, members),
    [events, members]
  )
  // "Cân bằng" phải suy ra từ SỔ, không phải từ việc danh sách gợi ý rỗng.
  // Danh sách rỗng còn xảy ra khi người đã ứng tiền bị xóa khỏi nhóm: lúc đó
  // mọi số dư đều âm, không có chủ nợ nào để ghép, mà nhóm thì chưa cân bằng.
  const balanced = ledger.every((r) => Math.abs(r.balance) < 1)
  const settlements = useMemo(() => suggestSettlements(ledger), [ledger])

  const costEvents = events
    .filter((e) => e.approval === 'approved' && e.status !== 'cancelled' && Number(e.cost) > 0)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const perHead = members.length ? total / members.length : 0

  return (
    <main className="page" id="noi-dung-chinh" tabIndex={-1}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Chi tiêu</div>
          <h2>{fmtVND(total)}</h2>
        </div>
      </div>

      <div className="stat-grid">
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

      {orphanPaidCost > 0 && (
        <div className="alert alert-error">
          {fmtVND(orphanPaidCost)} do một người đã rời nhóm ứng trước. Khoản này vẫn được chia cho mọi người nhưng không
          ghi có cho ai, nên sổ dưới đây chưa cân. Mở lại hoạt động đó và chọn người đại diện trả.
        </div>
      )}

      {/* Bảng cân đối */}
      <section className="panel">
        <div className="eyebrow section-lbl">Số dư của từng người</div>
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Bảng dữ liệu, cuộn ngang được">
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
                  <div className="muted tiny">
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
        </div>
        {ledger.length === 0 && <div className="empty empty-inset">Chưa có thành viên nào.</div>}
      </section>

      {/* Ai trả cho ai */}
      <section className="panel">
        <div className="eyebrow section-lbl">
          Ai nợ ai bao nhiêu
        </div>
        {settlements.length === 0 ? (
          <p className="muted m-0">
            {balanced
              ? 'Cả nhóm đã cân bằng. Không ai phải trả thêm cho ai.'
              : 'Chưa ghép được ai với ai vì sổ đang lệch. Hãy xử lý cảnh báo phía trên trước.'}
          </p>
        ) : (
          <ul className="list-tight">
            {settlements.map((s, i) => (
              <li key={i}>
                <strong>{s.from}</strong> trả <strong>{s.to}</strong>{' '}
                <span className="mono strong">
                  {fmtVND(s.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted note-foot">
          Gợi ý được ghép sao cho số lần chuyển tiền là ít nhất.
        </p>
      </section>

      {/* Chi tiết từng hoạt động */}
      <section className="panel">
        <div className="eyebrow section-lbl">
          Chi tiết theo hoạt động
        </div>
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Bảng dữ liệu, cuộn ngang được">
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
                    <div className="muted mono tiny">{echoDateTime(e.start_time)}</div>
                  </td>
                  <td>{memberName(e.payer_member_id)}</td>
                  <td className="num">{fmtVND(e.cost)}</td>
                  <td className="num">{n ? `${fmtVND(e.cost / n)} × ${n}` : 'Chưa chia'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {costEvents.length === 0 && (
          <div className="empty empty-inset">Chưa có hoạt động nào phát sinh chi phí.</div>
        )}
      </section>
    </main>
  )
}

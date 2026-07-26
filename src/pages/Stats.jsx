import { useMemo } from 'react'
import { useTrip } from '../context/TripContext'
import { CATEGORIES, STATUSES, categoryLabel, deriveStatus, findOngoing, fmtTime } from '../lib/schedule'
import { computeLedger, fmtVND } from '../lib/money'

export default function Stats() {
  const { events, approvedEvents, members, now, pendingEvents } = useTrip()

  const byCategory = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        label: c.label,
        count: approvedEvents.filter((e) => e.category === c.value).length
      })).filter((r) => r.count > 0),
    [approvedEvents]
  )

  const byStatus = useMemo(
    () =>
      STATUSES.map((s) => ({
        label: s.label,
        tone: s.value,
        count: approvedEvents.filter((e) => deriveStatus(e, now) === s.value).length
      })),
    [approvedEvents, now]
  )

  const { ledger, total } = useMemo(() => computeLedger(events, members), [events, members])
  const ongoing = findOngoing(approvedEvents, now)
  const completed = approvedEvents.filter((e) => e.is_completed).length
  const topSpender = ledger[0]

  const spendByCategory = useMemo(() => {
    const map = new Map()
    approvedEvents
      .filter((e) => e.status !== 'cancelled' && Number(e.cost) > 0)
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.cost)))
    return [...map.entries()]
      .map(([cat, sum]) => ({ label: categoryLabel(cat), sum }))
      .sort((a, b) => b.sum - a.sum)
  }, [approvedEvents])

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Thống kê nhanh</div>
          <h1>Tổng quan chuyến đi</h1>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat">
          <span className="eyebrow">Hoạt động đã duyệt</span>
          <span className="stat-num">{approvedEvents.length}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Chờ duyệt</span>
          <span className="stat-num">{pendingEvents.length}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Đã hoàn thành</span>
          <span className="stat-num">{completed}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Thành viên</span>
          <span className="stat-num">{members.length}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Tổng chi phí</span>
          <span className="stat-num">{fmtVND(total)}</span>
        </div>
      </div>

      {/* Đang diễn ra */}
      <section className="panel">
        <div className="eyebrow">Đang diễn ra lúc {fmtTime(now)}</div>
        {ongoing.length === 0 ? (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Không có hoạt động nào đang diễn ra.
          </p>
        ) : (
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {ongoing.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong>{' '}
                <span className="mono muted">
                  {fmtTime(e.start_time)}–{fmtTime(e.end_time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Theo trạng thái */}
      <section className="panel">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Theo trạng thái
        </div>
        <div className="btn-row">
          {byStatus.map((s) => (
            <span key={s.label} className="chip" data-tone={s.tone}>
              {s.label}: {s.count}
            </span>
          ))}
        </div>
        <Bars rows={byStatus.filter((s) => s.count > 0).map((s) => ({ label: s.label, value: s.count }))} suffix="" />
      </section>

      {/* Theo loại hoạt động */}
      <section className="panel">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Theo loại hoạt động
        </div>
        {byCategory.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Chưa có dữ liệu.</p>
        ) : (
          <Bars rows={byCategory.map((c) => ({ label: c.label, value: c.count }))} />
        )}
      </section>

      {/* Chi phí theo loại */}
      <section className="panel">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Chi phí theo loại hoạt động
        </div>
        {spendByCategory.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Chưa phát sinh chi phí.</p>
        ) : (
          <Bars rows={spendByCategory.map((r) => ({ label: r.label, value: r.sum }))} money />
        )}
        {topSpender && total > 0 && (
          <p className="muted" style={{ fontSize: '0.86rem', marginBottom: 0, marginTop: 14 }}>
            Người ứng nhiều nhất: <strong>{topSpender.member.display_name}</strong> — {fmtVND(topSpender.paid)}
          </p>
        )}
      </section>
    </main>
  )
}

function Bars({ rows, money = false }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="bars" style={{ marginTop: 14 }}>
      {rows.map((r) => (
        <div className={`bar-row${money ? ' wide' : ''}`} key={r.label}>
          <span>{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="num">{money ? new Intl.NumberFormat('vi-VN').format(Math.round(r.value)) : r.value}</span>
        </div>
      ))}
    </div>
  )
}

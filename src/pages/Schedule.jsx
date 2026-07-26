import { useMemo, useState } from 'react'
import { useTrip } from '../context/TripContext'
import EventCard from '../components/EventCard'
import EventForm from '../components/EventForm'
import { dayKey, deriveStatus, findOngoing, fmtDayLabel, fmtTime, groupByDay } from '../lib/schedule'

export default function Schedule() {
  const { events, approvedEvents, now, isLead, swapEventSlots } = useTrip()
  const [editing, setEditing] = useState(null) // null | 'new' | event
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  const days = useMemo(() => groupByDay(approvedEvents), [approvedEvents])
  const waiting = useMemo(() => events.filter((e) => e.approval !== 'approved'), [events])
  const ongoing = findOngoing(approvedEvents, now)

  const swapByIndex = async (list, from, to) => {
    if (to < 0 || to >= list.length) return
    await swapEventSlots(list[from], list[to])
  }

  const onDrop = async (dayEvents, targetId) => {
    setOverId(null)
    const from = dayEvents.findIndex((e) => e.id === dragId)
    const to = dayEvents.findIndex((e) => e.id === targetId)
    setDragId(null)
    if (from < 0 || to < 0 || from === to) return
    await swapEventSlots(dayEvents[from], dayEvents[to])
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Lịch trình</div>
          <h1>{approvedEvents.length} hoạt động đã duyệt</h1>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + Thêm hoạt động
        </button>
      </div>

      {/* Đang diễn ra ngay lúc này */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="eyebrow">Ngay lúc này</div>
        {ongoing.length === 0 ? (
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Không có hoạt động nào đang diễn ra.
          </p>
        ) : (
          ongoing.map((e) => (
            <h3 key={e.id} style={{ marginTop: 4 }}>
              {e.title} <span className="mono muted" style={{ fontSize: '0.84rem', fontWeight: 400 }}>
                đến {fmtTime(e.end_time)}
              </span>
            </h3>
          ))
        )}
      </div>

      {/* Chờ duyệt */}
      {waiting.length > 0 && (
        <section className="panel" style={{ marginBottom: 26, borderColor: 'var(--violet)' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Chờ duyệt · {waiting.length} hoạt động {isLead ? '— bạn cần xem qua' : ''}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {waiting.map((e) => (
              <EventCard key={e.id} event={e} onEdit={setEditing} />
            ))}
          </div>
        </section>
      )}

      {/* Đường ray lịch trình theo ngày */}
      {days.length === 0 ? (
        <div className="empty">
          <p>Lịch trình còn trống.</p>
          <p className="muted">Thêm hoạt động đầu tiên để bắt đầu dựng khung giờ cho cả nhóm.</p>
        </div>
      ) : (
        days.map(([key, dayEvents]) => {
          const isToday = dayKey(now) === key
          const nowIndex = isToday ? dayEvents.findIndex((e) => new Date(e.start_time) > now) : -1
          const nowAtEnd = isToday && nowIndex === -1

          return (
            <section className="day-block" key={key}>
              <div className="day-head">
                <h2>{fmtDayLabel(key)}</h2>
                <span className="day-count">{dayEvents.length} hoạt động</span>
              </div>

              <div className="rail">
                {dayEvents.map((ev, i) => (
                  <div key={ev.id}>
                    {i === nowIndex && <NowLine now={now} />}
                    <div className="slot" data-status={deriveStatus(ev, now)}>
                      <div className="slot-time">
                        {fmtTime(ev.start_time)}
                        <small>{fmtTime(ev.end_time)}</small>
                      </div>
                      <div
                        className={dragId === ev.id ? 'dragging' : overId === ev.id ? 'drop-target' : ''}
                        style={{ borderRadius: 'var(--radius)' }}
                      >
                        <EventCard
                          event={ev}
                          onEdit={setEditing}
                          onMoveUp={() => swapByIndex(dayEvents, i, i - 1)}
                          onMoveDown={() => swapByIndex(dayEvents, i, i + 1)}
                          dragProps={{
                            draggable: true,
                            onDragStart: () => setDragId(ev.id),
                            onDragEnd: () => {
                              setDragId(null)
                              setOverId(null)
                            },
                            onDragOver: (e) => {
                              e.preventDefault()
                              if (dragId && dragId !== ev.id) setOverId(ev.id)
                            },
                            onDragLeave: () => setOverId((cur) => (cur === ev.id ? null : cur)),
                            onDrop: (e) => {
                              e.preventDefault()
                              onDrop(dayEvents, ev.id)
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {nowAtEnd && <NowLine now={now} />}
              </div>
            </section>
          )
        })
      )}

      <p className="muted" style={{ fontSize: '0.84rem', marginTop: 8 }}>
        Kéo một thẻ và thả lên thẻ khác trong cùng ngày để đổi khung giờ. Trên điện thoại dùng nút ↑ ↓.
      </p>

      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

function NowLine({ now }) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return (
    <div className="now-line">
      <span className="now-tag">BÂY GIỜ {hh}:{mm}</span>
    </div>
  )
}

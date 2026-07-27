import { useMemo, useState } from 'react'
import { useTrip } from '../context/TripContext'
import EventCard from '../components/EventCard'
import EventForm from '../components/EventForm'
import { dayKey, deriveStatus, endDayOffset, findOngoing, fmtDayLabel, fmtTime, groupByDay } from '../lib/schedule'

export default function Schedule() {
  const { events, approvedEvents, now, isLead, swapEventSlots } = useTrip()
  const [editing, setEditing] = useState(null) // null | 'new' | event
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  // Đổi chỗ bằng bàn phím không có phản hồi nào ngoài việc thẻ nhảy vị trí,
  // người dùng trình đọc màn hình không biết đã xảy ra chuyện gì (WCAG 4.1.3).
  const [liveMsg, setLiveMsg] = useState('')
  const [error, setError] = useState('')

  const days = useMemo(() => groupByDay(approvedEvents), [approvedEvents])
  const waiting = useMemo(() => events.filter((e) => e.approval !== 'approved'), [events])
  const ongoing = findOngoing(approvedEvents, now)

  const swapByIndex = async (list, from, to) => {
    if (to < 0 || to >= list.length) return
    try {
      await swapEventSlots(list[from], list[to])
      setError('')
      setLiveMsg(`Đã đổi khung giờ: ${list[from].title} nay ở vị trí ${to + 1} trong ngày.`)
    } catch (e) {
      setLiveMsg('')
      setError(e.message || 'Không đổi được khung giờ.')
    }
  }

  const onDrop = async (dayEvents, targetId) => {
    setOverId(null)
    const from = dayEvents.findIndex((e) => e.id === dragId)
    const to = dayEvents.findIndex((e) => e.id === targetId)
    setDragId(null)
    if (from < 0 || to < 0 || from === to) return
    await swapByIndex(dayEvents, from, to)
  }

  return (
    <main className="page" id="noi-dung-chinh" tabIndex={-1}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Lịch trình</div>
          <h2>{approvedEvents.length} hoạt động đã duyệt</h2>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + Thêm hoạt động
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {/* Thông báo cho trình đọc màn hình sau mỗi lần đổi khung giờ */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </p>

      {/* Đang diễn ra ngay lúc này */}
      <div className="panel panel-now">
        <div className="eyebrow">Ngay lúc này</div>
        {ongoing.length === 0 ? (
          <p className="muted m-0">
            Không có hoạt động nào đang diễn ra.
          </p>
        ) : (
          ongoing.map((e) => (
            <h3 key={e.id} className="ongoing-title">
              {e.title} <span className="mono muted ongoing-until">đến {fmtTime(e.end_time)}</span>
            </h3>
          ))
        )}
      </div>

      {/* Chờ duyệt */}
      {waiting.length > 0 && (
        <section className="panel panel-pending">
          <div className="eyebrow section-lbl">
            Chờ duyệt · {waiting.length} hoạt động {isLead ? '· bạn cần xem qua' : ''}
          </div>
          <div className="stack-10">
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
                {dayEvents.map((ev, i) => {
                  const dayOffset = endDayOffset(ev)
                  return (
                  <div key={ev.id}>
                    {i === nowIndex && <NowLine now={now} />}
                    <div className="slot" data-status={deriveStatus(ev, now)}>
                      <div className="slot-time">
                        {fmtTime(ev.start_time)}
                        {/* Event vắt qua nửa đêm chỉ nằm ở ngày bắt đầu, nên cột giờ
                            in ra "23:00 / 01:00" và trông như giờ kết thúc sớm hơn
                            giờ bắt đầu. Dấu +1 nói rõ là hôm sau. */}
                        <small>
                          {fmtTime(ev.end_time)}
                          {dayOffset > 0 && (
                            <b className="slot-nextday" title={`Kết thúc sau ${dayOffset} ngày`}>
                              {' '}+{dayOffset}
                            </b>
                          )}
                        </small>
                      </div>
                      <div
                        className={`drop-wrap${dragId === ev.id ? ' dragging' : overId === ev.id ? ' drop-target' : ''}`}
                      >
                        <EventCard
                          event={ev}
                          onEdit={setEditing}
                          onMoveUp={isLead && i > 0 ? () => swapByIndex(dayEvents, i, i - 1) : null}
                          onMoveDown={isLead && i < dayEvents.length - 1 ? () => swapByIndex(dayEvents, i, i + 1) : null}
                          canReorder={isLead && dayEvents.length > 1}
                          dragProps={
                            isLead
                              ? {
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
                                }
                              : {}
                          }
                        />
                      </div>
                    </div>
                  </div>
                  )
                })}
                {nowAtEnd && <NowLine now={now} />}
              </div>
            </section>
          )
        })
      )}

      {isLead && (
        <p className="muted page-note">
          Kéo một thẻ và thả lên thẻ khác trong cùng ngày để đổi khung giờ. Trên điện thoại dùng nút ↑ ↓.
        </p>
      )}

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

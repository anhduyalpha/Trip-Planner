import { useState } from 'react'
import { useTrip } from '../context/TripContext'
import { categoryLabel, deriveStatus, endDayOffset, fmtDuration, fmtTime, statusLabel } from '../lib/schedule'
import { fmtVND } from '../lib/money'

export default function EventCard({ event, dragProps = {}, onEdit, onMoveUp, onMoveDown, canReorder = false }) {
  const { now, members, isLead, canEditEvent, patchEvent, deleteEvent } = useTrip()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const status = deriveStatus(event, now)
  const dayOffset = endDayOffset(event)
  const editable = canEditEvent(event)
  const assignedMembers = members.filter((m) => (event.assigned || []).includes(m.id))
  // Math.floor cho khớp với cách computeLedger chia: mỗi người gánh phần
  // nguyên, phần dư vài đồng rải cho người đầu danh sách.
  const share =
    event.cost > 0 && assignedMembers.length ? Math.floor(event.cost / assignedMembers.length) : 0

  // Duyệt / Từ chối / Hoàn thành trước đây gọi patchEvent mà không await, không
  // bắt lỗi, không khoá nút: mất mạng thì promise vỡ trong im lặng, nhãn không
  // đổi, và người dùng bấm tiếp mấy lần nữa.
  const act = async (patch, fallback) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await patchEvent(event.id, patch)
    } catch (e) {
      setErr(e.message || fallback)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (busy) return
    if (!window.confirm(`Xóa hoạt động "${event.title}"?`)) return
    setBusy(true)
    setErr('')
    try {
      await deleteEvent(event.id)
    } catch (e) {
      setErr(e.message || 'Không xóa được. Hoạt động đã duyệt chỉ Lead mới xóa được.')
      setBusy(false)
    }
  }

  return (
    <article
      className={`ev${status === 'ongoing' ? ' pulse' : ''}`}
      data-status={status}
      {...dragProps}
    >
      <div className="ev-top">
        <div className={`ev-title${event.is_completed ? ' completed' : ''}`}>{event.title}</div>
        <span className="chip" data-tone={status}>
          {statusLabel(status)}
        </span>
        {event.approval === 'pending' && (
          <span className="chip" data-tone="pending">
            Chờ duyệt
          </span>
        )}
        {event.approval === 'rejected' && (
          <span className="chip" data-tone="cancelled">
            Bị từ chối
          </span>
        )}
      </div>

      <div className="ev-meta">
        <span className="chip" data-tone="cat">
          {categoryLabel(event.category)}
        </span>
        <span className="mono">
          {fmtTime(event.start_time)}-{fmtTime(event.end_time)}
          {dayOffset > 0 && <b className="slot-nextday"> +{dayOffset}</b>} ·{' '}
          {fmtDuration(event.start_time, event.end_time)}
        </span>
        {/* Emoji 📍 render ra một hình nhiều màu do hệ điều hành vẽ, lạc hẳn
            khỏi bảng màu hai tông của app và mỗi máy một kiểu. Dùng nét vẽ
            cùng độ dày 1.8 với icon đóng modal. */}
        {event.location && (
          <span className="ev-place">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M8 14.5S13 10 13 6.5a5 5 0 0 0-10 0C3 10 8 14.5 8 14.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="6.4" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {event.location}
          </span>
        )}
      </div>

      {event.description && <p className="ev-desc">{event.description}</p>}

      {assignedMembers.length > 0 && (
        <div className="avatars">
          {assignedMembers.map((m) => (
            <span key={m.id} className="pill" data-payer={String(m.id === event.payer_member_id)}>
              {m.display_name}
              {m.id === event.payer_member_id ? ' · trả' : ''}
            </span>
          ))}
        </div>
      )}

      {err && (
        <p className="ev-err" role="alert">
          {err}
        </p>
      )}

      <div className="ev-foot">
        <div className="ev-cost">
          {event.cost > 0 ? (
            <>
              {fmtVND(event.cost)}
              {share > 0 && <span className="muted"> · {fmtVND(share)}/người</span>}
            </>
          ) : (
            <span className="muted">Không phát sinh chi phí</span>
          )}
        </div>

        <div className="btn-row">
          {/* disabled ở hai đầu danh sách: trước đây nút vẫn bấm được nhưng
              không làm gì, và vẫn tự khai với trình đọc màn hình là dùng được. */}
          {canReorder && (
            <>
              <button
                className="btn btn-ghost btn-tiny"
                onClick={onMoveUp ?? undefined}
                disabled={busy || !onMoveUp}
                aria-label="Đổi khung giờ với hoạt động phía trên"
                title="Đổi khung giờ với hoạt động phía trên"
              >
                ↑
              </button>
              <button
                className="btn btn-ghost btn-tiny"
                onClick={onMoveDown ?? undefined}
                disabled={busy || !onMoveDown}
                aria-label="Đổi khung giờ với hoạt động phía dưới"
                title="Đổi khung giờ với hoạt động phía dưới"
              >
                ↓
              </button>
            </>
          )}

          {editable && (
            <button
              className="btn btn-ghost btn-tiny"
              disabled={busy}
              onClick={() => act({ is_completed: !event.is_completed }, 'Không đổi được trạng thái hoàn thành.')}
            >
              {event.is_completed ? 'Bỏ hoàn thành' : 'Hoàn thành'}
            </button>
          )}

          {isLead && event.approval !== 'approved' && (
            <>
              <button
                className="btn btn-teal btn-tiny"
                disabled={busy}
                onClick={() => act({ approval: 'approved' }, 'Không duyệt được hoạt động này.')}
              >
                Duyệt
              </button>
              {event.approval === 'pending' && (
                <button
                  className="btn btn-ghost btn-tiny"
                  disabled={busy}
                  onClick={() => act({ approval: 'rejected' }, 'Không từ chối được hoạt động này.')}
                >
                  Từ chối
                </button>
              )}
            </>
          )}

          {editable ? (
            <>
              <button className="btn btn-ghost btn-tiny" disabled={busy} onClick={() => onEdit(event)}>
                Sửa
              </button>
              <button className="btn btn-danger btn-tiny" disabled={busy} onClick={remove}>
                Xóa
              </button>
            </>
          ) : (
            <span className="muted tiny">
              Chỉ Lead sửa được
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

import { useTrip } from '../context/TripContext'
import { categoryLabel, deriveStatus, fmtDuration, fmtTime, statusLabel } from '../lib/schedule'
import { fmtVND } from '../lib/money'

export default function EventCard({ event, dragProps = {}, onEdit, onMoveUp, onMoveDown }) {
  const { now, members, isLead, canEditEvent, patchEvent, deleteEvent } = useTrip()
  const status = deriveStatus(event, now)
  const editable = canEditEvent(event)
  const assignedMembers = members.filter((m) => (event.assigned || []).includes(m.id))
  const share = event.cost > 0 && assignedMembers.length ? event.cost / assignedMembers.length : 0

  const remove = async () => {
    if (!window.confirm(`Xóa hoạt động "${event.title}"?`)) return
    try {
      await deleteEvent(event.id)
    } catch (e) {
      window.alert(e.message || 'Không xóa được. Event đã duyệt chỉ Lead mới xóa được.')
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
          {fmtTime(event.start_time)}–{fmtTime(event.end_time)} · {fmtDuration(event.start_time, event.end_time)}
        </span>
        {event.location && <span>📍 {event.location}</span>}
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
          {onMoveUp && (
            <>
              <button className="btn btn-ghost btn-tiny" onClick={onMoveUp} aria-label="Lên trên" title="Đổi khung giờ với event phía trên">
                ↑
              </button>
              <button className="btn btn-ghost btn-tiny" onClick={onMoveDown} aria-label="Xuống dưới" title="Đổi khung giờ với event phía dưới">
                ↓
              </button>
            </>
          )}

          {editable && (
            <button
              className="btn btn-ghost btn-tiny"
              onClick={() => patchEvent(event.id, { is_completed: !event.is_completed })}
            >
              {event.is_completed ? 'Bỏ hoàn thành' : 'Hoàn thành'}
            </button>
          )}

          {isLead && event.approval !== 'approved' && (
            <>
              <button className="btn btn-teal btn-tiny" onClick={() => patchEvent(event.id, { approval: 'approved' })}>
                Duyệt
              </button>
              {event.approval === 'pending' && (
                <button className="btn btn-ghost btn-tiny" onClick={() => patchEvent(event.id, { approval: 'rejected' })}>
                  Từ chối
                </button>
              )}
            </>
          )}

          {editable ? (
            <>
              <button className="btn btn-ghost btn-tiny" onClick={() => onEdit(event)}>
                Sửa
              </button>
              <button className="btn btn-danger btn-tiny" onClick={remove}>
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

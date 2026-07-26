import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { useTrip } from '../context/TripContext'
import { CATEGORIES, MANUAL_STATUSES, statusLabel, toLocalInput, validateEvent } from '../lib/schedule'
import { echoDateTime, initials } from '../lib/format'
import { fmtVND } from '../lib/money'

const blank = () => {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    title: '',
    description: '',
    start_time: toLocalInput(start),
    end_time: toLocalInput(end),
    location: '',
    category: 'other',
    status: 'upcoming',
    is_completed: false,
    cost: '',
    payer_member_id: '',
    assigned: []
  }
}

export default function EventForm({ event, onClose }) {
  const { members, events, saveEvent, isLead } = useTrip()
  const editing = Boolean(event)

  const [form, setForm] = useState(() =>
    editing
      ? {
          title: event.title,
          description: event.description ?? '',
          start_time: toLocalInput(event.start_time),
          end_time: toLocalInput(event.end_time),
          location: event.location ?? '',
          category: event.category,
          status: MANUAL_STATUSES.includes(event.status) ? event.status : 'upcoming',
          is_completed: event.is_completed,
          cost: event.cost ? String(event.cost) : '',
          payer_member_id: event.payer_member_id ?? '',
          assigned: event.assigned ?? []
        }
      : blank()
  )
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)

  const errRef = useRef(null)
  // Lỗi hiện ở ĐẦU thân cuộn -> nếu người dùng đang ở cuối form sẽ không thấy.
  useEffect(() => {
    if (errors.length) errRef.current?.focus()
  }, [errors])

  const allOn = members.length > 0 && form.assigned.length === members.length
  const toggleAll = () => setForm((f) => ({ ...f, assigned: allOn ? [] : members.map((m) => m.id) }))

  const perHead = useMemo(() => {
    const c = Number(form.cost)
    if (!c || !form.assigned.length) return null
    return Math.round(c / form.assigned.length)
  }, [form.cost, form.assigned.length])

  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: v }))
  }

  const toggleAssigned = (id) =>
    setForm((f) => ({
      ...f,
      assigned: f.assigned.includes(id) ? f.assigned.filter((x) => x !== id) : [...f.assigned, id]
    }))

  const submit = async () => {
    const pool = events.filter((e) => e.approval !== 'rejected')
    const found = validateEvent(form, pool, event?.id ?? null)
    setErrors(found)
    if (found.length) return

    setSaving(true)
    try {
      await saveEvent(form, event?.id ?? null)
      onClose()
    } catch (err) {
      setErrors([err.message || 'Lưu không thành công.'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      kicker={editing ? 'Sửa hoạt động' : 'Hoạt động mới'}
      title={editing ? 'Sửa hoạt động' : 'Thêm hoạt động'}
      subtitle="Điền khung giờ rồi chọn người tham gia. Chi phí tự chia đều cho nhóm đó."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          {perHead !== null && (
            <span className="modal-foot-note">
              Mỗi người <b className="mono">{fmtVND(perHead)}</b>
            </span>
          )}
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button className="btn" type="button" onClick={submit} disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? 'Đang lưu…' : 'Lưu hoạt động'}
          </button>
        </>
      }
    >
      {errors.length > 0 && (
        <div className="alert alert-error" role="alert" tabIndex={-1} ref={errRef}>
          <strong className="alert-title">Chưa lưu được: {errors.length} vấn đề</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!editing && !isLead && (
        <div className="alert alert-ok">
          Bạn là Member nên hoạt động sẽ ở trạng thái <strong>Chờ duyệt</strong> cho tới khi Lead duyệt.
        </div>
      )}

      <section className="form-sec">
        <h4 className="form-sec-title">Nội dung</h4>
        <div className="field">
          <label htmlFor="ev-title">
            Tiêu đề{' '}
            <b className="req" aria-hidden="true">
              *
            </b>
          </label>
          <input
            id="ev-title"
            data-autofocus
            value={form.title}
            onChange={set('title')}
            placeholder="Ví dụ: Ăn bánh canh cá lóc"
          />
        </div>
        <div className="field">
          <label htmlFor="ev-desc">Mô tả</label>
          <textarea id="ev-desc" value={form.description} onChange={set('description')} />
        </div>
      </section>

      <section className="form-sec">
        <h4 className="form-sec-title">Thời gian &amp; địa điểm</h4>
        <div className="grid2">
          <div className="field">
            <label htmlFor="ev-start">
              Bắt đầu{' '}
              <b className="req" aria-hidden="true">
                *
              </b>
            </label>
            <input
              id="ev-start"
              type="datetime-local"
              value={form.start_time}
              onChange={set('start_time')}
              aria-describedby="ev-start-echo"
            />
            <p className="field-echo" id="ev-start-echo">
              {echoDateTime(form.start_time)}
            </p>
          </div>
          <div className="field">
            <label htmlFor="ev-end">
              Kết thúc{' '}
              <b className="req" aria-hidden="true">
                *
              </b>
            </label>
            <input
              id="ev-end"
              type="datetime-local"
              value={form.end_time}
              onChange={set('end_time')}
              aria-describedby="ev-end-echo"
            />
            <p className="field-echo" id="ev-end-echo">
              {echoDateTime(form.end_time)}
            </p>
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="ev-loc">Địa điểm</label>
            <input id="ev-loc" value={form.location} onChange={set('location')} placeholder="Quán Cô Ba, 12 Lê Lợi" />
          </div>
          <div className="field">
            <label htmlFor="ev-cat">Loại hoạt động</label>
            <select id="ev-cat" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="form-sec">
        <h4 className="form-sec-title">Chi phí &amp; phân công</h4>
        <div className="grid2">
          <div className="field">
            <label htmlFor="ev-cost">Chi phí (VND)</label>
            <input
              id="ev-cost"
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              value={form.cost}
              onChange={set('cost')}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label htmlFor="ev-payer">Người đại diện trả</label>
            <select id="ev-payer" value={form.payer_member_id} onChange={set('payer_member_id')}>
              <option value="">Chưa chọn</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field" role="group" aria-labelledby="ev-assigned-lbl">
          <div className="check-head">
            <span className="lbl" id="ev-assigned-lbl">
              Ai tham gia?{' '}
              <span className="lbl-count mono">
                {form.assigned.length}/{members.length}
              </span>
            </span>
            {members.length > 0 && (
              <button className="link-btn" type="button" onClick={toggleAll}>
                {allOn ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            )}
          </div>
          {members.length === 0 ? (
            <p className="field-help">Chưa có thành viên nào. Thêm ở tab Thành viên trước.</p>
          ) : (
            <>
              <div className="checklist">
                {members.map((m) => (
                  <label className="person" key={m.id}>
                    <input
                      type="checkbox"
                      checked={form.assigned.includes(m.id)}
                      onChange={() => toggleAssigned(m.id)}
                    />
                    <span className="person-face mono" aria-hidden="true">
                      {initials(m.display_name)}
                    </span>
                    <span className="person-name">{m.display_name}</span>
                  </label>
                ))}
              </div>
              <p className="field-help">Chi phí chia đều cho những người được chọn.</p>
            </>
          )}
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="ev-status">Trạng thái</label>
            <select id="ev-status" value={form.status} onChange={set('status')} aria-describedby="ev-status-help">
              {MANUAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <p className="field-help" id="ev-status-help">
              Sắp tới → Đang diễn ra → Đã xong do hệ thống tự chuyển theo giờ. Chọn Tạm hoãn hoặc Hủy để tắt tự
              động.
            </p>
          </div>
          <div className="field">
            <span className="lbl">Hoàn thành</span>
            <label className="check-row">
              <input type="checkbox" checked={form.is_completed} onChange={set('is_completed')} />
              <span>Đánh dấu đã hoàn thành</span>
            </label>
          </div>
        </div>
      </section>
    </Modal>
  )
}

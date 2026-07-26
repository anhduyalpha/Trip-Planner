import { useState } from 'react'
import { useTrip } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

const ROLE_SUGGESTIONS = ['Dẫn đoàn', 'Xem map', 'Nấu ăn', 'Chụp hình', 'Giữ quỹ', 'Chơi nhạc']

export default function Members() {
  const { trip, members, events, isLead, me, addMember, updateMember, removeMember } = useTrip()
  const { user } = useAuth()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const remove = async (m) => {
    const assignedCount = events.filter((e) => (e.assigned || []).includes(m.id)).length
    const warn = assignedCount
      ? `\n${m.display_name} đang được assign vào ${assignedCount} hoạt động — các assign đó sẽ mất.`
      : ''
    if (!window.confirm(`Xóa ${m.display_name} khỏi chuyến đi?${warn}`)) return
    try {
      await removeMember(m.id)
      setError('')
    } catch (e) {
      setError(e.message || 'Chỉ Lead xóa được thành viên.')
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Nhóm</div>
          <h1>{members.length} thành viên</h1>
        </div>
        <div className="btn-row">
          <span className="code-badge">Mã tham gia: {trip?.join_code}</span>
          {isLead && (
            <button className="btn" onClick={() => setShowAdd(true)}>
              + Thêm thành viên
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Vai trò</th>
              <th>Quyền</th>
              <th>Tài khoản</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const canEditRow = isLead || m.user_id === user?.id
              return (
                <tr key={m.id}>
                  <td>
                    <strong>{m.display_name}</strong>
                    {m.id === me?.id && <span className="muted"> · bạn</span>}
                  </td>
                  <td className="muted">{m.role_desc || '—'}</td>
                  <td>
                    <span className="chip" data-tone={m.permission === 'lead' ? 'done' : 'upcoming'}>
                      {m.permission === 'lead' ? 'Lead' : 'Member'}
                    </span>
                  </td>
                  <td className="muted">{m.user_id ? 'Đã liên kết' : 'Chưa có tài khoản'}</td>
                  <td>
                    <div className="btn-row btn-row--end">
                      {canEditRow && (
                        <button className="btn btn-ghost btn-tiny" onClick={() => setEditing(m)}>
                          Sửa
                        </button>
                      )}
                      {isLead && m.permission !== 'lead' && (
                        <button className="btn btn-danger btn-tiny" onClick={() => remove(m)}>
                          Xóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {members.length === 0 && <div className="empty empty-inset">Chưa có thành viên nào.</div>}
      </div>

      <div className="panel">
        <div className="eyebrow">Phân quyền đang áp dụng</div>
        <ul className="muted list-tight">
          <li>
            <strong>Lead</strong> — tạo/sửa/xóa mọi hoạt động, duyệt hoạt động của người khác, thêm và xóa thành viên.
          </li>
          <li>
            <strong>Member</strong> — tạo hoạt động (vào trạng thái Chờ duyệt), sửa/xóa hoạt động do chính mình tạo và
            chưa được duyệt. Không xóa được hoạt động đã duyệt.
          </li>
        </ul>
      </div>

      {showAdd && <MemberForm onClose={() => setShowAdd(false)} onSave={addMember} />}
      {editing && (
        <MemberForm
          member={editing}
          onClose={() => setEditing(null)}
          onSave={(name, role) => updateMember(editing.id, { display_name: name, role_desc: role })}
        />
      )}
    </main>
  )
}

function MemberForm({ member, onClose, onSave }) {
  const [name, setName] = useState(member?.display_name ?? '')
  const [role, setRole] = useState(member?.role_desc ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      setError('Tên không được để trống.')
      return
    }
    setBusy(true)
    try {
      await onSave(name, role)
      onClose()
    } catch (e) {
      setError(e.message || 'Lưu không thành công.')
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker={member ? 'Hồ sơ thành viên' : 'Thành viên mới'}
      title={member ? 'Sửa thành viên' : 'Thêm thành viên'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button className="btn" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="m-name">
          Tên{' '}
          <b className="req" aria-hidden="true">
            *
          </b>
        </label>
        <input id="m-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="m-role">Vai trò trong nhóm</label>
        <input
          id="m-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          list="role-list"
          placeholder="Dẫn đoàn / xem map / nấu ăn…"
        />
        <datalist id="role-list">
          {ROLE_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      {!member && (
        <p className="field-help">
          Thành viên thêm tay chưa có tài khoản — vẫn assign vào hoạt động và chia tiền được. Muốn họ tự đăng nhập,
          gửi mã tham gia của chuyến đi.
        </p>
      )}
    </Modal>
  )
}

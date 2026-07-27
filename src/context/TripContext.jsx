import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const TripContext = createContext(null)
export const useTrip = () => useContext(TripContext)

// `now` trong context CHỈ dùng để suy ra trạng thái theo giờ, không hiển thị
// giây ở đâu cả. Trước đây nó nhảy mỗi giây và nằm trong `value`, nên mọi trang
// đọc useTrip đều render lại 1 lần/giây. Đồng hồ giây nay là <LiveClock/> riêng.
const TICK_MS = 30000 // nhịp suy ra lại trạng thái
const SYNC_MS = 30000 // nhịp đồng bộ trạng thái xuống database

export function TripProvider({ tripId, children }) {
  const { user } = useAuth()
  const [trip, setTrip] = useState(null)
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(new Date())

  // ---------- Tải dữ liệu ----------
  // load() được gọi từ 6 nguồn: effect đầu, nhịp đồng bộ 30s, 3 kênh realtime
  // và cuối mỗi lần ghi. Không có seqRef thì một lần tải cũ về sau sẽ ghi đè
  // kết quả mới -> kéo thả xong thấy thứ tự cũ, hoặc tệ hơn là đổi sang chuyến
  // đi khác mà màn hình vẫn là dữ liệu chuyến cũ (TripProvider KHÔNG remount
  // khi đổi :tripId, chỉ `load` đổi định danh).
  const seqRef = useRef(0)
  const tripIdRef = useRef(tripId)
  tripIdRef.current = tripId

  const load = useCallback(async () => {
    if (!tripId) return
    const requestedTripId = tripId
    const seq = ++seqRef.current
    const [tripRes, memberRes, eventRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase.from('trip_members').select('*').eq('trip_id', tripId).order('created_at'),
      supabase
        .from('events')
        .select('*, event_members(member_id)')
        .eq('trip_id', tripId)
        .order('start_time')
    ])

    // Đặt TRƯỚC nhánh lỗi: một kết quả cũ không được phép ghi đè cả dữ liệu
    // lẫn thông báo lỗi của lần tải mới hơn.
    if (seq !== seqRef.current || requestedTripId !== tripIdRef.current) return

    // Phân biệt "không có quyền" với "mạng hỏng". Gộp hai thứ này lại thì đứt
    // mạng cũng bị báo là không phải thành viên, và người dùng không có nút thử lại.
    if (tripRes.error) {
      setError(`Không tải được chuyến đi. ${tripRes.error.message}`)
      setLoading(false)
      return
    }
    if (!tripRes.data) {
      setError('Không tìm thấy chuyến đi, hoặc bạn không phải thành viên.')
      setLoading(false)
      return
    }

    // `?? []` nuốt lỗi: query thành viên hỏng thì màn hình báo "0 thành viên"
    // y như một chuyến đi rỗng thật, và Chi tiêu/Thống kê hiện toàn số 0.
    if (memberRes.error || eventRes.error) {
      setError(
        `Tải được chuyến đi nhưng thiếu dữ liệu. ${(memberRes.error || eventRes.error).message}`
      )
      setLoading(false)
      return
    }

    setTrip(tripRes.data)
    setMembers(memberRes.data ?? [])
    setEvents(
      (eventRes.data ?? []).map((e) => ({
        ...e,
        cost: Math.round(Number(e.cost)),
        assigned: (e.event_members ?? []).map((x) => x.member_id)
      }))
    )
    setError('')
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // ---------- Đồng hồ + realtime engine ----------
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!tripId) return
    let alive = true
    const run = () => {
      supabase.rpc('sync_trip_statuses', { p_trip: tripId }).then(({ error: e }) => {
        // Không có cờ này thì một RPC phát cho chuyến A về đích SAU khi đã
        // chuyển sang chuyến B sẽ gọi load() của closure cũ, và vì nó chạy
        // sau nên chiếm luôn seq mới nhất, ghi dữ liệu A đè lên B.
        if (alive && !e) load()
      })
    }
    run()
    const timer = setInterval(run, SYNC_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [tripId, load])

  // ---------- Realtime: thành viên khác thay đổi dữ liệu ----------
  useEffect(() => {
    if (!tripId) return
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `trip_id=eq.${tripId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${tripId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_members' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tripId, load])

  // ---------- Phân quyền ----------
  const me = useMemo(() => members.find((m) => m.user_id === user?.id) ?? null, [members, user?.id])
  const isLead = Boolean(trip && user && trip.lead_id === user.id)

  const canEditEvent = useCallback(
    (ev) => isLead || (ev.created_by === user?.id && ev.approval === 'pending'),
    [isLead, user?.id]
  )

  // ---------- CRUD event ----------
  const saveEvent = useCallback(
    async (draft, eventId = null) => {
      const payload = {
        trip_id: tripId,
        title: draft.title.trim(),
        description: draft.description?.trim() ?? '',
        start_time: new Date(draft.start_time).toISOString(),
        end_time: new Date(draft.end_time).toISOString(),
        location: draft.location?.trim() ?? '',
        category: draft.category,
        status: draft.status,
        is_completed: Boolean(draft.is_completed),
        cost: Number(draft.cost) || 0,
        payer_member_id: draft.payer_member_id || null
      }

      let id = eventId
      if (eventId) {
        // `select('id')` để đếm được số dòng: RLS từ chối một UPDATE thì
        // PostgREST trả về thành công với 0 dòng, `error` là null. Không đếm
        // thì thao tác bị chặn trông y hệt thao tác thành công.
        const { data, error: e } = await supabase.from('events').update(payload).eq('id', eventId).select('id')
        if (e) throw e
        if (!data?.length) throw new Error('Bạn không có quyền sửa hoạt động này.')
      } else {
        const { data, error: e } = await supabase.from('events').insert(payload).select('id').single()
        if (e) throw e
        id = data.id
      }

      // Cập nhật danh sách thành viên được assign.
      // Thứ tự XOÁ rồi MỚI ghi là chỗ mất dữ liệu: nếu insert hỏng (mạng đứt,
      // RLS chặn) thì phân công cũ đã bị xoá sạch và không có gì khôi phục.
      // Nên đọc danh sách cũ trước, và nếu insert hỏng thì trả nó về chỗ cũ.
      const assigned = draft.assigned ?? []
      const { data: prevRows, error: prevErr } = await supabase
        .from('event_members')
        .select('member_id')
        .eq('event_id', id)
      if (prevErr) throw prevErr
      const prev = (prevRows ?? []).map((r) => r.member_id)

      const { error: delErr } = await supabase.from('event_members').delete().eq('event_id', id)
      if (delErr) throw delErr

      if (assigned.length) {
        const { error: insErr } = await supabase
          .from('event_members')
          .insert(assigned.map((member_id) => ({ event_id: id, member_id })))
        if (insErr) {
          // Hoàn nguyên phân công cũ để lần bấm Lưu sau không bắt đầu từ số 0.
          if (prev.length) {
            await supabase
              .from('event_members')
              .insert(prev.map((member_id) => ({ event_id: id, member_id })))
          }
          throw insErr
        }
      }
      await load()
      return id
    },
    [tripId, load]
  )

  // Mọi hàm ghi bên dưới đều `.select('id')` rồi kiểm tra số dòng. Lý do:
  // PostgREST trả 204 kèm error = null cho một UPDATE/DELETE không khớp dòng
  // nào, mà RLS chặn chính là trường hợp không khớp dòng nào. Chỉ xem `error`
  // thì thao tác bị từ chối sẽ được báo là thành công.
  const deleteEvent = useCallback(
    async (eventId) => {
      const { data, error: e } = await supabase.from('events').delete().eq('id', eventId).select('id')
      if (e) throw e
      if (!data?.length) throw new Error('Bạn không có quyền xóa hoạt động này.')
      await load()
    },
    [load]
  )

  const patchEvent = useCallback(
    async (eventId, patch) => {
      const { data, error: e } = await supabase.from('events').update(patch).eq('id', eventId).select('id')
      if (e) throw e
      if (!data?.length) throw new Error('Bạn không có quyền thay đổi hoạt động này.')
      await load()
    },
    [load]
  )

  /** Đổi chỗ khung giờ của 2 event (dùng cho drag & drop và nút ↑ ↓). */
  // Đổi chỗ hai khung giờ. Chạy TUẦN TỰ chứ không Promise.all: nếu lệnh thứ
  // hai hỏng mà lệnh đầu đã ghi, hai hoạt động sẽ cùng chiếm một khung giờ,
  // nên phải biết lệnh đầu thành công rồi mới đi tiếp và mới có gì để hoàn lại.
  const swapEventSlots = useCallback(
    async (a, b) => {
      const move = (id, from) =>
        supabase
          .from('events')
          .update({ start_time: from.start_time, end_time: from.end_time })
          .eq('id', id)
          .select('id')

      const first = await move(a.id, b)
      if (first.error) throw first.error
      // 0 dòng = RLS chặn. Member vẫn thấy nút ↑ ↓ trên hoạt động đã duyệt,
      // trước đây bấm vào là im lặng không có gì xảy ra.
      if (!first.data?.length) throw new Error('Bạn không có quyền đổi khung giờ của hoạt động này.')

      const second = await move(b.id, a)
      if (second.error || !second.data?.length) {
        // Trả hoạt động đầu về chỗ cũ, đừng để hai thẻ đè lên nhau.
        await move(a.id, a)
        throw second.error ?? new Error('Bạn không có quyền đổi khung giờ của hoạt động này.')
      }
      await load()
    },
    [load]
  )

  // ---------- CRUD thành viên ----------
  const addMember = useCallback(
    async (displayName, roleDesc) => {
      const { error: e } = await supabase
        .from('trip_members')
        .insert({ trip_id: tripId, display_name: displayName.trim(), role_desc: roleDesc.trim() })
      if (e) throw e
      await load()
    },
    [tripId, load]
  )

  const updateMember = useCallback(
    async (memberId, patch) => {
      const { data, error: e } = await supabase
        .from('trip_members')
        .update(patch)
        .eq('id', memberId)
        .select('id')
      if (e) throw e
      if (!data?.length) throw new Error('Bạn không có quyền sửa thành viên này.')
      await load()
    },
    [load]
  )

  const removeMember = useCallback(
    async (memberId) => {
      const { data, error: e } = await supabase
        .from('trip_members')
        .delete()
        .eq('id', memberId)
        .select('id')
      if (e) throw e
      if (!data?.length) throw new Error('Chỉ Lead xóa được thành viên.')
      await load()
    },
    [load]
  )

  const approvedEvents = useMemo(() => events.filter((e) => e.approval === 'approved'), [events])
  const pendingEvents = useMemo(() => events.filter((e) => e.approval === 'pending'), [events])
  const memberName = useCallback(
    (id) => members.find((m) => m.id === id)?.display_name ?? 'Đã rời nhóm',
    [members]
  )

  // Object literal dựng mới mỗi lần render sẽ ép MỌI consumer render lại kể cả
  // khi không có gì đổi, vì context so sánh theo tham chiếu.
  const value = useMemo(
    () => ({
      trip,
      members,
      events,
      approvedEvents,
      pendingEvents,
      loading,
      error,
      now,
      me,
      isLead,
      canEditEvent,
      reload: load,
      saveEvent,
      deleteEvent,
      patchEvent,
      swapEventSlots,
      addMember,
      updateMember,
      removeMember,
      memberName
    }),
    [
      trip,
      members,
      events,
      approvedEvents,
      pendingEvents,
      loading,
      error,
      now,
      me,
      isLead,
      canEditEvent,
      load,
      saveEvent,
      deleteEvent,
      patchEvent,
      swapEventSlots,
      addMember,
      updateMember,
      removeMember,
      memberName
    ]
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const TripContext = createContext(null)
export const useTrip = () => useContext(TripContext)

const TICK_MS = 1000 // nhịp đồng hồ hiển thị
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
  const load = useCallback(async () => {
    if (!tripId) return
    const [tripRes, memberRes, eventRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase.from('trip_members').select('*').eq('trip_id', tripId).order('created_at'),
      supabase
        .from('events')
        .select('*, event_members(member_id)')
        .eq('trip_id', tripId)
        .order('start_time')
    ])

    if (tripRes.error || !tripRes.data) {
      setError('Không tìm thấy chuyến đi, hoặc bạn không phải thành viên.')
      setLoading(false)
      return
    }

    setTrip(tripRes.data)
    setMembers(memberRes.data ?? [])
    setEvents(
      (eventRes.data ?? []).map((e) => ({
        ...e,
        cost: Number(e.cost),
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
    const run = () => {
      supabase.rpc('sync_trip_statuses', { p_trip: tripId }).then(({ error: e }) => {
        if (!e) load()
      })
    }
    run()
    const timer = setInterval(run, SYNC_MS)
    return () => clearInterval(timer)
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
        const { error: e } = await supabase.from('events').update(payload).eq('id', eventId)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.from('events').insert(payload).select('id').single()
        if (e) throw e
        id = data.id
      }

      // Cập nhật danh sách thành viên được assign
      await supabase.from('event_members').delete().eq('event_id', id)
      const assigned = draft.assigned ?? []
      if (assigned.length) {
        const { error: e } = await supabase
          .from('event_members')
          .insert(assigned.map((member_id) => ({ event_id: id, member_id })))
        if (e) throw e
      }
      await load()
      return id
    },
    [tripId, load]
  )

  const deleteEvent = useCallback(
    async (eventId) => {
      const { error: e } = await supabase.from('events').delete().eq('id', eventId)
      if (e) throw e
      await load()
    },
    [load]
  )

  const patchEvent = useCallback(
    async (eventId, patch) => {
      const { error: e } = await supabase.from('events').update(patch).eq('id', eventId)
      if (e) throw e
      await load()
    },
    [load]
  )

  /** Đổi chỗ khung giờ của 2 event (dùng cho drag & drop và nút ↑ ↓). */
  const swapEventSlots = useCallback(
    async (a, b) => {
      await Promise.all([
        supabase.from('events').update({ start_time: b.start_time, end_time: b.end_time }).eq('id', a.id),
        supabase.from('events').update({ start_time: a.start_time, end_time: a.end_time }).eq('id', b.id)
      ])
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
      const { error: e } = await supabase.from('trip_members').update(patch).eq('id', memberId)
      if (e) throw e
      await load()
    },
    [load]
  )

  const removeMember = useCallback(
    async (memberId) => {
      const { error: e } = await supabase.from('trip_members').delete().eq('id', memberId)
      if (e) throw e
      await load()
    },
    [load]
  )

  const value = {
    trip,
    members,
    events,
    approvedEvents: useMemo(() => events.filter((e) => e.approval === 'approved'), [events]),
    pendingEvents: useMemo(() => events.filter((e) => e.approval === 'pending'), [events]),
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
    memberName: (id) => members.find((m) => m.id === id)?.display_name ?? '—'
  }

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

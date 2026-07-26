// ============================================================
//  DASHBOARD — TRUNG TÂM ĐIỀU HÀNH (route /)
//  Hero biển đêm + thẻ kính "Bây giờ" -> hàng chỉ số -> 2 cột
//  (thẻ chuyến đi giàu dữ liệu | 24 giờ tới + sổ nợ + tham gia).
//  Mọi tổng hợp làm ở client vì database không có RPC đếm.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { fmtClock, fmtDuration, fmtTime } from '../lib/schedule'
import { fmtVND } from '../lib/money'
import { echoDate, echoRange } from '../lib/format'
import { buildOverview, buildTripCard, dateRangeLabel, sortCards } from '../lib/dashboard'

const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const CLOCK_MS = 1000 // chỉ nuôi <LiveClock/>, không kéo cả dashboard render lại
const TICK_MS = 30000 // nhịp suy ra lại trạng thái theo giờ

/** Tiếng Việt: tên riêng nằm ở cuối họ tên. */
const firstName = (profile, user) => {
  const full = (profile?.full_name ?? '').trim()
  if (full) return full.split(/\s+/).slice(-1)[0]
  return user?.email?.split('@')[0] ?? 'bạn'
}

export default function Trips() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const joinRef = useRef(null)

  const [trips, setTrips] = useState([])
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [stage, setStage] = useState('boot') // boot -> trips -> done
  const [fatal, setFatal] = useState('') // query 1 lỗi: không có gì để vẽ
  const [statsWarn, setStatsWarn] = useState('') // query 2/3 lỗi: vẫn vẽ thẻ, ẩn số
  const [showCreate, setShowCreate] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [now, setNow] = useState(() => new Date())

  // ---------- Tải dữ liệu: 2 đợt, 3 query ----------
  // seqRef: chỉ lần tải MỚI NHẤT được phép ghi state. Không có nó thì một lần
  // tải cũ đang bay có thể ghi đè lỗi/dữ liệu cũ lên kết quả mới (StrictMode
  // mount 2 lần, visibilitychange, nút Thử lại đều tạo lần chạy chồng nhau).
  const seqRef = useRef(0)
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    const mine = () => seq === seqRef.current
    setFatal('')
    setStatsWarn('')

    // Đợt 1 — danh sách chuyến đi. RLS đã lọc sẵn theo quyền.
    const { data: tripRows, error } = await supabase
      .from('trips')
      .select('id, name, description, start_date, end_date, lead_id, join_code, created_at')
      .order('created_at', { ascending: false })

    if (!mine()) return
    if (error) {
      setFatal(`Không tải được danh sách chuyến đi. ${error.message}`)
      setStage('done')
      return
    }

    const list = tripRows ?? []
    setTrips(list)
    // Lần đầu mới hạ về 'trips' để hiện skeleton; các lần nạp lại nền thì giữ
    // nguyên số cũ trên màn hình cho tới khi có số mới.
    if (!loadedOnce.current) setStage('trips')

    if (list.length === 0) {
      setMembers([])
      setEvents([])
      loadedOnce.current = true
      setStage('done')
      return
    }

    // Đợt 2 — hai query song song, giới hạn đúng các trip vừa lấy được.
    const ids = list.map((t) => t.id)
    const [mRes, eRes] = await Promise.all([
      supabase.from('trip_members').select('id, trip_id, user_id, display_name, permission').in('trip_id', ids),
      supabase
        .from('events')
        .select(
          'id, trip_id, title, start_time, end_time, location, category, status, approval, is_completed, cost, payer_member_id, created_by, event_members(member_id)'
        )
        .in('trip_id', ids)
        .order('start_time')
    ])

    if (!mine()) return
    if (mRes.error || eRes.error) {
      setStatsWarn('Đã có danh sách chuyến đi, nhưng chưa lấy được số liệu tổng hợp. Các ô số sẽ tạm để trống.')
    }

    setMembers(mRes.data ?? [])
    setEvents(
      (eRes.data ?? []).map((e) => ({
        ...e,
        cost: Number(e.cost),
        assigned: (e.event_members ?? []).map((x) => x.member_id)
      }))
    )
    loadedOnce.current = true
    setStage('done')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Nhịp thời gian: chỉ suy ra lại trạng thái từ dữ liệu đã có, không gọi network.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  // Quay lại tab thì nạp lại dữ liệu mới.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // ---------- Tổng hợp ở client ----------
  const cards = useMemo(() => {
    const mBy = new Map()
    const eBy = new Map()
    members.forEach((m) => {
      if (!mBy.has(m.trip_id)) mBy.set(m.trip_id, [])
      mBy.get(m.trip_id).push(m)
    })
    events.forEach((e) => {
      if (!eBy.has(e.trip_id)) eBy.set(e.trip_id, [])
      eBy.get(e.trip_id).push(e)
    })
    return sortCards(trips.map((t) => buildTripCard(t, mBy.get(t.id) ?? [], eBy.get(t.id) ?? [], user?.id, now)))
  }, [trips, members, events, user?.id, now])

  const overview = useMemo(() => buildOverview(cards, now), [cards, now])
  // Không có `!fatal` thì khi query đầu hỏng, mọi ô số sẽ khẳng định "0" từ dữ
  // liệu chưa từng tải được.
  const statsReady = stage === 'done' && !statsWarn && !fatal

  const join = async (e) => {
    e.preventDefault()
    setJoinError('')
    setJoining(true)
    const { data, error } = await supabase.rpc('join_trip', { p_code: joinCode.trim() })
    setJoining(false)
    if (error) {
      setJoinError(error.message)
      return
    }
    navigate(`/trip/${data}`)
  }

  const focusJoin = () => {
    const el = joinRef.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  const isEmpty = stage === 'done' && trips.length === 0 && !fatal

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Trung tâm điều hành</div>
          <h1>Chào {profile?.full_name ?? user?.email}</h1>
        </div>
        <button className="btn btn-ghost" onClick={signOut}>
          Đăng xuất
        </button>
      </header>

      <main className="page page--dash">
        <div className="dash">
          <section className="hero-sea">
            <div className="hero-main">
              <p className="mast-kicker hero-kicker">{isEmpty ? 'Bắt đầu' : 'Trung tâm điều hành'}</p>

              {isEmpty ? (
                <>
                  <h2 className="hero-h1">
                    Chưa có chuyến nào.
                    <em>Bắt đầu từ một cái tên.</em>
                  </h2>
                  <p className="hero-sub">
                    Tạo chuyến đi, hệ thống sinh cho bạn một mã 6 ký tự. Gửi mã đó cho cả nhóm là xong: mọi
                    người thấy cùng một lịch trình, trên cùng một cột giờ.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="hero-h1">
                    Lịch trình
                    <em>của {firstName(profile, user)}.</em>
                  </h2>
                  <p className="hero-sub">
                    <strong className="mono">{trips.length}</strong> chuyến đi
                    {statsReady && (
                      <>
                        {' · '}
                        <strong className="mono">{overview.activeCount}</strong> đang diễn ra
                        {' · '}
                        <strong className="mono">{overview.soon.length}</strong> hoạt động trong 24 giờ tới
                      </>
                    )}
                  </p>
                </>
              )}

              <div className="hero-actions">
                <button className="btn btn-plate btn-lg" onClick={() => setShowCreate(true)}>
                  + Tạo chuyến đi{isEmpty ? ' đầu tiên' : ''}
                </button>
                <button type="button" className="hero-link" onClick={focusJoin}>
                  Tham gia bằng mã ↓
                </button>
              </div>
            </div>

            {isEmpty ? <HeroSteps /> : <HeroNow overview={overview} ready={statsReady} />}
          </section>

          {fatal && (
            <div className="alert alert-error dash-alert" role="alert">
              <span>{fatal}</span>
              <button className="btn btn-ghost btn-tiny" onClick={load}>
                Thử lại
              </button>
            </div>
          )}
          {statsWarn && (
            <div className="alert alert-ok dash-alert" role="status">
              <span>{statsWarn}</span>
              <button className="btn btn-ghost btn-tiny" onClick={load}>
                Thử lại
              </button>
            </div>
          )}
          {statsReady && overview.orphanCount > 0 && (
            <div className="alert alert-ok dash-alert" role="status">
              <span>
                {overview.orphanCount} chuyến đi thiếu dòng thành viên của bạn nên chưa đọc được hoạt động. Mở
                chuyến đó và thêm bạn vào danh sách thành viên.
              </span>
            </div>
          )}

          {isEmpty ? (
            <>
              <BlankRail />
              <StepRow />
            </>
          ) : (
            <>
              <MetricRail overview={overview} ready={statsReady} />

              <div className="dash-grid">
                <div className="dash-main">
                  <div className="dash-head">
                    <p className="mast-kicker">Chuyến đi của bạn</p>
                    <h2 className="dash-h2">{stage === 'boot' ? 'Đang tải' : `${trips.length} chuyến`}</h2>
                  </div>

                  <div className="trip-list">
                    {stage === 'boot' ? (
                      <>
                        <SkeletonCard />
                        <SkeletonCard />
                      </>
                    ) : (
                      cards.map((c) => <TripCard key={c.trip.id} card={c} ready={statsReady} />)
                    )}
                  </div>
                </div>

                <aside className="dash-side">
                  <SoonPanel rows={overview.soon} ready={statsReady} />
                  <DebtPanel overview={overview} ready={statsReady} />
                  <JoinPanel
                    joinCode={joinCode}
                    setJoinCode={setJoinCode}
                    join={join}
                    joining={joining}
                    joinError={joinError}
                    joinRef={joinRef}
                  />
                </aside>
              </div>
            </>
          )}

          {isEmpty && (
            <section className="dash-join">
              <div className="join-note">
                <p className="mast-kicker">Tham gia nhóm</p>
                <h2 className="join-note-h">Có mã của nhóm?</h2>
                <p>Nhập 6 ký tự Lead gửi cho bạn. Bạn sẽ vào ngay lịch trình của cả nhóm.</p>
              </div>
              <JoinPanel
                joinCode={joinCode}
                setJoinCode={setJoinCode}
                join={join}
                joining={joining}
                joinError={joinError}
                joinRef={joinRef}
              />
            </section>
          )}
        </div>
      </main>

      {showCreate && <CreateTrip onClose={() => setShowCreate(false)} />}
    </>
  )
}

/* Đồng hồ sống — lá riêng để nhịp 1 giây chỉ render lại một node. */
function LiveClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), CLOCK_MS)
    return () => clearInterval(id)
  }, [])
  return <span className="clock hn-clock">{fmtClock(t)}</span>
}

/** Hộc đèn đồng hồ — nền tối cục bộ để amber dư tương phản. */
function ClockWell() {
  return (
    <div className="hn-well">
      <span className="eyebrow hn-well-label">Giờ hiện tại</span>
      <LiveClock />
    </div>
  )
}

function HeroNow({ overview, ready }) {
  const { ongoing, soon } = overview
  return (
    <aside className="hero-now">
      <ClockWell />
      <p className="eyebrow hn-eyebrow">Bây giờ</p>

      {!ready ? (
        <div className="hn-body">
          <span className="sk sk-line" />
          <span className="sk sk-line sk-line--short" />
        </div>
      ) : ongoing.length > 0 ? (
        <ul className="hn-list">
          {ongoing.slice(0, 3).map((e) => (
            <li key={e.id} className="hn-item">
              <span className="hn-dot pulse" aria-hidden="true" />
              <span className="hn-text">
                <span className="hn-title">{e.title}</span>
                <span className="hn-meta mono">
                  {e.tripName} · {fmtTime(e.start_time)}→{fmtTime(e.end_time)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : soon.length > 0 ? (
        <div className="hn-body">
          <p className="hn-idle">Không có hoạt động nào đang diễn ra. Kế tiếp:</p>
          <p className="hn-title">{soon[0].title}</p>
          <p className="hn-meta mono">
            {soon[0].tripName} · {fmtTime(soon[0].start_time)}
          </p>
        </div>
      ) : (
        <div className="hn-body">
          <p className="hn-idle">Chưa có hoạt động nào được lên lịch trong 24 giờ tới.</p>
        </div>
      )}
    </aside>
  )
}

function HeroSteps() {
  const steps = [
    'Tạo chuyến đi, bạn thành Lead',
    'Chia sẻ mã 6 ký tự cho cả nhóm',
    'Thả hoạt động vào đường ray giờ'
  ]
  return (
    <aside className="hero-now">
      <ClockWell />
      <p className="eyebrow hn-eyebrow">Ba bước</p>
      <ol className="hn-steps">
        {steps.map((s, i) => (
          <li key={s}>
            <span className="hn-step-num mono">{String(i + 1).padStart(2, '0')}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function MetricRail({ overview, ready }) {
  const owe = overview.net < 0
  // "Cân bằng" phải là KHÔNG CÒN khoản nào cả hai chiều: nợ ở chuyến này không
  // triệt tiêu được khoản người khác nợ mình ở chuyến khác.
  const balanced = overview.iOwe < 1 && overview.owedToMe < 1

  return (
    <div className="metric-rail">
      <Metric
        ready={ready}
        tone="ocean"
        label="Chuyến đang diễn ra"
        value={overview.activeCount}
        hint={
          overview.startingSoon
            ? `${overview.startingSoon} chuyến chưa tới ngày`
            : 'Không có chuyến nào chờ khởi hành'
        }
      />
      <Metric
        ready={ready}
        tone={overview.soon.length ? 'amber' : 'ocean'}
        label="Trong 24 giờ tới"
        value={overview.soon.length}
        hint={
          overview.soon.length
            ? `Gần nhất ${fmtTime(overview.soon[0].start_time)} · ${overview.soon[0].title}`
            : 'Lịch trống 24 giờ tới'
        }
      />
      <Metric
        ready={ready}
        tone={overview.needApproval ? 'violet' : 'ocean'}
        label="Cần bạn duyệt"
        value={overview.needApproval}
        hint={
          overview.needApproval
            ? overview.approvalTrip
            : overview.myPending
              ? `${overview.myPending} đề xuất của bạn đang chờ Lead`
              : 'Không có gì chờ duyệt'
        }
      />
      <Metric
        ready={ready}
        tone={balanced ? 'ocean' : owe ? 'rose' : 'ocean'}
        label="Số dư của bạn"
        value={fmtVND(overview.net)}
        hint={
          balanced
            ? 'Đã cân bằng'
            : owe
              ? `Bạn cần trả ${fmtVND(overview.iOwe)}`
              : `Nhóm cần trả bạn ${fmtVND(overview.owedToMe)}`
        }
      />
    </div>
  )
}

function Metric({ label, value, hint, tone, ready }) {
  return (
    <div className="metric" data-tone={tone}>
      <span className="eyebrow">{label}</span>
      {ready ? (
        <>
          <span className="metric-num mono" data-tone={tone}>
            {value}
          </span>
          <span className="metric-hint">{hint}</span>
        </>
      ) : (
        <>
          <span className="sk sk-num" />
          <span className="sk sk-line sk-line--short" />
        </>
      )}
    </div>
  )
}

function TripCard({ card, ready }) {
  const { trip, isLead, ongoing, next, phase } = card

  const nextLine = () => {
    if (ongoing.length > 0) return `Đang diễn ra: ${ongoing[0].title}`
    if (next) return `Kế tiếp ${fmtTime(next.start_time)} · ${next.title}`
    if (phase === 'past') return 'Chuyến đi đã kết thúc'
    if (card.eventCount === 0) return 'Chưa có hoạt động nào'
    return 'Không còn hoạt động sắp tới'
  }

  const showStats = ready && !card.orphanLead

  return (
    <Link
      to={`/trip/${trip.id}`}
      className="trip-card"
      style={{ '--p': showStats ? String(card.progress) : '0' }}
    >
      <div className="tc-top">
        <span className="chip" data-tone={isLead ? 'done' : 'upcoming'}>
          {isLead ? 'Lead' : 'Thành viên'}
        </span>
        {showStats && ongoing.length > 0 && (
          <span className="tc-live">
            <i aria-hidden="true" /> Đang diễn ra
          </span>
        )}
        {showStats && isLead && card.pendingCount > 0 && (
          <span className="chip" data-tone="pending">
            {card.pendingCount} chờ duyệt
          </span>
        )}
        <span className="code-badge tc-code">{trip.join_code}</span>
      </div>

      <h3 className="tc-name">{trip.name}</h3>
      {trip.description && <p className="tc-desc">{trip.description}</p>}

      {showStats ? <MiniTimeline timeline={card.timeline} /> : <span className="sk sk-tl" />}

      <div className="tc-facts">
        {showStats ? (
          <>
            <span className="tc-fact">
              <b className="mono">
                {card.doneCount}/{card.eventCount}
              </b>{' '}
              hoạt động xong
            </span>
            <span className="tc-fact">
              <b className="mono">{card.memberCount}</b> thành viên
            </span>
            <span className="tc-fact">
              <b className="mono">{fmtVND(card.totalCost)}</b> chi phí
            </span>
          </>
        ) : (
          <span className="sk sk-line" />
        )}
      </div>

      <div className="tc-foot">
        <span className="tc-when mono">{dateRangeLabel(trip)}</span>
        {showStats && <span className="tc-next">{nextLine()}</span>}
      </div>
    </Link>
  )
}

function MiniTimeline({ timeline }) {
  if (!timeline.cols.length) return <div className="tl tl--none" aria-hidden="true" />
  return (
    <div className="tl" role="img" aria-label={timeline.label}>
      {timeline.cols.map((c, i) => (
        <span
          key={c.key}
          className="tl-col"
          data-today={c.isToday ? 'true' : undefined}
          style={{ '--i': String(i) }}
        >
          <i
            className="tl-bar"
            style={{ height: c.count ? `${Math.max(16, (c.count / timeline.max) * 100)}%` : '0%' }}
          />
        </span>
      ))}
    </div>
  )
}

function SoonPanel({ rows, ready }) {
  return (
    <section className="panel">
      <div className="side-head">
        <span className="eyebrow">24 giờ tới</span>
      </div>
      {!ready ? (
        <div className="soon-list">
          <span className="sk sk-line" />
          <span className="sk sk-line" />
        </div>
      ) : rows.length === 0 ? (
        <p className="muted soon-none">Không có hoạt động nào trong 24 giờ tới.</p>
      ) : (
        <>
          <ul className="soon-list">
            {rows.slice(0, 6).map((e) => (
              <li key={e.id} className="soon-row">
                <span className="soon-time mono">
                  {fmtTime(e.start_time)}
                  <small>{fmtDuration(e.start_time, e.end_time)}</small>
                </span>
                <span className="soon-body">
                  <span className="soon-title">{e.title}</span>
                  <span className="soon-trip">{e.tripName}</span>
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 6 && <p className="soon-more mono">còn {rows.length - 6} hoạt động nữa</p>}
        </>
      )}
    </section>
  )
}

function DebtPanel({ overview, ready }) {
  const { debts } = overview
  return (
    <section className="panel">
      <div className="side-head">
        <span className="eyebrow">Sổ nợ của bạn</span>
      </div>
      {!ready ? (
        <div className="soon-list">
          <span className="sk sk-line" />
          <span className="sk sk-line" />
        </div>
      ) : debts.length === 0 ? (
        <p className="muted soon-none">Chưa có khoản nào cần chia. Sổ đang cân bằng.</p>
      ) : (
        <ul className="debt-list">
          {debts.slice(0, 6).map((d, i) => (
            <li key={`${d.tripId}-${d.fromId}-${d.toId}-${i}`} className="debt-row">
              <span className="debt-body">
                <span className="debt-who">{d.iPay ? `Bạn trả ${d.to}` : `${d.from} trả bạn`}</span>
                <span className="debt-trip">{d.tripName}</span>
              </span>
              <span className={`debt-amt mono ${d.iPay ? 'neg' : 'pos'}`}>{fmtVND(d.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function JoinPanel({ joinCode, setJoinCode, join, joining, joinError, joinRef }) {
  return (
    <section className="panel panel-join">
      <div className="eyebrow">Tham gia nhóm</div>
      <h3 className="join-h">Nhập mã chuyến đi</h3>
      {joinError && (
        <div className="alert alert-error" role="alert">
          {joinError}
        </div>
      )}
      <form onSubmit={join} className="join-form">
        <label className="sr-only" htmlFor="join-code">
          Mã chuyến đi 6 ký tự
        </label>
        <input
          id="join-code"
          ref={joinRef}
          className="mono join-input"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="VD: K7MP2X"
          maxLength={6}
          autoComplete="off"
          spellCheck="false"
          required
        />
        <button className="btn" disabled={joining}>
          {joining ? 'Đang vào…' : 'Tham gia'}
        </button>
      </form>
    </section>
  )
}

/* Trạng thái rỗng: xem trước đường ray (bán bản sắc bảng giờ ngay từ đầu) */
function BlankRail() {
  const rows = [
    { time: '08:00', bars: ['68%', '38%'], now: false },
    { time: '12:30', bars: ['46%'], now: false },
    { time: '19:00', bars: ['82%', '30%'], now: true }
  ]
  return (
    <section className="blank-rail" aria-hidden="true">
      <div className="blank-rail-head">
        <span className="mast-kicker">Xem trước</span>
        <span className="mono blank-rail-tag">Bảng giờ chuyến đi</span>
      </div>
      {rows.map((r) => (
        <div className="ghost-row" key={r.time}>
          <span className="ghost-time mono">{r.time}</span>
          <span className="ghost-bars">
            {r.bars.map((w, i) => (
              <span className="ghost-bar" key={i} style={{ width: w }} />
            ))}
            {r.now && <span className="ghost-now mono">Bây giờ</span>}
          </span>
        </div>
      ))}
    </section>
  )
}

function StepRow() {
  const steps = [
    ['01', 'Tạo chuyến đi', 'Đặt tên, chọn ngày đi và ngày về. Bạn tự động là Lead của chuyến.'],
    ['02', 'Chia mã cho nhóm', 'Mỗi chuyến có một mã 6 ký tự. Ai có mã là vào được ngay.'],
    ['03', 'Xếp lịch theo giờ', 'Kéo và thả thẻ hoạt động trên đường ray. Vạch "Bây giờ" tự chạy.']
  ]
  return (
    <div className="step-row">
      {steps.map(([n, h, p]) => (
        <section className="step" key={n}>
          <span className="step-num mono">{n}</span>
          <h3>{h}</h3>
          <p>{p}</p>
        </section>
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="trip-card trip-card--sk" aria-hidden="true">
      <div className="tc-top">
        <span className="sk sk-chip" />
        <span className="sk sk-chip sk-chip--wide" />
      </div>
      <span className="sk sk-title" />
      <span className="sk sk-line" />
      <span className="sk sk-tl" />
      <span className="sk sk-line sk-line--short" />
    </div>
  )
}

/* ============================================================
   Modal tạo chuyến đi. Không navigate nếu insert trip_members hỏng:
   events_select chỉ dựa vào is_trip_member, thiếu dòng đó thì mọi
   hoạt động bị RLS chặn và chuyến đi coi như chết.
   ============================================================ */
function CreateTrip({ onClose }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Trip đã tạo xong ở lần bấm trước: bấm lại chỉ thêm dòng thành viên còn
  // thiếu, KHÔNG tạo thêm một chuyến đi trùng nữa.
  const createdId = useRef(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Tên chuyến đi không được để trống.')
      return
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('Ngày về phải sau hoặc bằng ngày đi.')
      return
    }
    setBusy(true)
    setError('')

    let tripId = createdId.current
    if (!tripId) {
      const { data, error: err } = await supabase
        .from('trips')
        .insert({
          name: form.name.trim(),
          description: form.description.trim(),
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          lead_id: user.id,
          join_code: makeCode()
        })
        .select('id')
        .single()

      if (err) {
        setBusy(false)
        setError(err.message)
        return
      }
      tripId = data.id
      createdId.current = tripId
    }

    // Người tạo trip mặc định là Lead trong danh sách thành viên
    const { error: mErr } = await supabase.from('trip_members').insert({
      trip_id: tripId,
      user_id: user.id,
      display_name: profile?.full_name ?? 'Lead',
      role_desc: 'Dẫn đoàn',
      permission: 'lead'
    })

    setBusy(false)
    if (mErr) {
      setError(
        `Đã tạo chuyến đi nhưng chưa thêm được bạn vào danh sách thành viên (${mErr.message}). Bấm "Tạo chuyến đi" lần nữa để thử thêm lại — hệ thống sẽ không tạo trùng chuyến.`
      )
      return
    }
    navigate(`/trip/${tripId}`)
  }

  const range = echoRange(form.start_date, form.end_date)

  return (
    <Modal
      kicker="Chuyến đi mới"
      title="Tạo chuyến đi"
      subtitle="Đặt tên và chọn ngày. Hệ thống sinh mã 6 ký tự để cả nhóm vào cùng lịch trình."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {range && <span className="modal-foot-note mono">{range}</span>}
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button className="btn" type="button" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Đang tạo…' : 'Tạo chuyến đi'}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      <section className="form-sec">
        <h4 className="form-sec-title">Chuyến đi</h4>
        <div className="field">
          <label htmlFor="t-name">
            Tên chuyến đi{' '}
            <b className="req" aria-hidden="true">
              *
            </b>
          </label>
          <input
            id="t-name"
            data-autofocus
            value={form.name}
            onChange={set('name')}
            placeholder="Đà Lạt 3 ngày 2 đêm"
          />
        </div>
        <div className="field">
          <label htmlFor="t-desc">Mô tả</label>
          <textarea id="t-desc" value={form.description} onChange={set('description')} />
        </div>
      </section>

      <section className="form-sec">
        <h4 className="form-sec-title">Lịch đi</h4>
        <div className="grid2">
          <div className="field">
            <label htmlFor="t-start">Ngày đi</label>
            <input
              id="t-start"
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
              aria-describedby="t-start-echo"
            />
            <p className="field-echo" id="t-start-echo">
              {echoDate(form.start_date)}
            </p>
          </div>
          <div className="field">
            <label htmlFor="t-end">Ngày về</label>
            <input
              id="t-end"
              type="date"
              value={form.end_date}
              onChange={set('end_date')}
              min={form.start_date || undefined}
              aria-describedby="t-end-echo"
            />
            <p className="field-echo" id="t-end-echo">
              {echoDate(form.end_date)}
            </p>
          </div>
        </div>
        <p className="field-help">
          Bạn sẽ là Lead của chuyến đi này. Sau khi tạo, chia sẻ mã chuyến đi cho cả nhóm để mọi người tham gia.
        </p>
      </section>
    </Modal>
  )
}

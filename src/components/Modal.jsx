import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* Portal ra <body>: thoát mọi tổ tiên có overflow/transform/animation.
   (.page có animation pageIn — trong lúc chạy, một transform ở đó biến nó
   thành containing block của position:fixed và overlay bị neo sai chỗ.)
   Cũng tránh lỗi lấy mẫu backdrop-filter trong tổ tiên overflow của Safari < 18. */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export default function Modal({
  title,
  kicker,
  subtitle,
  onClose,
  children,
  footer,
  busy = false,
  dismissible = true
}) {
  const dialogRef = useRef(null)
  const bodyRef = useRef(null)
  const flowRef = useRef(null)
  const titleId = useId()
  const subId = useId()

  // Bắt phần tử đã mở modal NGAY TRONG RENDER ĐẦU — đợi tới effect thì focus
  // đã dời vào trong modal, không còn biết đường về.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement))
  const [edge, setEdge] = useState({ top: true, bottom: true })

  const requestClose = useCallback(() => {
    if (busy || !dismissible) return // đang lưu -> không cho đóng giữa chừng
    onClose()
  }, [busy, dismissible, onClose])

  /* (A) Rào focus. Khai báo ĐẦU TIÊN để cleanup của nó chạy TRƯỚC cleanup trả
     focus ở (D) — ngược lại thì rào sẽ giật focus khỏi nút vừa được trả.
     Bắt cả trường hợp focus rơi về <body> (bấm vào vùng trống của overlay):
     lúc đó keydown không nổi lên overlay nữa nên Esc và bẫy Tab sẽ chết. */
  useEffect(() => {
    const pull = () => {
      const root = dialogRef.current
      if (!root) return
      const a = document.activeElement
      if (!a || a === document.body || !root.contains(a)) root.focus({ preventScroll: true })
    }
    const onFocusIn = (e) => {
      const root = dialogRef.current
      if (root && !root.contains(e.target)) root.focus({ preventScroll: true })
    }
    const onFocusOut = () => {
      // focusout -> focus có thể về body mà KHÔNG bắn focusin. Kiểm ở tick sau.
      window.setTimeout(pull, 0)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  /* (A2) Chiều cao visualViewport: iOS Safari không hỗ trợ
     interactive-widget=resizes-content nên dvh không tụt khi bàn phím ảo bật,
     và chân modal bị bàn phím che. Đo thật rồi đưa vào CSS qua --vvh. */
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const sync = () => {
      const el = document.documentElement
      el.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
      // Chỉ đo chiều cao là chưa đủ: khi bàn phím iOS bật lên, vùng nhìn thấy
      // còn TRƯỢT xuống. Không bù offsetTop thì lớp phủ vẫn neo ở đỉnh layout
      // viewport và tấm sheet nằm phía sau bàn phím.
      el.style.setProperty('--vvtop', `${Math.round(vv.offsetTop)}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      document.documentElement.style.removeProperty('--vvh')
      document.documentElement.style.removeProperty('--vvtop')
    }
  }, [])

  /* (A3) Wallpaper phía sau đã bị lớp phủ che kín — cho nó ngừng vẽ để không
     đốt GPU vô ích suốt lúc modal mở. */
  useEffect(() => {
    document.documentElement.dataset.modalOpen = '1'
    return () => {
      delete document.documentElement.dataset.modalOpen
    }
  }, [])

  /* (B) Khoá cuộn trang, bù đúng bề rộng thanh cuộn thật (0 với thanh cuộn nổi). */
  useEffect(() => {
    const gap = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
    }
  }, [])

  /* (C) Focus phần tử đầu: ưu tiên [data-autofocus], sau đó control đầu tiên,
     cuối cùng là chính hộp thoại (tabIndex -1) để trình đọc màn hình đọc tiêu đề. */
  useEffect(() => {
    const root = dialogRef.current
    if (!root) return
    const first = root.querySelector('[data-autofocus]') || root.querySelector(FOCUSABLE)
    ;(first || root).focus({ preventScroll: true })
  }, [])

  /* (D) Trả focus về đúng nút đã mở. Khai báo CUỐI CÙNG. */
  useEffect(
    () => () => {
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true })
      }
    },
    [opener]
  )

  /* Esc + bẫy Tab. Focus luôn nằm trong .overlay nên keydown chắc chắn nổi lên đây. */
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      requestClose()
      return
    }
    if (e.key !== 'Tab') return
    const root = dialogRef.current
    if (!root) return
    const list = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    )
    if (list.length === 0) {
      e.preventDefault()
      root.focus()
      return
    }
    const first = list[0]
    const last = list[list.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  /* Bóng mép: chỉ hiện khi thân THẬT SỰ còn nội dung khuất phía trên/dưới. */
  const syncEdges = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const top = el.scrollTop <= 1
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    setEdge((p) => (p.top === top && p.bottom === bottom ? p : { top, bottom }))
  }, [])

  useEffect(() => {
    syncEdges()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(syncEdges)
    if (bodyRef.current) ro.observe(bodyRef.current)
    if (flowRef.current) ro.observe(flowRef.current) // nội dung cao lên (lỗi, thêm chip)
    return () => ro.disconnect()
  }, [syncEdges])

  return createPortal(
    <div
      className="overlay"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subId : undefined}
        aria-busy={busy || undefined}
        data-top={String(edge.top)}
        data-bottom={String(edge.bottom)}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="modal-head">
          <div className="modal-head-text">
            {kicker && <p className="modal-kicker">{kicker}</p>}
            <h3 id={titleId}>{title}</h3>
            {subtitle && (
              <p className="modal-sub" id={subId}>
                {subtitle}
              </p>
            )}
          </div>
          <button className="x-btn" type="button" onClick={requestClose} disabled={busy} aria-label="Đóng">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M3 3l10 10M13 3L3 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="modal-body" ref={bodyRef} onScroll={syncEdges}>
          <div className="modal-flow" ref={flowRef}>
            {children}
          </div>
        </div>

        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

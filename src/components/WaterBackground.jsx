import { useEffect, useRef, useState } from 'react'

// ============================================================
//  Nền mặt nước cho trang đăng nhập / đăng ký (v3).
//  WebGL thuần, 1 pass.
//  - Sóng nền: 4 sin định hướng + 2 lớp value-noise TUẦN HOÀN cuộn
//    ngược chiều (noise mod 128 đồng bộ cả 4 góc lattice -> không có
//    đường nứt; hash không dùng sin -> không phụ thuộc driver).
//  - Thời gian KHÔNG bao giờ lên GPU dạng số lớn: JS gửi pha đã mod 2π
//    và offset lattice đã mod 128 -> mở trang hàng giờ vẫn mượt.
//  - Con trỏ khuấy nước: vệt trail polyline (10 mẫu) dạng capsule, có
//    hõm + gờ nổi hai bên -> bám đúng đường cong tay, không thành thanh.
//  - Click: cặp vành lan tỏa (giữ nguyên cảm giác bản trước).
//  Fallback: reduced-motion -> gradient tĩnh; không WebGL/không highp ->
//  gradient động.
// ============================================================

const MAX_RIPPLES = 8
const TRAIL_N = 10
const TRAIL_STEP = 0.03 // uv: khoảng cách tối thiểu giữa 2 mẫu trail
const TRAIL_LIFE = 0.9 // giây: tuổi thọ một mẫu
const SPEED_CAP = 5 // uv/s: chặn nhảy vị trí do teleport con trỏ
const NP = 128 // chu kỳ lattice của noise (phải khớp hằng trong shader)
const TAU = Math.PI * 2

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_res;
uniform vec4 u_ph;                        // pha 4 sóng sin, đã mod 2π
uniform vec4 u_n1;                        // offset lattice: xy = noise 3.2, zw = noise 6.8
uniform vec4 u_n2;                        // offset lattice: xy = caustic 9.0, zw = caustic 11.0
uniform vec4 u_ripples[${MAX_RIPPLES}];   // xy = tâm, z = TUỔI (giây), w = biên độ
uniform vec3 u_trail[${TRAIL_N}];         // xy = điểm, z = độ tươi 1..0
uniform float u_wakeAmp;

const float NP = ${NP}.0;
const vec3 DEEP = vec3(0.004, 0.016, 0.047);
const vec3 MID  = vec3(0.009, 0.093, 0.220);
const vec3 SHAL = vec3(0.042, 0.290, 0.442);
const vec3 SKY  = vec3(0.28, 0.44, 0.58);
const vec3 FOAM = vec3(0.62, 0.82, 0.90);

// Hash không dùng sin: không lệ thuộc cách driver rút gọn miền sin.
float hash21(vec2 q) {
  vec3 p3 = fract(vec3(q.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Value-noise tuần hoàn hoàn hảo: mod áp ĐỒNG BỘ cho cả 4 góc lattice
// (đây chính là chỗ bản v2 sai và sinh ra vệt sáng chạy ngang màn hình).
// Nội suy quintic -> C2, nên finite-difference normal không thấy nếp gấp.
float vnoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, NP);
  vec2 i1 = mod(i + 1.0, NP);
  float a = hash21(i0);
  float b = hash21(vec2(i1.x, i0.y));
  float c = hash21(vec2(i0.x, i1.y));
  float d = hash21(i1);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float ambient(vec2 p) {
  float h = 0.0;
  h += 0.0110 * sin(dot(p, vec2( 1.0,  0.55)) * 9.0  + u_ph.x);
  h += 0.0070 * sin(dot(p, vec2(-0.72, 1.0 )) * 16.0 + u_ph.y + 2.1);
  h += (vnoise(p * 3.2 + u_n1.xy) - 0.5) * 0.0170;
  h += (vnoise(p * 6.8 + u_n1.zw) - 0.5) * 0.0080;
  h += 0.0028 * sin(dot(p, vec2( 0.9, -0.4 )) * 41.0 + u_ph.z + 4.0);
  h += 0.0014 * sin(dot(p, vec2(-0.35, -1.0)) * 71.0 + u_ph.w + 1.2);
  return h;
}

float ripples(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = u_ripples[i];
    if (r.w <= 0.0) continue;
    float age = r.z;
    if (age > 3.0) continue;
    float d = length(p - r.xy);
    float front = d - age * 0.25;
    float f2 = front + 0.045;
    float ring  = sin(front * 60.0) * exp(-front * front * 900.0);
    float ring2 = sin(f2 * 60.0) * exp(-f2 * f2 * 900.0);
    h += 0.5 * r.w * (ring + 0.45 * ring2) * exp(-age * 2.2) * exp(-d * 1.5);
  }
  return h;
}

// Bình phương khoảng cách tới đoạn AB. max() chặn NaN khi hai mẫu trùng nhau.
float segDist2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-7), 0.0, 1.0);
  vec2 d = pa - ba * h;
  return dot(d, d);
}

const float WAKE_R2    = 0.0034;
const float WAKE_TAPER = 0.0125;
const float WAKE_DEPTH = 0.0300;
const float WAKE_RIM   = 0.0100;
const float WAKE_CURL  = 0.0060;

// Vệt nước theo con trỏ: hõm chạy dọc đường đi thật (polyline), hai bên
// có gờ nổi -> đọc ra "nước bị đẩy sang hai bên", không bao giờ ra thanh cứng.
float wake(vec2 p) {
  if (u_wakeAmp < 0.004) return 0.0;
  float d2 = 1e9;
  for (int i = 0; i < ${TRAIL_N - 1}; i++) {
    vec3 A = u_trail[i];
    vec3 B = u_trail[i + 1];
    float w = min(A.z, B.z);
    d2 = min(d2, segDist2(p, A.xy, B.xy) + (1.0 - w) * WAKE_TAPER);
  }
  float s2 = d2 / WAKE_R2;
  float dip = exp(-s2 * 1.35);
  float wide = exp(-s2 * 0.30);
  float ring = wide - dip;
  // Dùng offset NGUYÊN VẸN: nhân hệ số sẽ phá tính tuần hoàn mod-128 và làm
  // trường noise nhảy một nhịp mỗi khi offset cuộn vòng.
  float curl = vnoise(p * 13.0 + u_n1.xy) - 0.5;
  return u_wakeAmp * (-WAKE_DEPTH * dip + WAKE_RIM * ring + WAKE_CURL * ring * curl);
}

float height(vec2 p) { return ambient(p) + ripples(p) + wake(p); }

void main() {
  vec2 p = v_uv;
  p.x *= u_res.x / u_res.y;

  // Kẹp bước lấy vi phân: normal độc lập độ phân giải, không shimmer ở 4K.
  float e = clamp(1.6 / u_res.y, 1.0 / 1400.0, 1.0 / 260.0);
  float h0 = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hy = height(p + vec2(0.0, e));
  vec2 grad = vec2(h0 - hx, h0 - hy) / e;
  vec3 n  = normalize(vec3(grad, 1.6));
  vec3 nS = normalize(vec3(grad, 0.35));

  vec3 l = normalize(vec3(-0.4, 0.6, 0.55));
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(n, l), 0.0);
  float ndh = max(dot(n, hv), 0.0);

  // Thân nước: navy -> xanh đại dương -> cyan
  float depthT = clamp(0.42 + h0 * 9.0 + diff * 0.35, 0.0, 1.0);
  vec3 col = mix(DEEP, MID, smoothstep(0.0, 0.62, depthT));
  col = mix(col, SHAL, smoothstep(0.62, 1.0, depthT));

  // "Trong": ánh cyan xuyên qua đỉnh sóng (subsurface wrap-diffuse)
  float wrap = clamp((dot(n, l) + 0.6) / 1.6, 0.0, 1.0);
  float sss = wrap * wrap * clamp(h0 * 18.0 + 0.25, 0.0, 1.0);
  col += vec3(0.015, 0.10, 0.13) * sss;

  // Lăn tăn caustic trôi ngược chiều nhau, chỉ ở vùng sáng
  float c1 = vnoise(p * 9.0 + u_n2.xy);
  float c2 = vnoise(p * 11.0 + u_n2.zw);
  float caus = pow(clamp((c1 + c2 - 1.0) * 1.9, 0.0, 1.0), 2.4);
  col += vec3(0.04, 0.16, 0.18) * caus * smoothstep(0.35, 0.95, depthT);

  // Phản chiếu trời: mặt phẳng nhìn xuyên xuống đáy, mặt nghiêng bắt trời
  float fres = pow(1.0 - max(nS.z, 0.0), 2.0);
  col = mix(col, SKY, min(fres, 0.75));

  // Bọt ở đỉnh cao (vành click; thi thoảng đỉnh sóng trùng pha)
  float crest = smoothstep(0.022, 0.055, h0);
  col = mix(col, FOAM, crest * 0.55);

  // Specular ấm — giữ chất premium đêm. Damp theo độ dốc để không strobe.
  float sheen = pow(ndh, 24.0) * 0.10;
  float sparkle = smoothstep(0.955, 0.998, ndh) * 0.55;
  sparkle *= 1.0 / (1.0 + 0.30 * dot(grad, grad));
  col += (sheen + sparkle) * vec3(1.0, 0.95, 0.82);

  col *= 1.0 - 0.30 * smoothstep(0.45, 1.1, length(v_uv - 0.5) * 1.6);
  col = sqrt(clamp(col, 0.0, 1.0));
  // Dither 1 LSB sau gamma: diệt banding 8-bit của ramp tối + vignette
  float ign = fract(52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y));
  gl_FragColor = vec4(col + (ign - 0.5) * (1.0 / 255.0), 1.0);
}
`

const wrapTau = (v) => v - TAU * Math.floor(v / TAU)
const wrapNP = (v) => v - NP * Math.floor(v / NP)

// Hai biến thể dùng CHUNG một shader:
//  auth      — toàn màn hình trang đăng nhập, có tương tác con trỏ, fps tự do.
//  wallpaper — nền cố định của app: nhỏ, chậm, không tương tác; CSS blur 14px
//              đè lên nên độ phân giải thấp không nhìn ra được.
const VARIANTS = {
  auth: { scale: null, maxFps: 0, timeScale: 1, interactive: true, slowDt: 0.028 },
  // maxFps thấp có chủ ý: chi phí thật của wallpaper KHÔNG nằm ở shader (đã
  // hạ xuống 0.22 lần kích thước) mà ở `filter: blur()` của CSS — bộ lọc chạy
  // trên ảnh đã rasterize ở nguyên độ phân giải màn hình, mỗi lần canvas đổi
  // nội dung. Với blur 10px + timeScale 0.32, mặt nước dịch chưa tới 1px giữa
  // hai frame nên 10fps và 24fps nhìn như nhau.
  wallpaper: { scale: 0.22, maxFps: 10, timeScale: 0.32, interactive: false, slowDt: 0.085 }
}

export default function WaterBackground({ variant = 'auth' }) {
  const cfg = VARIANTS[variant] ?? VARIANTS.auth
  const wp = variant === 'wallpaper'
  const canvasRef = useRef(null)
  const [mode, setMode] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'static' : 'gl'
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setMode(mq.matches ? 'static' : 'gl')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (mode !== 'gl') return
    const canvas = canvasRef.current
    const host = canvas.parentElement
    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false
    })
    if (!gl || gl.isContextLost()) {
      setMode('css')
      return
    }
    // Hash + noise cần float32 thật. fp16/fp24 sẽ cho noise vón cục —
    // gradient CSS còn đẹp hơn, nên chuyển hẳn sang fallback.
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
    if (!hp || hp.precision < 23) {
      setMode('css')
      return
    }

    const compile = (type, src) => {
      const sh = gl.createShader(type)
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      setMode('css')
      return
    }
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uPh = gl.getUniformLocation(program, 'u_ph')
    const uN1 = gl.getUniformLocation(program, 'u_n1')
    const uN2 = gl.getUniformLocation(program, 'u_n2')
    const uRipples = gl.getUniformLocation(program, 'u_ripples[0]')
    const uTrail = gl.getUniformLocation(program, 'u_trail[0]')
    const uWakeAmp = gl.getUniformLocation(program, 'u_wakeAmp')

    // ---------- Kích thước / DPR / rect ----------
    // Chặn TỔNG SỐ PIXEL, không chỉ chặn DPR: màn 4K ở DPR 1 vẫn là 8.3 Mpx,
    // quá sức GPU tích hợp cho shader này. Quality tự hạ thêm nếu đo được chậm.
    const MAX_PX = 2.6e6
    let quality = 1
    let rect = null
    const syncRect = () => {
      rect = canvas.getBoundingClientRect()
    }
    // Khai báo TRƯỚC size() vì size() được gọi ngay bên dưới và có ghi vào last.
    let last = performance.now()
    const size = () => {
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      let s
      if (cfg.scale) {
        // Wallpaper: BỎ QUA devicePixelRatio. 0.22 × 1920 ≈ 422px, phóng to
        // 4.5 lần rồi blur 14px -> không còn tần số nào để mắt bắt lỗi.
        s = cfg.scale * quality
        const w0 = cw * s
        if (w0 > 560) s *= 560 / w0
      } else {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        s = dpr * quality
        const px = cw * ch * s * s
        if (px > MAX_PX) s *= Math.sqrt(MAX_PX / px)
      }
      const w = Math.max(1, Math.round(cw * s))
      const h = Math.max(1, Math.round(ch * s))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
        // Đổi kích thước làm buffer bị xoá về màu clear (đen đặc vì alpha:false).
        // Không vẽ lại NGAY thì với cap fps sẽ có 1-3 frame đen phủ toàn màn
        // hình — thấy rõ khi kéo cửa sổ hoặc mở/đóng modal (thanh cuộn biến mất
        // làm khung nhìn rộng ra). Cho frame kế tiếp bỏ qua cap.
        last = -1e9
      }
      syncRect()
    }
    size()
    const ro = new ResizeObserver(() => size())
    ro.observe(canvas)

    const toUV = (cx, cy) => {
      if (!rect || !rect.width || !rect.height) return null
      return [((cx - rect.left) / rect.width) * (rect.width / rect.height), 1 - (cy - rect.top) / rect.height]
    }

    // ---------- Vành sóng khi click ----------
    const ripBuf = new Float32Array(MAX_RIPPLES * 4)
    const ripBirth = new Float64Array(MAX_RIPPLES)
    let ripCursor = 0
    let t = 0 // double, đơn điệu, KHÔNG upload lên GPU

    const onDown = (e) => {
      const uv = toUV(e.clientX, e.clientY)
      if (!uv) return
      const i = ripCursor * 4
      ripBuf[i] = uv[0]
      ripBuf[i + 1] = uv[1]
      ripBuf[i + 2] = 0
      ripBuf[i + 3] = 0.6
      ripBirth[ripCursor] = t
      ripCursor = (ripCursor + 1) % MAX_RIPPLES
    }

    // ---------- Trail theo con trỏ ----------
    const trailX = new Float32Array(TRAIL_N)
    const trailY = new Float32Array(TRAIL_N)
    const trailA = new Float32Array(TRAIL_N)
    const trailBuf = new Float32Array(TRAIL_N * 3)
    let trailCount = 0
    let needTrailReset = true

    let forceSnap = true
    let tgx = 0
    let tgy = 0
    let mx = 0
    let my = 0
    let pmx = 0
    let pmy = 0
    let spd = 0
    let amp = 0
    let lastMoveTs = -1e9

    const commit = (x, y) => {
      for (let i = TRAIL_N - 1; i > 0; i -= 1) {
        trailX[i] = trailX[i - 1]
        trailY[i] = trailY[i - 1]
        trailA[i] = trailA[i - 1]
      }
      trailX[0] = x
      trailY[0] = y
      trailA[0] = 0
      if (trailCount < TRAIL_N) trailCount += 1
    }
    const resetTrail = (x, y) => {
      for (let i = 0; i < TRAIL_N; i += 1) {
        trailX[i] = x
        trailY[i] = y
        trailA[i] = TRAIL_LIFE
      }
      trailA[0] = 0
      trailCount = 1
      mx = x
      pmx = x
      my = y
      pmy = y
      spd = 0
    }

    const onMove = (e) => {
      const uv = toUV(e.clientX, e.clientY)
      if (!uv) return
      tgx = uv[0]
      tgy = uv[1]
      lastMoveTs = performance.now()
      // Con trỏ vào lại: snap để không kéo một vệt ngang màn hình từ chỗ cũ.
      if (amp < 0.05 || forceSnap) {
        forceSnap = false
        needTrailReset = true
      }
    }
    // Rời cửa sổ: để phong bì tự tắt mềm (không cắt phựt), nhưng đánh dấu để
    // lần quay lại phải snap.
    const onLeave = () => {
      lastMoveTs = -1e9
      forceSnap = true
    }

    // Wallpaper nằm dưới pointer-events:none và không có tương tác -> KHÔNG gắn
    // listener nào, đặc biệt tránh 'scroll' capture chạy mỗi frame cuộn.
    if (cfg.interactive) {
      host.addEventListener('pointermove', onMove, { passive: true })
      host.addEventListener('pointerdown', onDown)
      host.addEventListener('pointerleave', onLeave)
      window.addEventListener('blur', onLeave)
      window.addEventListener('scroll', syncRect, { passive: true, capture: true })
      window.addEventListener('resize', syncRect, { passive: true })
    }

    // ---------- Vòng lặp vẽ ----------
    // Cờ `running` đảm bảo chỉ có đúng một chuỗi rAF: mount trong tab ẩn
    // rồi hiện lại sẽ không tạo chuỗi thứ hai (chuỗi mồ côi không thể hủy).
    let raf = 0
    let running = false
    let emaDt = 0
    let warmup = 0
    const minFrame = cfg.maxFps ? 1000 / cfg.maxFps : 0
    const frame = (now) => {
      if (!running) return
      // Modal đang mở: lớp phủ che kín wallpaper, vẽ tiếp là đốt GPU vô ích
      // (filter blur chạy trên toàn màn hình mỗi lần canvas đổi nội dung).
      if (wp && document.documentElement.dataset.modalOpen) {
        raf = requestAnimationFrame(frame)
        return
      }
      // Cap fps: chỉ VẼ khi đủ ngân sách; dt tính giữa 2 lần vẽ nên tốc độ
      // chuyển động không đổi theo fps.
      if (minFrame && now - last < minFrame) {
        raf = requestAnimationFrame(frame)
        return
      }
      const dt = Math.max(0, Math.min(now - last, 100)) / 1000
      t += dt * cfg.timeScale
      last = now

      if (needTrailReset) {
        needTrailReset = false
        resetTrail(tgx, tgy)
      }

      // Vị trí đầu trail: lowpass dt-correct (không lệ thuộc fps)
      const kPos = 1 - Math.exp(-dt * 10)
      mx += (tgx - mx) * kPos
      my += (tgy - my) * kPos

      // Tốc độ (chỉ dùng độ lớn — hướng đã do hình học trail lo)
      let raw = dt > 0 ? Math.hypot(mx - pmx, my - pmy) / dt : 0
      pmx = mx
      pmy = my
      if (raw > SPEED_CAP) raw = SPEED_CAP
      spd += (raw - spd) * (1 - Math.exp(-dt * 6))

      // Lão hóa + đầu trail dính con trỏ + commit theo khoảng cách
      for (let i = 0; i < TRAIL_N; i += 1) trailA[i] += dt
      trailX[0] = mx
      trailY[0] = my
      trailA[0] = 0
      if (trailCount < 2) commit(mx, my)
      else if (Math.hypot(mx - trailX[1], my - trailY[1]) >= TRAIL_STEP) commit(mx, my)

      // Phong bì hoạt động
      const moving = now - lastMoveTs < 100
      amp += ((moving ? 1 : 0) - amp) * (1 - Math.exp(-dt * (moving ? 6 : 2.5)))

      for (let i = 0; i < TRAIL_N; i += 1) {
        const live = i < trailCount
        const src = live ? i : trailCount - 1
        let w = 0
        if (live) {
          const a = 1 - trailA[i] / TRAIL_LIFE
          w = a > 0 ? a * a : 0
        }
        trailBuf[i * 3] = trailX[src]
        trailBuf[i * 3 + 1] = trailY[src]
        trailBuf[i * 3 + 2] = w
      }
      for (let i = 0; i < MAX_RIPPLES; i += 1) {
        if (ripBuf[i * 4 + 3] > 0) {
          const age = t - ripBirth[i]
          if (age > 3) ripBuf[i * 4 + 3] = 0
          else ripBuf[i * 4 + 2] = age
        }
      }

      // Watchdog: máy quá yếu (kể cả trình dựng phần mềm vẫn lọt cổng highp)
      // thì hạ độ phân giải, hạ hết cỡ vẫn chậm thì chuyển sang nền CSS.
      if (dt > 0) {
        emaDt = emaDt ? emaDt * 0.92 + dt * 0.08 : dt
        warmup += 1
        if (warmup > 120 && emaDt > cfg.slowDt) {
          warmup = 0
          if (quality > 0.56) {
            quality = quality > 0.76 ? 0.75 : 0.55
            emaDt = 0
            size()
          } else {
            stop()
            setMode('css')
            return
          }
        }
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform4f(uPh, wrapTau(0.8 * t), wrapTau(1.25 * t), wrapTau(2.6 * t), wrapTau(3.6 * t))
      gl.uniform4f(uN1, wrapNP(0.576 * t), wrapNP(0.832 * t), wrapNP(-1.632 * t), wrapNP(-1.156 * t))
      gl.uniform4f(uN2, wrapNP(2.7 * t), wrapNP(-1.98 * t), wrapNP(-2.86 * t), wrapNP(2.09 * t))
      gl.uniform4fv(uRipples, ripBuf)
      gl.uniform3fv(uTrail, trailBuf)
      gl.uniform1f(uWakeAmp, amp * (0.55 + 0.45 * Math.min(spd / 1.4, 1)))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
      amp = 0 // frame() không chạy khi ẩn tab -> amp không tự decay được
      forceSnap = true
    }
    if (!document.hidden) start()

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onContextLost = (e) => {
      e.preventDefault()
      stop()
      setMode('css')
    }
    canvas.addEventListener('webglcontextlost', onContextLost)

    return () => {
      stop()
      ro.disconnect()
      if (cfg.interactive) {
        host.removeEventListener('pointermove', onMove)
        host.removeEventListener('pointerdown', onDown)
        host.removeEventListener('pointerleave', onLeave)
        window.removeEventListener('blur', onLeave)
        window.removeEventListener('scroll', syncRect, { capture: true })
        window.removeEventListener('resize', syncRect)
      }
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      // Không gọi loseContext(): StrictMode mount effect 2 lần trên cùng canvas,
      // context bị lose sẽ không dùng lại được ở lần mount sau.
    }
  }, [mode, wp, cfg])

  if (wp) {
    // Wallpaper KHÔNG dùng fallback động: một gradient chuyển động sau mọi
    // trang là phiền và repaint liên tục. Hỏng WebGL -> gradient tĩnh.
    if (mode !== 'gl') return <div className="wp-fallback" aria-hidden="true" />
    return <canvas ref={canvasRef} className="wp-canvas" aria-hidden="true" />
  }
  if (mode === 'static') return <div className="water-fallback water-fallback--static" aria-hidden="true" />
  if (mode === 'css') return <div className="water-fallback" aria-hidden="true" />
  return <canvas ref={canvasRef} className="water-canvas" aria-hidden="true" />
}

import { useEffect, useRef, useState } from 'react'

// ============================================================
//  Nền mặt nước cho trang đăng nhập / đăng ký (v2).
//  WebGL thuần, 1 pass. Sóng nền = 4 sin định hướng + 2 lớp
//  value-noise cuộn ngược chiều (bề mặt hữu cơ, không lặp).
//  Con trỏ tạo MỘT vệt hõm ellipse mượt kéo dãn theo vận tốc
//  (không phải chuỗi vành rời rạc); click tạo cặp vành lan tỏa.
//  Fallback: reduced-motion -> gradient tĩnh; không WebGL -> gradient động.
// ============================================================

const MAX_RIPPLES = 8

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
uniform float u_time;
uniform vec2 u_res;
uniform vec4 u_ripples[${MAX_RIPPLES}];
uniform vec2 u_mouse;
uniform vec2 u_mouseVel;
uniform float u_mouseAmp;

const vec3 DEEP = vec3(0.004, 0.016, 0.047);
const vec3 MID  = vec3(0.009, 0.093, 0.220);
const vec3 SHAL = vec3(0.042, 0.290, 0.442);
const vec3 SKY  = vec3(0.28, 0.44, 0.58);
const vec3 FOAM = vec3(0.62, 0.82, 0.90);

float hash21(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 q) {
  // mod 289 chặn tọa độ lưới: t chạy cả giờ cũng không làm sin() mất chính xác
  vec2 i = mod(floor(q), 289.0);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float ambient(vec2 p, float t) {
  float h = 0.0;
  h += 0.0110 * sin(dot(p, vec2( 1.0,  0.55)) * 9.0  + t * 0.8);
  h += 0.0070 * sin(dot(p, vec2(-0.72, 1.0 )) * 16.0 + t * 1.25 + 2.1);
  h += (vnoise(p * 3.2 + vec2(0.18, 0.26) * t) - 0.5) * 0.0170;
  h += (vnoise(p * 6.8 - vec2(0.24, 0.17) * t) - 0.5) * 0.0080;
  h += 0.0028 * sin(dot(p, vec2( 0.9, -0.4)) * 41.0 + t * 2.6 + 4.0);
  h += 0.0014 * sin(dot(p, vec2(-0.35, -1.0)) * 71.0 + t * 3.6 + 1.2);
  return h;
}

float ripples(vec2 p, float t) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = u_ripples[i];
    if (r.w <= 0.0) continue;
    float age = t - r.z;
    if (age < 0.0 || age > 3.0) continue;
    float d = length(p - r.xy);
    float front = d - age * 0.25;
    float f2 = front + 0.045;
    float ring  = sin(front * 60.0) * exp(-front * front * 900.0);
    float ring2 = sin(f2 * 60.0) * exp(-f2 * f2 * 900.0);
    h += 0.5 * r.w * (ring + 0.45 * ring2) * exp(-age * 2.2) * exp(-d * 1.5);
  }
  return h;
}

// Vệt nước theo con trỏ: hõm ellipse kéo dãn ngược hướng vận tốc.
// Mượt tuyệt đối ở mọi tốc độ — không bao giờ sinh vành rời rạc.
float wake(vec2 p) {
  if (u_mouseAmp < 0.003) return 0.0;
  float speed = length(u_mouseVel);
  vec2 dir = speed > 1e-4 ? u_mouseVel / speed : vec2(1.0, 0.0);
  float elong = min(speed * 0.12, 0.20);
  vec2 q = p - (u_mouse - dir * elong * 0.6);
  float a = dot(q, dir);
  float o = q.x * dir.y - q.y * dir.x;
  float ra = 0.06 + elong;
  float g = exp(-(a * a) / (ra * ra) - (o * o) / 0.0036);
  float depth = 0.35 + 0.65 * min(speed / 1.1, 1.0);
  return -0.022 * u_mouseAmp * depth * g;
}

float height(vec2 p, float t) { return ambient(p, t) + ripples(p, t) + wake(p); }

void main() {
  vec2 p = v_uv;
  p.x *= u_res.x / u_res.y;
  float t = u_time;

  float e = 2.0 / u_res.y;
  float h0 = height(p, t);
  float hx = height(p + vec2(e, 0.0), t);
  float hy = height(p + vec2(0.0, e), t);
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
  float c1 = vnoise(p * 9.0  + vec2( 0.30, -0.22) * t);
  float c2 = vnoise(p * 11.0 - vec2( 0.26, -0.19) * t);
  float caus = pow(clamp((c1 + c2 - 1.0) * 1.9, 0.0, 1.0), 2.4);
  col += vec3(0.04, 0.16, 0.18) * caus * smoothstep(0.35, 0.95, depthT);

  // Phản chiếu trời: mặt phẳng nhìn xuyên xuống đáy, mặt nghiêng bắt trời
  float fres = pow(1.0 - max(nS.z, 0.0), 2.0);
  col = mix(col, SKY, min(fres, 0.75));

  // Bọt ở đỉnh cao (vành click; thi thoảng đỉnh sóng trùng pha)
  float crest = smoothstep(0.022, 0.055, h0);
  col = mix(col, FOAM, crest * 0.55);

  // Specular ấm — giữ chất premium đêm
  float sheen = pow(ndh, 24.0) * 0.10;
  float sparkle = smoothstep(0.975, 0.995, ndh) * 0.9;
  col += (sheen + sparkle) * vec3(1.0, 0.95, 0.82);

  col *= 1.0 - 0.30 * smoothstep(0.45, 1.1, length(v_uv - 0.5) * 1.6);
  gl_FragColor = vec4(sqrt(col), 1.0);
}
`

export default function WaterBackground() {
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
    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false
    })
    if (!gl || gl.isContextLost()) {
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

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uRes = gl.getUniformLocation(program, 'u_res')
    const uRipples = gl.getUniformLocation(program, 'u_ripples')
    const uMouse = gl.getUniformLocation(program, 'u_mouse')
    const uMouseVel = gl.getUniformLocation(program, 'u_mouseVel')
    const uMouseAmp = gl.getUniformLocation(program, 'u_mouseAmp')

    // ---------- Kích thước / DPR ----------
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const size = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    size()
    const ro = new ResizeObserver(() => size())
    ro.observe(canvas)

    // ---------- Tọa độ chuột -> uv aspect-corrected ----------
    const toUV = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect()
      if (!r.width || !r.height) return null
      return [((clientX - r.left) / r.width) * (r.width / r.height), 1 - (clientY - r.top) / r.height]
    }

    // ---------- Vành sóng khi click ----------
    const ripples = new Float32Array(MAX_RIPPLES * 4)
    let cursor = 0
    let t = 0

    const inject = (clientX, clientY, strength) => {
      const uv = toUV(clientX, clientY)
      if (!uv) return
      const i = cursor * 4
      ripples[i] = uv[0]
      ripples[i + 1] = uv[1]
      ripples[i + 2] = t
      ripples[i + 3] = strength
      cursor = (cursor + 1) % MAX_RIPPLES
    }
    const onDown = (e) => inject(e.clientX, e.clientY, 0.6)

    // ---------- Wake theo con trỏ: pointermove chỉ ghi target thô ----------
    let tgx = 0
    let tgy = 0
    let mx = 0
    let my = 0
    let pvx = 0
    let pvy = 0
    let wvx = 0
    let wvy = 0
    let amp = 0
    let lastMoveTs = -1e9

    const onMove = (e) => {
      const uv = toUV(e.clientX, e.clientY)
      if (!uv) return
      tgx = uv[0]
      tgy = uv[1]
      lastMoveTs = performance.now()
      // Con trỏ mới vào (hoặc quay lại sau khi wake đã tắt): snap để không có
      // vệt quét ngang màn hình từ vị trí cũ và không có xung vận tốc giả.
      if (amp < 0.05) {
        mx = tgx
        my = tgy
        pvx = tgx
        pvy = tgy
        wvx = 0
        wvy = 0
      }
    }
    const onLeave = () => {
      lastMoveTs = -1e9
      amp = 0 // tắt wake ngay: quay lại tab/chạm điểm khác sẽ snap, không có vệt quét
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('blur', onLeave)
    document.addEventListener('pointerleave', onLeave)

    // ---------- Vòng lặp vẽ ----------
    // Cờ `running` đảm bảo chỉ có đúng một chuỗi rAF: mount trong tab ẩn
    // rồi hiện lại sẽ không tạo chuỗi thứ hai (chuỗi mồ côi không thể hủy).
    let raf = 0
    let running = false
    let last = performance.now()
    const frame = (now) => {
      if (!running) return
      const dt = Math.max(0, Math.min(now - last, 100)) / 1000
      t += dt
      last = now

      // Làm mượt vị trí / vận tốc / phong bì wake (dt-correct, không lệ thuộc fps)
      const kPos = 1 - Math.exp(-dt * 10)
      mx += (tgx - mx) * kPos
      my += (tgy - my) * kPos
      let rvx = dt > 0 ? (tgx - pvx) / dt : 0
      let rvy = dt > 0 ? (tgy - pvy) / dt : 0
      pvx = tgx
      pvy = tgy
      const sp = Math.hypot(rvx, rvy)
      if (sp > 5) {
        rvx *= 5 / sp
        rvy *= 5 / sp
      }
      const kVel = 1 - Math.exp(-dt * 6)
      wvx += (rvx - wvx) * kVel
      wvy += (rvy - wvy) * kVel
      const moving = now - lastMoveTs < 100
      const kAmp = 1 - Math.exp(-dt * (moving ? 6 : 2.5))
      amp += ((moving ? 1 : 0) - amp) * kAmp

      size()
      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform4fv(uRipples, ripples)
      gl.uniform2f(uMouse, mx, my)
      gl.uniform2f(uMouseVel, wvx, wvy)
      gl.uniform1f(uMouseAmp, amp)
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
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      // Không gọi loseContext(): StrictMode mount effect 2 lần trên cùng canvas,
      // context bị lose sẽ không dùng lại được ở lần mount sau.
    }
  }, [mode])

  if (mode === 'static') return <div className="water-fallback water-fallback--static" aria-hidden="true" />
  if (mode === 'css') return <div className="water-fallback" aria-hidden="true" />
  return <canvas ref={canvasRef} className="water-canvas" aria-hidden="true" />
}

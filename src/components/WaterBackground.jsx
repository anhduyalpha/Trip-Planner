import { useEffect, useRef, useState } from 'react'

// ============================================================
//  Nền mặt nước cho trang đăng nhập / đăng ký.
//  WebGL thuần, 1 pass: sóng nền (4 sin định hướng) + tối đa 16
//  gợn sóng theo chuột (vành sin mở rộng, tắt dần theo thời gian
//  và khoảng cách). Không thêm thư viện.
//  Fallback: reduced-motion -> gradient tĩnh; không WebGL -> gradient động.
// ============================================================

const MAX_RIPPLES = 16

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

float ambient(vec2 p, float t) {
  float h = 0.0;
  h += 0.0140 * sin(dot(p, vec2( 1.0,  0.6)) * 11.0  + t * 0.9);
  h += 0.0100 * sin(dot(p, vec2(-0.7,  1.0)) * 17.0  + t * 1.3 + 2.1);
  h += 0.0060 * sin(dot(p, vec2( 0.9, -0.4)) * 29.0  + t * 1.8 + 4.0);
  h += 0.0035 * sin(dot(p, vec2(-0.3, -1.0)) * 47.0  + t * 2.6 + 1.2);
  h += 0.0022 * sin(dot(p, vec2( 0.6,  0.9)) * 76.0  + t * 3.4 + 3.3);
  h += 0.0014 * sin(dot(p, vec2(-0.9,  0.2)) * 118.0 + t * 4.4 + 5.7);
  h += 0.0005 * sin(dot(p, vec2( 0.2,  1.0)) * 150.0 + t * 5.9 + 0.8);
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
    h += 0.5 * r.w * sin(front * 60.0)
             * exp(-front * front * 900.0)
             * exp(-age * 2.2)
             * exp(-d * 1.5);
  }
  return h;
}

float height(vec2 p, float t) { return ambient(p, t) + ripples(p, t); }

void main() {
  vec2 p = v_uv;
  p.x *= u_res.x / u_res.y;
  float t = u_time;

  float e = 2.0 / u_res.y;
  float h0 = height(p, t);
  float hx = height(p + vec2(e, 0.0), t);
  float hy = height(p + vec2(0.0, e), t);
  vec3 n = normalize(vec3((h0 - hx) / e, (h0 - hy) / e, 1.6));

  vec3 l = normalize(vec3(-0.4, 0.6, 0.55));
  vec3 hvec = normalize(l + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(n, l), 0.0);
  float ndh = max(dot(n, hvec), 0.0);
  float sheen = pow(ndh, 18.0) * 0.08;
  float sparkle = smoothstep(0.972, 0.994, ndh) * 0.85;
  float fresnel = pow(1.0 - max(n.z, 0.0), 2.0);

  vec3 deep    = vec3(0.002, 0.030, 0.040);
  vec3 shallow = vec3(0.022, 0.180, 0.200);
  vec3 foam    = vec3(0.45, 0.70, 0.70);

  vec3 col = mix(deep, shallow, clamp(0.32 + h0 * 7.0 + diff * 0.45, 0.0, 1.0));
  col = mix(col, foam, fresnel * 0.30);
  col += (sheen + sparkle) * vec3(1.0, 0.93, 0.78);
  col *= 1.0 - 0.35 * smoothstep(0.45, 1.1, length(v_uv - 0.5) * 1.6);
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

    // ---------- Gợn sóng theo chuột ----------
    const ripples = new Float32Array(MAX_RIPPLES * 4)
    let cursor = 0
    let t = 0
    let lastX = 0
    let lastY = 0
    let lastInjectAt = 0

    const inject = (clientX, clientY, strength) => {
      const r = canvas.getBoundingClientRect()
      if (!r.width || !r.height) return
      const aspect = r.width / r.height
      const x = ((clientX - r.left) / r.width) * aspect
      const y = 1 - (clientY - r.top) / r.height
      const i = cursor * 4
      ripples[i] = x
      ripples[i + 1] = y
      ripples[i + 2] = t
      ripples[i + 3] = strength
      cursor = (cursor + 1) % MAX_RIPPLES
    }

    const onMove = (e) => {
      const now = performance.now()
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY)
      const dt = now - lastInjectAt
      if (dist > 40 || dt > 90) {
        const speed = dt > 0 ? dist / (dt / 1000) : 0
        inject(e.clientX, e.clientY, Math.min(Math.max(speed / 2000, 0.08), 0.35))
        lastX = e.clientX
        lastY = e.clientY
        lastInjectAt = now
      }
    }
    const onDown = (e) => inject(e.clientX, e.clientY, 0.6)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)

    // ---------- Vòng lặp vẽ ----------
    // Cờ `running` đảm bảo chỉ có đúng một chuỗi rAF: mount trong tab ẩn
    // rồi hiện lại sẽ không tạo chuỗi thứ hai (chuỗi mồ côi không thể hủy).
    let raf = 0
    let running = false
    let last = performance.now()
    const frame = (now) => {
      if (!running) return
      t += Math.min(now - last, 100) / 1000
      last = now
      size()
      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform4fv(uRipples, ripples)
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

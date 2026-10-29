// Beruhigender, interaktiver Rauch-Hintergrund (WebGL).
// Fingerbewegungen verwirbeln den Rauch sanft, der Wirbel klingt langsam aus.
(function () {
  const canvas = document.getElementById('smoke');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) { canvas.classList.add('fallback'); return; }

  const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
  const fs = `
precision mediump float;
uniform vec2 res;
uniform float t;
uniform vec3 touch[4];   // xy = Position (0..1), z = Stärke
uniform vec2 vel[4];
uniform float calm;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ v += a*noise(p); p = m*p; a *= .5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  float asp = res.x/res.y;
  vec2 p = vec2(uv.x*asp, uv.y);

  // Fingerwirbel
  vec2 swirl = vec2(0.);
  float glow = 0.;
  for(int i=0;i<4;i++){
    vec2 c = vec2(touch[i].x*asp, touch[i].y);
    vec2 d = p - c;
    float r = length(d);
    float s = touch[i].z * exp(-r*r*9.);
    swirl += s * (vec2(-d.y, d.x) * 1.6 + vel[i] * 2.2);
    glow += s;
  }

  float tt = t * mix(.035, .012, calm);
  vec2 q = vec2(fbm(p*1.4 + vec2(0., tt*1.3)), fbm(p*1.4 + vec2(5.2, 1.3) - tt));
  vec2 r = vec2(fbm(p*1.7 + 2.2*q + vec2(1.7, 9.2) + tt*.9 + swirl),
                fbm(p*1.7 + 2.2*q + vec2(8.3, 2.8) - tt*.7 - swirl));
  float f = fbm(p*1.2 + 2.4*r + swirl*.6);

  vec3 ink   = vec3(.043,.071,.125);
  vec3 deep  = vec3(.10,.16,.27);
  vec3 mist  = vec3(.34,.41,.58);
  vec3 teal  = vec3(.16,.33,.38);
  vec3 ember = vec3(.62,.50,.33);

  vec3 col = mix(ink, deep, smoothstep(.2,.75,f));
  col = mix(col, teal, smoothstep(.45,.95,length(q))*.35);
  col = mix(col, mist, pow(smoothstep(.45,1.,f*f*1.6 + r.x*.25), 1.4)*.7);
  col += ember * pow(max(r.y - .55, 0.), 2.) * .35;
  col += mist * glow * .06;

  // sanfte Vignette, damit Text gut lesbar bleibt
  float v = smoothstep(1.25, .25, length((uv - vec2(.5,.55)) * vec2(1., 1.25)));
  col = mix(ink, col, .7 + .3*v);
  gl_FragColor = vec4(col, 1.);
}`;

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);
  } catch (e) { canvas.classList.add('fallback'); return; }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'res');
  const uT = gl.getUniformLocation(prog, 't');
  const uTouch = gl.getUniformLocation(prog, 'touch');
  const uVel = gl.getUniformLocation(prog, 'vel');
  const uCalm = gl.getUniformLocation(prog, 'calm');

  const SCALE = 0.45; // Rauch ist weich, halbe Auflösung reicht und schont den Akku
  function resize() {
    const w = Math.max(1, Math.floor(innerWidth * SCALE));
    const h = Math.max(1, Math.floor(innerHeight * SCALE));
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  }
  addEventListener('resize', resize);
  resize();

  const touches = [0,1,2,3].map(() => ({ x: .5, y: .5, s: 0, vx: 0, vy: 0 }));
  let slot = 0;
  let last = null;
  function onMove(e) {
    const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight;
    if (last) {
      const dx = x - last.x, dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.015) {
        slot = (slot + 1) % 4;
        touches[slot] = { x, y, s: Math.min(1, 0.35 + dist * 6), vx: dx * 4, vy: dy * 4 };
        last = { x, y };
      }
    } else {
      last = { x, y };
      slot = (slot + 1) % 4;
      touches[slot] = { x, y, s: 0.45, vx: 0, vy: 0 };
    }
  }
  addEventListener('pointerdown', e => { last = null; onMove(e); }, { passive: true });
  addEventListener('pointermove', e => { if (e.pressure > 0 || e.pointerType === 'mouse') onMove(e); }, { passive: true });
  addEventListener('pointerup', () => { last = null; }, { passive: true });

  let start = performance.now(), lastFrame = 0, running = true;
  window.Smoke = {
    calm: 0,
    paused: false,
    setCalm(v) { this.calm = v ? 1 : 0; },
    setPaused(v) { this.paused = v; if (!v) requestAnimationFrame(frame); },
  };
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(frame);
  });

  const tArr = new Float32Array(12), vArr = new Float32Array(8);
  function frame(now) {
    if (!running || window.Smoke.paused) return;
    requestAnimationFrame(frame);
    if (now - lastFrame < 33) return; // ~30 Bilder pro Sekunde
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    for (let i = 0; i < 4; i++) {
      const tc = touches[i];
      tc.s *= Math.pow(0.35, dt);      // Wirbel klingt in ein paar Sekunden aus
      tc.vx *= Math.pow(0.5, dt); tc.vy *= Math.pow(0.5, dt);
      tArr[i*3] = tc.x; tArr[i*3+1] = tc.y; tArr[i*3+2] = tc.s;
      vArr[i*2] = tc.vx; vArr[i*2+1] = tc.vy;
    }
    gl.uniform3fv(uTouch, tArr);
    gl.uniform2fv(uVel, vArr);
    gl.uniform1f(uT, (now - start) / 1000 + 40);
    gl.uniform1f(uCalm, window.Smoke.calm);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(frame);
})();

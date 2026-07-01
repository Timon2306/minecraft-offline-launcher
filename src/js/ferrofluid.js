// ==========================================================
// ferrofluid.js — Vanilla JS Ferrofluid Background
// Порт шейдера магнитной жидкости из React Bits на чистый JS
// ==========================================================

import { Renderer, Program, Mesh, Triangle } from './libs/ogl/index.js';

const MAX_COLORS = 8;

const hexToRGB = hex => {
  const c = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return [r, g, b];
};

const prepColors = input => {
  const base = (input && input.length ? input : ['#4F46E5', '#06B6D4', '#E0F2FE']).slice(0, MAX_COLORS);
  const count = base.length;
  const arr = [];
  
  // Заполняем массив до MAX_COLORS
  for (let i = 0; i < MAX_COLORS; i++) {
    arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
  }
  
  const avg = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    avg[0] += arr[i][0];
    avg[1] += arr[i][1];
    avg[2] += arr[i][2];
  }
  avg[0] /= count;
  avg[1] /= count;
  avg[2] /= count;
  
  return { arr, count, avg };
};

const flowVec = d => {
  switch (d) {
    case 'up': return [0, 1];
    case 'down': return [0, -1];
    case 'left': return [-1, 0];
    case 'right': return [1, 0];
    default: return [0, -1];
  }
};

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec3  uMouseColor;
uniform vec2  uFlow;
uniform float uSpeed;
uniform float uScale;
uniform float uTurbulence;
uniform float uFluidity;
uniform float uRimWidth;
uniform float uSharpness;
uniform float uShimmer;
uniform float uGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

#define PI 3.14159265

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

float hash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smin(float a, float b, float k) {
  float r = exp2(-a / k) + exp2(-b / k);
  return -k * log2(r);
}

float sinlerp(float a, float b, float w) {
  return mix(a, b, (sin(w * PI - PI / 2.0) + 1.0) / 2.0);
}

float vn(vec2 p, float s, float seed) {
  vec2 cellp = floor(p / s);
  vec2 relp = mod(p, s);
  float g1 = hash(vec3(cellp, seed));
  float g2 = hash(vec3(cellp.x + 1.0, cellp.y, seed));
  float g3 = hash(vec3(cellp.x + 1.0, cellp.y + 1.0, seed));
  float g4 = hash(vec3(cellp.x, cellp.y + 1.0, seed));
  float bx = sinlerp(g1, g2, relp.x / s);
  float tx = sinlerp(g4, g3, relp.x / s);
  return sinlerp(bx, tx, relp.y / s);
}

float dbn(vec2 p, float s, float seed) {
  float o = s / 2.0;
  float n0 = vn(p, s, seed);
  float n1 = vn(p + vec2(o, o), s, seed + 0.1);
  float n2 = vn(p + vec2(-o, o), s, seed + 0.2);
  float n3 = vn(p + vec2(o, -o), s, seed + 0.3);
  float n4 = vn(p + vec2(-o, -o), s, seed + 0.4);
  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float ref = 700.0 / max(uScale, 0.05);
  vec2 p = fragCoord / iResolution.y * ref;

  float spd = 200.0 * uSpeed;
  float t = iTime;

  vec2 dir = uFlow;
  vec2 perp = vec2(-dir.y, dir.x);

  float distort1 = vn(p + perp * (t * spd), 60.0, 10.0) * 50.0 * uTurbulence;
  float distort2 = vn(p - perp * (t * spd), 120.0, 15.0) * 100.0 * uTurbulence;

  float peaks = dbn(p + distort1 + dir * (t * spd * 0.5), 40.0, 1.0);
  float peaks2 = dbn(p + distort2 - dir * (t * spd * 0.5), 40.0, 0.0);

  float mapeaks = smin(peaks, peaks2, max(uFluidity, 0.001));

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mp = iMouse / iResolution.y * ref;
    float md = length(p - mp) / ref;
    float rr = max(uMouseRadius, 0.02);
    mGlow = exp(-md * md / (rr * rr)) * uMouseStrength;
  }

  float band = (uRimWidth - abs((mapeaks - 0.4) * 2.0)) * 5.0;
  float ltn = clamp(band - vn(p + dir * (t * spd * 0.5), 60.0, 12.0) * uShimmer, 0.0, 1.0);
  ltn = pow(ltn, uSharpness) * uGlow;
  ltn *= clamp(1.0 - mGlow, 0.0, 1.0);

  float h = clamp(0.5 + (peaks - peaks2) * 0.8, 0.0, 1.0);
  vec3 col = palette(h);

  vec3 outc = col * ltn;
  float a = clamp(max(outc.r, max(outc.g, outc.b)), 0.0, 1.0);
  fragColor = vec4(outc, a * uOpacity);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;

export class Ferrofluid {
  constructor(container, options = {}) {
    this.container = container;
    
    // Дефолтные настройки (как в React Bits)
    this.options = {
      dpr: options.dpr ?? window.devicePixelRatio ?? 1,
      colors: options.colors ?? ['#3b82f6', '#8b5cf6', '#6366f1'], // Приятные неоновые цвета
      speed: options.speed ?? 0.4,
      scale: options.scale ?? 1.6,
      turbulence: options.turbulence ?? 0.8,
      fluidity: options.fluidity ?? 0.08,
      rimWidth: options.rimWidth ?? 0.25,
      sharpness: options.sharpness ?? 2.8,
      shimmer: options.shimmer ?? 1.2,
      glow: options.glow ?? 2.5,
      flowDirection: options.flowDirection ?? 'down',
      opacity: options.opacity ?? 0.7, // Слегка приглушим, чтобы интерфейс читался идеально
      mouseInteraction: options.mouseInteraction ?? true,
      mouseStrength: options.mouseStrength ?? 1.2,
      mouseRadius: options.mouseRadius ?? 0.35,
      mouseDampening: options.mouseDampening ?? 0.15,
      ...options
    };

    this.paused = false;
    this.rafId = null;
    this.mouseTarget = [0, 0];
    this.lastTime = 0;

    this.init();
  }

  init() {
    // 1. Инициализация рендерера
    this.renderer = new Renderer({
      dpr: this.options.dpr,
      alpha: true,
      antialias: true
    });
    this.gl = this.renderer.gl;
    this.canvas = this.gl.canvas;
    
    this.gl.clearColor(0, 0, 0, 0);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '-1'; // Уводим за основной UI
    
    this.container.appendChild(this.canvas);

    // 2. Цвета
    const { arr, count, avg } = prepColors(this.options.colors);

    // 3. Создание Uniforms
    this.uniforms = {
      iResolution: { value: [this.gl.drawingBufferWidth, this.gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] },
      iTime: { value: 0 },
      uColor0: { value: arr[0] },
      uColor1: { value: arr[1] },
      uColor2: { value: arr[2] },
      uColor3: { value: arr[3] },
      uColor4: { value: arr[4] },
      uColor5: { value: arr[5] },
      uColor6: { value: arr[6] },
      uColor7: { value: arr[7] },
      uColorCount: { value: count },
      uMouseColor: { value: avg },
      uFlow: { value: flowVec(this.options.flowDirection) },
      uSpeed: { value: this.options.speed },
      uScale: { value: this.options.scale },
      uTurbulence: { value: this.options.turbulence },
      uFluidity: { value: this.options.fluidity },
      uRimWidth: { value: this.options.rimWidth },
      uSharpness: { value: this.options.sharpness },
      uShimmer: { value: this.options.shimmer },
      uGlow: { value: this.options.glow },
      uOpacity: { value: this.options.opacity },
      uMouseEnabled: { value: this.options.mouseInteraction ? 1 : 0 },
      uMouseStrength: { value: this.options.mouseStrength },
      uMouseRadius: { value: this.options.mouseRadius }
    };

    // 4. Компиляция шейдеров
    this.program = new Program(this.gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: this.uniforms
    });

    // 5. Геометрия на весь экран
    this.geometry = new Triangle(this.gl);
    this.mesh = new Mesh(this.gl, {
      geometry: this.geometry,
      program: this.program
    });

    // 6. Ресайз
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    // 7. Движение мыши
    this.onPointerMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sc = this.renderer.dpr || 1;
      const x = (e.clientX - rect.left) * sc;
      const y = (rect.height - (e.clientY - rect.top)) * sc;
      this.mouseTarget = [x, y];
      if (this.options.mouseDampening <= 0) {
        this.uniforms.iMouse.value = [x, y];
      }
    };

    if (this.options.mouseInteraction) {
      window.addEventListener('pointermove', this.onPointerMove);
    }

    // 8. Запуск цикла
    this.loop = (t) => {
      if (this.paused) return;
      this.rafId = requestAnimationFrame(this.loop);
      
      this.uniforms.iTime.value = t * 0.001;

      if (this.options.mouseDampening > 0) {
        if (!this.lastTime) this.lastTime = t;
        const dt = (t - this.lastTime) / 1000;
        this.lastTime = t;

        const tau = Math.max(1e-4, this.options.mouseDampening);
        let factor = 1 - Math.exp(-dt / tau);
        if (factor > 1) factor = 1;

        const target = this.mouseTarget;
        const cur = this.uniforms.iMouse.value;
        cur[0] += (target[0] - cur[0]) * factor;
        cur[1] += (target[1] - cur[1]) * factor;
      } else {
        this.lastTime = t;
      }

      try {
        this.renderer.render({ scene: this.mesh });
      } catch (err) {
        console.error('[Ferrofluid] Ошибка рендеринга:', err);
      }
    };

    this.paused = false;
    this.rafId = requestAnimationFrame(this.loop);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height);
    this.uniforms.iResolution.value = [this.gl.drawingBufferWidth, this.gl.drawingBufferHeight, 1];
  }

  // Приостановить рендер (0% GPU)
  pause() {
    if (this.paused) return;
    this.paused = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    console.log('[Ferrofluid] Рендеринг приостановлен.');
  }

  // Возобновить рендер
  play() {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = 0;
    this.rafId = requestAnimationFrame(this.loop);
    console.log('[Ferrofluid] Рендеринг возобновлен.');
  }

  destroy() {
    this.pause();
    
    if (this.options.mouseInteraction) {
      window.removeEventListener('pointermove', this.onPointerMove);
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.canvas && this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }

    // Очистка WebGL-ресурсов
    if (this.program) this.program.remove();
    if (this.geometry) this.geometry.remove();
    if (this.mesh) this.mesh.remove();
    if (this.renderer) this.renderer.destroy();
  }
}
export default Ferrofluid;

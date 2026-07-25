/**
 * OpenCourseDeck — WebGL Laser Background Effect
 * Thin white-hot vertical core with atmospheric smoke & dynamic halo.
 * Adheres strictly to skills-webgl-laser design rules.
 */

(function () {
  'use strict';

  const laserVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  const laserFragmentShader = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color;
uniform float u_xOffset;
uniform float u_coreWidth;
uniform float u_glowWidth;
uniform float u_smokeDensity;

varying vec2 v_uv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (v_uv - 0.5) * aspect;
  float x = p.x - u_xOffset;
  float distanceToBeam = abs(x);

  float core = exp(-pow(distanceToBeam / u_coreWidth, 2.0));
  float glow = exp(-pow(distanceToBeam / u_glowWidth, 1.45));
  float scatter = exp(-pow(distanceToBeam / (u_glowWidth * 5.5), 1.25));
  float pulse = 0.9 + 0.1 * sin(u_time * 1.15);

  vec2 fogUv = p * 3.1 + vec2(0.0, -u_time * 0.035);
  fogUv.x += sin(p.y * 3.5 + u_time * 0.11) * 0.14;
  float fogBase = fbm(fogUv);
  float fogFine = fbm(p * 8.0 + vec2(sin(u_time * 0.07) * 0.35, u_time * 0.05));
  float fog = smoothstep(0.30, 0.86, fogBase * 0.72 + fogFine * 0.28);
  float smoke = fog * scatter * u_smokeDensity;

  vec3 brand = clamp(u_color, 0.0, 1.0);
  vec3 haloColor = mix(brand, vec3(1.0), 0.16);
  vec3 smokeColor = mix(brand, vec3(0.55), 0.28) * 0.55;
  vec3 hotCore = vec3(1.0, 0.96, 0.90);

  vec3 color = vec3(0.006, 0.007, 0.010);
  color += smokeColor * smoke;
  color += haloColor * glow * 0.46 * pulse;
  color += hotCore * core * 1.35;

  float vignette = smoothstep(1.25, 0.18, length(p));
  color *= vignette;

  float alpha = clamp(smoke * 0.72 + glow * 0.68 + core, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

  function hexToRgb01(hex) {
    if (!hex || typeof hex !== 'string') return [0.48, 0.23, 0.93]; // fallback #7c3aed
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      const expanded = clean.split('').map(c => c + c).join('');
      return [
        parseInt(expanded.slice(0, 2), 16) / 255,
        parseInt(expanded.slice(2, 4), 16) / 255,
        parseInt(expanded.slice(4, 6), 16) / 255,
      ];
    }
    if (clean.length === 6) {
      return [
        parseInt(clean.slice(0, 2), 16) / 255,
        parseInt(clean.slice(2, 4), 16) / 255,
        parseInt(clean.slice(4, 6), 16) / 255,
      ];
    }
    return [0.48, 0.23, 0.93];
  }

  function getBrandAccentRgb() {
    try {
      const computed = getComputedStyle(document.documentElement);
      const accent = computed.getPropertyValue('--brand-accent').trim() ||
                     computed.getPropertyValue('--brand-primary').trim() ||
                     '#7c3aed';
      if (accent.startsWith('#')) {
        return hexToRgb01(accent);
      }
    } catch {}
    return [0.48, 0.23, 0.93];
  }

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(log || 'Shader compile failed');
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(log || 'Program link failed');
    }
    return program;
  }

  function initWebGLLaser(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      return () => {};
    }

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    }) || canvas.getContext('experimental-webgl');

    if (!gl) {
      return () => {};
    }

    let program, positionBuffer;
    try {
      program = createProgram(gl, laserVertexShader, laserFragmentShader);
      positionBuffer = gl.createBuffer();
      const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    } catch (e) {
      return () => {};
    }

    gl.useProgram(program);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      color: gl.getUniformLocation(program, 'u_color'),
      xOffset: gl.getUniformLocation(program, 'u_xOffset'),
      coreWidth: gl.getUniformLocation(program, 'u_coreWidth'),
      glowWidth: gl.getUniformLocation(program, 'u_glowWidth'),
      smokeDensity: gl.getUniformLocation(program, 'u_smokeDensity'),
    };

    if (positionLocation >= 0) {
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const color = options.color || getBrandAccentRgb();
    const reduceMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let width = 1;
    let height = 1;
    let rafId = 0;
    let lastTime = 0;
    let frameCount = 0;
    let currentFps = 60;
    let adaptiveDprScale = 1.0;

    function resize() {
      const baseDpr = Math.min(window.devicePixelRatio || 1, options.maxDpr || 1.5);
      const effectiveDpr = Math.max(0.5, baseDpr * adaptiveDprScale);
      width = Math.max(1, window.innerWidth || canvas.clientWidth || 300);
      height = Math.max(1, window.innerHeight || canvas.clientHeight || 150);
      canvas.width = Math.floor(width * effectiveDpr);
      canvas.height = Math.floor(height * effectiveDpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function render(time = 0) {
      if (lastTime > 0) {
        const delta = time - lastTime;
        frameCount++;
        if (delta >= 1000) {
          currentFps = (frameCount * 1000) / delta;
          frameCount = 0;
          lastTime = time;
          if (currentFps < 30 && adaptiveDprScale > 0.5) {
            adaptiveDprScale = 0.5;
            resize();
          }
        }
      } else {
        lastTime = time;
      }

      gl.useProgram(program);
      if (uniforms.resolution) gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      if (uniforms.time) gl.uniform1f(uniforms.time, time * 0.001);
      if (uniforms.color) gl.uniform3f(uniforms.color, color[0], color[1], color[2]);
      if (uniforms.xOffset) gl.uniform1f(uniforms.xOffset, options.xOffset || 0.0);
      if (uniforms.coreWidth) gl.uniform1f(uniforms.coreWidth, options.coreWidth || 0.0045);
      if (uniforms.glowWidth) gl.uniform1f(uniforms.glowWidth, options.glowWidth || 0.035);
      if (uniforms.smokeDensity) gl.uniform1f(uniforms.smokeDensity, options.smokeDensity || 0.52);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!reduceMotion) {
        rafId = requestAnimationFrame(render);
      }
    }

    function handleResize() {
      resize();
      render();
    }

    resize();
    render();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
      try {
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (program) gl.deleteProgram(program);
      } catch {}
    };
  }

  // Export to global namespace
  const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};
  pd.Laser = {
    init: initWebGLLaser,
    hexToRgb01: hexToRgb01,
  };

  // Auto-boot if canvas present
  if (typeof document !== 'undefined') {
    const bootLaser = () => {
      const canvas = document.querySelector('[data-webgl-laser]');
      if (canvas && !canvas._laserInitialized) {
        canvas._laserInitialized = true;
        pd.Laser._cleanup = initWebGLLaser(canvas);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootLaser);
    } else {
      bootLaser();
    }
  }
})();

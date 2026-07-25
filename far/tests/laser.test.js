import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../laser.js';

describe('WebGL Laser Background Effect (skills-webgl-laser)', () => {
  let canvas;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.className = 'laser-canvas';
    canvas.setAttribute('data-webgl-laser', 'true');
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
  });

  it('registers window.OpenCourseDeck.Laser namespace', () => {
    expect(window.OpenCourseDeck).toBeDefined();
    expect(window.OpenCourseDeck.Laser).toBeDefined();
    expect(typeof window.OpenCourseDeck.Laser.init).toBe('function');
    expect(typeof window.OpenCourseDeck.Laser.hexToRgb01).toBe('function');
  });

  it('converts hex colors to normalized RGB [0..1] values accurately', () => {
    const { hexToRgb01 } = window.OpenCourseDeck.Laser;
    expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb01('#00ff00')).toEqual([0, 1, 0]);
    expect(hexToRgb01('#0000ff')).toEqual([0, 0, 1]);
    expect(hexToRgb01('#f00')).toEqual([1, 0, 0]);
    expect(hexToRgb01('invalid')).toEqual([0.48, 0.23, 0.93]);
  });

  it('handles missing or non-WebGL canvas contexts gracefully without throwing', () => {
    const { init } = window.OpenCourseDeck.Laser;
    const cleanup = init(canvas);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('initializes and cleans up WebGL context when WebGL is supported', () => {
    const mockShader = {};
    const mockProgram = {};
    const mockBuffer = {};
    const mockGl = {
      createShader: vi.fn().mockReturnValue(mockShader),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn().mockReturnValue(true),
      getShaderInfoLog: vi.fn().mockReturnValue(''),
      createProgram: vi.fn().mockReturnValue(mockProgram),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn().mockReturnValue(true),
      getProgramInfoLog: vi.fn().mockReturnValue(''),
      createBuffer: vi.fn().mockReturnValue(mockBuffer),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      useProgram: vi.fn(),
      getAttribLocation: vi.fn().mockReturnValue(0),
      getUniformLocation: vi.fn().mockReturnValue({}),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      enable: vi.fn(),
      blendFunc: vi.fn(),
      viewport: vi.fn(),
      uniform2f: vi.fn(),
      uniform1f: vi.fn(),
      uniform3f: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      drawArrays: vi.fn(),
      deleteBuffer: vi.fn(),
      deleteProgram: vi.fn(),
      deleteShader: vi.fn(),
      COLOR_BUFFER_BIT: 16384,
      TRIANGLES: 4,
      ARRAY_BUFFER: 34962,
      STATIC_DRAW: 35044,
      FLOAT: 5126,
      BLEND: 3042,
      SRC_ALPHA: 770,
      ONE_MINUS_SRC_ALPHA: 771,
      COMPILE_STATUS: 35713,
      LINK_STATUS: 35714,
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
    };

    canvas.getContext = vi.fn().mockReturnValue(mockGl);

    const { init } = window.OpenCourseDeck.Laser;
    const cleanup = init(canvas, {
      xOffset: 0.1,
      coreWidth: 0.005,
      glowWidth: 0.04,
      smokeDensity: 0.6,
    });

    expect(canvas.getContext).toHaveBeenCalledWith('webgl', expect.any(Object));
    expect(mockGl.createProgram).toHaveBeenCalled();
    expect(mockGl.drawArrays).toHaveBeenCalled();

    expect(typeof cleanup).toBe('function');
    cleanup();

    expect(mockGl.deleteBuffer).toHaveBeenCalledWith(mockBuffer);
    expect(mockGl.deleteProgram).toHaveBeenCalledWith(mockProgram);
  });
});

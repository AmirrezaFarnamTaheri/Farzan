import { describe, expect, it, vi } from 'vitest';
import * as pen from '../src/features/studioKonvaPenInput.js';

const emit = (target, type, {
  pointerId = 1, pointerType = 'mouse', button = 0, x = 12, y = 14,
} = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId, pointerType, button, clientX: x, clientY: y,
  });
  target.dispatchEvent(event);
};

function makePointerCapture() {
  const target = document.createElement('div');
  target.setPointerCapture = vi.fn();
  target.releasePointerCapture = vi.fn();
  const previews = [], strokes = [], errors = [];
  const onStroke = vi.fn(async pts => { strokes.push(structuredClone(pts)); });
  const input = pen.installKonvaPenInput({
    target,
    worldPoint: event => [event.clientX / 2, (event.clientY + 10) / 2],
    onPreview: pts => previews.push(pts && structuredClone(pts)),
    onStroke,
    onError: error => errors.push(error),
  });
  return { target, previews, strokes, errors, onStroke, input };
}
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

describe('Konva pen input pointer capture', () => {
  it('records one world-space stroke on pointerup and clears the preview after saving', async () => {
    const { target, strokes, previews, onStroke, input } = makePointerCapture();
    emit(target, 'pointerdown', { x: 30, y: 20 });
    emit(target, 'pointermove', { x: 42, y: 28 });
    emit(target, 'pointerup', { x: 60, y: 36 });
    await flush();
    expect(strokes).toEqual([[[15, 15], [21, 19], [30, 23]]]);
    expect(previews.at(-1)).toBeNull();
    expect(onStroke).toHaveBeenCalledOnce();
    input.destroy();
  });

  it('ignores taps and cancels unfinished strokes on pointercancel', async () => {
    const { target, strokes, input } = makePointerCapture();
    emit(target, 'pointerdown');
    emit(target, 'pointerup');
    emit(target, 'pointerdown');
    emit(target, 'pointermove', { x: 42, y: 30 });
    emit(target, 'pointercancel');
    await flush();
    expect(strokes).toEqual([]);
    input.destroy();
  });

  it('does not save accidental multi-touch drawing or re-arm until all pointers release', async () => {
    const { target, strokes, input } = makePointerCapture();
    emit(target, 'pointerdown', { pointerId: 10, pointerType: 'touch' });
    emit(target, 'pointermove', { pointerId: 10, pointerType: 'touch', x: 30 });
    emit(target, 'pointerdown', { pointerId: 11, pointerType: 'touch', x: 45 });
    emit(target, 'pointerup', { pointerId: 11, pointerType: 'touch', x: 45 });
    emit(target, 'pointermove', { pointerId: 10, pointerType: 'touch', x: 70 });
    emit(target, 'pointerup', { pointerId: 10, pointerType: 'touch', x: 80 });
    await flush();
    expect(strokes).toEqual([]);
    input.destroy();
  });

  it('rejects secondary mouse buttons and duplicate drawing while a write is pending', async () => {
    let finishWrite;
    const target = document.createElement('div');
    const onStroke = vi.fn(() => new Promise(resolve => { finishWrite = resolve; }));
    const input = pen.installKonvaPenInput({
      target, worldPoint: e => [e.clientX, e.clientY],
      onPreview: vi.fn(), onStroke,
    });
    emit(target, 'pointerdown', { button: 2 });
    emit(target, 'pointermove', { x: 25 });
    emit(target, 'pointerup', { x: 40 });
    expect(onStroke).not.toHaveBeenCalled();
    emit(target, 'pointerdown');
    emit(target, 'pointermove', { x: 28 });
    emit(target, 'pointerup', { x: 38 });
    await flush();
    expect(onStroke).toHaveBeenCalledOnce();
    emit(target, 'pointerdown', { pointerId: 2 });
    emit(target, 'pointermove', { pointerId: 2, x: 32 });
    emit(target, 'pointerup', { pointerId: 2, x: 50 });
    await flush();
    expect(onStroke).toHaveBeenCalledOnce();
    finishWrite();
    await flush();
    input.destroy();
  });

  it('detaches event handlers and does not write after disposal', async () => {
    const { target, strokes, input } = makePointerCapture();
    emit(target, 'pointerdown');
    input.destroy();
    emit(target, 'pointermove', { x: 60 });
    emit(target, 'pointerup', { x: 70 });
    await flush();
    expect(strokes).toEqual([]);
  });
});

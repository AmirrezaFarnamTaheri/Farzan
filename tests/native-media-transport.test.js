import { describe, expect, it, vi } from 'vitest';
import { createNativeMediaTransport } from '../src/features/nativeMediaTransport.js';

function fakeMedia() {
  return {
    currentTime: 0, duration: 120,
    volume: 0.8, muted: false,
    play: vi.fn(async () => {}), pause: vi.fn(),
  };
}

describe('native HTMLMediaElement transport replacement', () => {
  it('delegates play and pause to native media with original promise behavior', async () => {
    const media = fakeMedia();
    const transport = createNativeMediaTransport(media);
    await expect(transport.play()).resolves.toBeUndefined();
    expect(media.play).toHaveBeenCalledOnce();
    transport.pause();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it('clamps finite seeks without overriding an unloaded or live-stream duration', () => {
    const media = fakeMedia();
    const transport = createNativeMediaTransport(media);
    expect(transport.seek(400, 120)).toBe(true);
    expect(media.currentTime).toBe(120);
    expect(transport.seek(-25, 120)).toBe(true);
    expect(media.currentTime).toBe(0);
    expect(transport.seek(25.5, 120)).toBe(true);
    expect(media.currentTime).toBe(25.5);
    for (const [seek, duration] of [[NaN, 120], [Infinity, 120], [5, 0], [5, Infinity]]) {
      expect(transport.seek(seek, duration)).toBe(false);
      expect(media.currentTime).toBe(25.5);
    }
  });

  it('bounds relative seeks using the same authoritative native currentTime', () => {
    const media = fakeMedia();
    media.currentTime = 40;
    const transport = createNativeMediaTransport(media);
    expect(transport.seekBy(20, 120)).toBe(true);
    expect(media.currentTime).toBe(60);
    expect(transport.seekBy(-1000, 120)).toBe(true);
    expect(media.currentTime).toBe(0);
  });

  it('keeps valid volume and mute on malformed sliders rather than assigning NaN to native volume', () => {
    const media = fakeMedia();
    const transport = createNativeMediaTransport(media);
    expect(transport.volume('not-a-number')).toBe(0.8);
    expect(media.volume).toBe(0.8);
    expect(transport.volume(Infinity)).toBe(0.8);
    expect(transport.volume(2)).toBe(1);
    expect(transport.volume(-2)).toBe(0);
    media.muted = true;
    expect(transport.volume(0.4)).toBe(0.4);
    expect(media.muted).toBe(false);
    expect(transport.toggleMute()).toBe(true);
    expect(media.muted).toBe(true);
  });

  it('does not persist a shadow transport state separate from the native element', () => {
    const media = fakeMedia();
    const transport = createNativeMediaTransport(media);
    media.currentTime = 33;
    media.volume = 0.25;
    expect(transport.seekBy(7, 120)).toBe(true);
    expect(media.currentTime).toBe(40);
    expect(transport.volume(0.5)).toBe(0.5);
    expect(media.volume).toBe(0.5);
  });

  it('rejects a transport without native media methods', () => {
    expect(() => createNativeMediaTransport(null)).toThrow(/media element/i);
    expect(() => createNativeMediaTransport({})).toThrow(/media element/i);
  });
});

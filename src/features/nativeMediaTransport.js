/**
 * Media transport owns no playback state: HTMLMediaElement stays authoritative.
 * Playback, duration, currentTime, volume and muted are always native values,
 * avoiding a second player engine or redundant storage/synchronization layer.
 */
export function createNativeMediaTransport(media) {
  if (!media || typeof media.play !== 'function' || typeof media.pause !== 'function') {
    throw new TypeError('A native media element is required');
  }
  const seek = (time, duration) => {
    const seconds = Number(time);
    const limit = Number(duration);
    if (!Number.isFinite(seconds) || !Number.isFinite(limit) || limit <= 0) return false;
    media.currentTime = Math.min(limit, Math.max(0, seconds));
    return true;
  };
  return Object.freeze({
    play: () => media.play(),
    pause: () => media.pause(),
    seek,
    seekBy: (delta, duration) => {
      if (!Number.isFinite(Number(delta))) return false;
      return seek(Number(media.currentTime) + Number(delta), duration);
    },
    volume: level => {
      const input = Number(level);
      if (!Number.isFinite(input)) return media.volume;
      const next = Math.min(1, Math.max(0, input));
      media.volume = next;
      if (next > 0) media.muted = false;
      return next;
    },
    toggleMute: () => {
      media.muted = !media.muted;
      return media.muted;
    },
  });
}

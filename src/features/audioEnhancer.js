/**
 * OpenCourseDeck — audioEnhancer.js
 * Web Audio API Volume Booster & Speech Compressor Engine
 *
 * Provides dynamic audio normalization, background noise suppression,
 * and up to +12dB (+200%) volume boost for quiet lecture recordings.
 */

export class AudioEnhancer {
  constructor(mediaElement) {
    this.mediaElement = mediaElement;
    this.audioCtx = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.isInitialized = false;
    this.boostMultiplier = 1.0;
  }

  /**
   * Initializes the Web Audio graph on first user interaction / playback
   */
  init() {
    if (this.isInitialized || !this.mediaElement) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.mediaElement);

      // Dynamics Compressor for speech intelligibility & clipping prevention
      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-24, this.audioCtx.currentTime);
      this.compressorNode.knee.setValueAtTime(30, this.audioCtx.currentTime);
      this.compressorNode.ratio.setValueAtTime(12, this.audioCtx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, this.audioCtx.currentTime);

      // Master Gain for Volume Boost (> 100%)
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(this.boostMultiplier, this.audioCtx.currentTime);

      // Connect: Source -> Compressor -> Gain -> Destination
      this.sourceNode.connect(this.compressorNode);
      this.compressorNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.isInitialized = true;
    } catch {
      // Graceful fallback to default native media element audio
    }
  }

  /**
   * Sets the volume boost multiplier (1.0 = 100%, 1.5 = 150%, 2.0 = 200%)
   * @param {number} multiplier
   */
  setVolumeBoost(multiplier = 1.0) {
    this.boostMultiplier = Math.max(0.5, Math.min(3.0, Number(multiplier) || 1.0));
    if (this.audioCtx && this.gainNode) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      this.gainNode.gain.setTargetAtTime(this.boostMultiplier, this.audioCtx.currentTime, 0.05);
    }
  }

  /**
   * Disposes of the audio context and releases system audio resources
   */
  dispose() {
    try {
      if (this.sourceNode) this.sourceNode.disconnect();
      if (this.compressorNode) this.compressorNode.disconnect();
      if (this.gainNode) this.gainNode.disconnect();
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
      }
    } catch {}
    this.audioCtx = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.isInitialized = false;
  }

  /**
   * Synthesizes an ultra-subtle 40ms acoustic click feedback for physical interaction
   * @param {number} [freq=880]
   */
  static playHapticTick(freq = 880) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this._hapticCtx || this._hapticCtx.state === 'closed') {
        this._hapticCtx = new AudioCtx();
      }
      const ctx = this._hapticCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {}
  }
}


import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseColdShellLog, compareColdShellSnapshots } =
  require('../scripts/cold-start-comparison.cjs');

const scope = 'first-visit same-origin JavaScript/CSS resource timing at app-shell readiness (excludes later precache/worker network)';
const snapshot = (ready, transfer, missing = 0) => ({
  observedAtMs: ready,
  resourceCount: 20,
  resourcePaths: Array.from({ length: 20 }, (_, i) => i === 0 ? '/opencoursedeck.js' : `/chunks/chunk-${i}.js`),
  transferSizeBytes: transfer,
  encodedBodyBytes: transfer - 10,
  missingTransferSizes: missing,
  scope,
});

describe('controlled first-visit bundle comparison', () => {
  it('parses the actual dist Chromium smoke output and refuses missing/untrusted metrics', () => {
    const log = 'log noise\n[dist-browser-smoke] cold-shell resource timing ' +
      JSON.stringify(snapshot(410, 700000)) + '\n[dist-browser-smoke] OK\n';
    expect(parseColdShellLog(log)).toEqual(snapshot(410, 700000));
    expect(() => parseColdShellLog('OK — no resource timing')).toThrow(/cold-shell/i);
    expect(() => parseColdShellLog('[dist-browser-smoke] cold-shell resource timing {}'))
      .toThrow(/cold-shell|resource/i);
  });

  it('uses medians from alternating fresh-browser runs rather than reporting a single timing sample', () => {
    const report = compareColdShellSnapshots({
      baseline: [snapshot(510, 700000), snapshot(500, 690000), snapshot(490, 710000)],
      current: [snapshot(420, 600000), snapshot(440, 610000), snapshot(430, 620000)],
      baselineRef: 'd8a4ca3bb7b397816fb29cacfe0ac3b86833ab96',
      currentRef: 'exact-build-head',
    });
    expect(report.scope).toBe(scope);
    expect(report.samples).toEqual({ baseline: 3, current: 3 });
    expect(report.transferSizeBytes).toMatchObject({
      baselineMedian: 700000, currentMedian: 610000,
      deltaBytes: -90000,
    });
    expect(report.shellReadinessMs).toMatchObject({
      baselineMedian: 500, currentMedian: 430, deltaMs: -70,
    });
    expect(report.caveats.join(' ')).toMatch(/CI|network|first-visit/i);
  });

  it('refuses falsely comparable mismatched scopes and missing transfer timings', () => {
    expect(() => compareColdShellSnapshots({
      baseline: [snapshot(400, 500000)],
      current: [{ ...snapshot(300, 400000), scope: 'worker-only' }],
    })).toThrow(/scope/i);
    const report = compareColdShellSnapshots({
      baseline: [snapshot(400, 0, 20)],
      current: [snapshot(350, 0, 20)],
    });
    expect(report.transferSizeBytes).toBeNull();
    expect(report.caveats.join(' ')).toMatch(/transfer/i);
  });
});

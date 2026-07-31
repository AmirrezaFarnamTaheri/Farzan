import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { removeProfileDirectory, runChromeUntilResult, terminateProfileProcesses } from '../scripts/dist-browser-smoke.cjs';

describe('browser smoke script wiring', () => {
  it('keeps browser smoke wired into package scripts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['smoke:browser']).toBe('node scripts/browser-smoke.cjs');
    expect(packageJson.scripts['smoke:dist-browser']).toBe('node scripts/dist-browser-smoke.cjs');
    expect(packageJson.scripts.ci).toContain('npm run smoke:browser');
    expect(packageJson.scripts.ci).toContain('npm run smoke:dist-browser');
  });

  it('validates the built entry bundle and exercises staged production workers through the public namespace', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts/dist-browser-smoke.cjs'), 'utf8');

    expect(source).toContain("path.join(DIST, 'opencoursedeck.js')");
    expect(source).toContain('new Worker(pd.workers.catalog');
    expect(source).toContain('new Worker(pd.workers.search');
  });

  it('separates application readiness from the OpenCourseDeck namespace value', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts/dist-browser-smoke.cjs'), 'utf8');

    expect(source).not.toContain('const pd = await waitFor');
    expect(source).toContain('const pd = window.OpenCourseDeck;');
  });

  it('does not convert a passed scenario into a failure when result reporting breaks', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'scripts/dist-browser-smoke.cjs'), 'utf8');
    const passedStatus = source.indexOf("result.dataset.status = 'passed'");
    const guardedReport = source.indexOf("try {\n    await report('passed', detail);", passedStatus);
    const failureHandler = source.indexOf('run().catch(async error =>', passedStatus);

    expect(passedStatus).toBeGreaterThan(-1);
    expect(guardedReport).toBeGreaterThan(passedStatus);
    expect(guardedReport).toBeLessThan(failureHandler);
    expect(source).toContain("console.error('[dist-browser-smoke] result report failed', reportError)");
  });

  it('stops Chrome after the page reports completion instead of waiting for browser exit', async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    const signals = [];
    child.kill = signal => {
      signals.push(signal);
      queueMicrotask(() => {
        child.exitCode = 0;
        child.signalCode = signal;
        child.emit('exit', 0, signal);
      });
      return true;
    };

    const execution = await runChromeUntilResult(
      '/usr/bin/google-chrome',
      ['--headless=new'],
      Promise.resolve({ status: 'passed', detail: { fullWipe: true } }),
      { spawn: () => child, timeoutMs: 100 },
    );

    expect(execution.result).toEqual({ status: 'passed', detail: { fullWipe: true } });
    expect(signals).toEqual(['SIGTERM']);
  });

  it('retries transient Chrome profile cleanup races with bounded backoff', async () => {
    const calls = [];
    const waits = [];
    let remainingFailures = 2;
    await removeProfileDirectory('/tmp/chrome-profile', {
      attempts: 4,
      retryDelayMs: 25,
      terminate: () => {},
      wait: async delay => { waits.push(delay); },
      rm: async (directory, options) => {
        calls.push({ directory, options });
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          const error = new Error('profile still in use');
          error.code = remainingFailures ? 'EBUSY' : 'ENOTEMPTY';
          throw error;
        }
      },
    });

    expect(calls).toHaveLength(3);
    expect(calls.every(call => call.directory === '/tmp/chrome-profile')).toBe(true);
    expect(calls.every(call => call.options.recursive === true && call.options.force === true)).toBe(true);
    expect(waits).toEqual([25, 50]);
  });

  it('targets only Chrome processes bound to the unique smoke profile', () => {
    const calls = [];
    terminateProfileProcesses('/tmp/chrome-profile', (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    });

    if (process.platform === 'linux') {
      expect(calls).toHaveLength(2);
      expect(calls.map(call => call.args)).toEqual([
        ['-TERM', '-f', '--user-data-dir=/tmp/chrome-profile'],
        ['-KILL', '-f', '--user-data-dir=/tmp/chrome-profile'],
      ]);
    } else {
      expect(calls).toHaveLength(0);
    }
  });
});

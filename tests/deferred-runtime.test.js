import { describe, expect, it, vi } from 'vitest';
import { runIndependentInitializers } from '../src/core/deferredRuntime.js';

describe('independent deferred startup initializers', () => {
  it('does not skip working features when an unrelated optional module rejects', async () => {
    const didRun = [];
    const broken = new Error('Translator unavailable');
    const onFailure = vi.fn();
    const result = await runIndependentInitializers([
      { name: 'translator', run: async () => { didRun.push('translator'); throw broken; } },
      { name: 'note-templates', run: async () => { didRun.push('templates'); } },
      { name: 'command-palette', run: async () => { didRun.push('palette'); } },
    ], { onFailure });

    expect(didRun).toEqual(['translator', 'templates', 'palette']);
    expect(result).toEqual([
      { name: 'translator', status: 'rejected', reason: broken },
      { name: 'note-templates', status: 'fulfilled' },
      { name: 'command-palette', status: 'fulfilled' },
    ]);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('translator', broken);
  });

  it('isolates synchronously throwing add-content initialization', async () => {
    const initialized = [];
    const issue = new Error('Cannot register add-content');
    const onFailure = vi.fn();
    const result = await runIndependentInitializers([
      { name: 'add-content', run: () => { throw issue; } },
      { name: 'command-palette', run: () => initialized.push('palette') },
    ], { onFailure });

    expect(initialized).toEqual(['palette']);
    expect(result[0]).toMatchObject({ name: 'add-content', status: 'rejected', reason: issue });
    expect(result[1]).toMatchObject({ name: 'command-palette', status: 'fulfilled' });
  });

  it('keeps logging failures from preventing other initializers from running', async () => {
    const initialized = vi.fn();
    const result = await runIndependentInitializers([
      { name: 'translator', run: async () => { throw new Error('disabled'); } },
      { name: 'command-palette', run: initialized },
    ], { onFailure: () => { throw new Error('Logger unavailable'); } });

    expect(initialized).toHaveBeenCalledOnce();
    expect(result.map(task => task.status)).toEqual(['rejected', 'fulfilled']);
  });
});

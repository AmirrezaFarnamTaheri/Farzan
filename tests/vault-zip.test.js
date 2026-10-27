import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createVaultZip } from '../src/features/vaultZip.js';

describe('standards-compatible vault ZIP export', () => {
  it('round-trips the manifest and Markdown with an established ZIP decoder', async () => {
    const files = [
      { path: 'manifest.json', content: '{"version":1}', type: 'application/json' },
      { path: 'notes/sample.md', content: '# Study notes\nAortic physiology\n', type: 'text/markdown' },
    ];
    const blob = createVaultZip(files);
    expect(blob.type).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual(['manifest.json', 'notes/sample.md']);
    expect(strFromU8(entries['manifest.json'])).toBe('{"version":1}');
    expect(strFromU8(entries['notes/sample.md'])).toBe('# Study notes\nAortic physiology\n');
  });

  it('preserves Persian and Unicode filenames and text through extraction', async () => {
    const blob = createVaultZip([{ path: 'notes/فیزیولوژی.md', content: 'قلب و عروق — 你好世界' }]);
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['notes/فیزیولوژی.md']);
    expect(strFromU8(entries['notes/فیزیولوژی.md'])).toBe('قلب و عروق — 你好世界');
  });

  it.each(['../outside.txt', '/absolute.txt', 'notes/../../outside.md', 'notes\\escape.md', ''])(
    'rejects unsafe ZIP entry name %s', (path) => {
      expect(() => createVaultZip([{ path, content: 'test' }])).toThrow(/unsafe zip entry/i);
    },
  );

  it('refuses duplicate file paths rather than silently replacing saved notes', () => {
    expect(() => createVaultZip([
      { path: 'notes/n.md', content: 'first' },
      { path: 'notes/n.md', content: 'second' },
    ])).toThrow(/duplicate zip entry/i);
  });
});

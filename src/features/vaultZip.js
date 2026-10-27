/**
 * Portable offline study exports. Keep the vault archive's file names,
 * UTF-8 contents and uncompressed ZIP entries, but delegate the ZIP spec,
 * CRC-32, central directory and Unicode flags to the maintained fflate API.
 *
 * This function deliberately does not make network requests or mutate
 * persisted data. Callers continue to download a standard application/zip Blob.
 */
import { strToU8, zipSync } from 'fflate';

function assertSafePath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\\0')
    || path.split('/').some(segment => !segment || segment === '.' || segment === '..')
    || /^[a-z]:/i.test(path)) {
    throw new Error('Unsafe ZIP entry name');
  }
}

export function createVaultZip(files) {
  const entries = Object.create(null);
  for (const file of files) {
    const path = String(file?.path ?? '');
    assertSafePath(path);
    if (Object.hasOwn(entries, path)) throw new Error('Duplicate ZIP entry name');
    entries[path] = strToU8(String(file?.content ?? ''));
  }
  // Store entries without deflation: exported Markdown stays inspectable,
  // and existing tests/users can recover notes without a proprietary format.
  const bytes = zipSync(entries, { level: 0 });
  return new Blob([bytes], { type: 'application/zip' });
}

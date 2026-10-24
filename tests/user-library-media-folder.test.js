import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import {
  addPdfFile, clearLibraryFiles, exportLibraryMediaDirectory,
  importLibraryMediaDirectory, listMissingLibraryFiles, loadLibrary,
} from '../src/features/userLibrary.js';

function fakeDirectory() {
  const files = new Map();
  const folder = () => ({
    async getDirectoryHandle(name, { create } = {}) {
      if (!files.has(name) && create) files.set(name, folder());
      if (!files.has(name)) throw new Error('Missing folder: ' + name);
      return files.get(name);
    },
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name) && create) {
        const state = { blob: null };
        files.set(name, {
          async createWritable() {
            return {
              async write(blob) { state.blob = blob; },
              async close() {},
            };
          },
          async getFile() {
            if (!state.blob) throw new Error('No file bytes');
            const content = state.blob;
            return new File([content], name, { type: content.type });
          },
        });
      }
      if (!files.has(name)) throw new Error('Missing file: ' + name);
      return files.get(name);
    },
    _entries: files,
  });
  return folder();
}

describe('opt-in complete media-folder backup and restore', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', indexedDB);
    const settings = {};
    window.DB = {
      getSetting: vi.fn(async key => settings[key] ?? null),
      saveSetting: vi.fn(async (key, value) => { settings[key] = value; return value; }),
    };
    window.DataStore = { mergeRaw: vi.fn() };
    window.OpenCourseDeck = { bus: { emit: vi.fn() } };
  });

  it('streams imported PDFs into a folder and restores their original stable file references', async () => {
    const media = new File(['%PDF-1.4 original bytes'], 'original.pdf', { type: 'application/pdf' });
    const created = await addPdfFile(media);
    const original = (await loadLibrary()).courses[created.courseId].sources[0].topics[0].pdfs[0].url;
    const directory = fakeDirectory();
    const exported = await exportLibraryMediaDirectory(directory);
    expect(exported.files).toBe(1);
    const manifest = JSON.parse(await (await directory.getFileHandle('media-manifest.json')).getFile().then(f => f.text()));
    expect(manifest.format).toBe('opencoursedeck-media-folder');
    expect(manifest.files).toEqual([expect.objectContaining({ ref: original, name: 'original.pdf', size: media.size })]);
    await clearLibraryFiles();
    expect((await listMissingLibraryFiles()).map(x => x.ref)).toContain(original);
    const imported = await importLibraryMediaDirectory(directory);
    expect(imported.restored).toBe(1);
    expect(await listMissingLibraryFiles()).toHaveLength(0);
    const after = (await loadLibrary()).courses[created.courseId].sources[0].topics[0].pdfs[0].url;
    expect(after).toBe(original);
  });

  it('rejects a tampered media folder manifest before any relinking', async () => {
    const directory = fakeDirectory();
    const manifest = {
      format: 'opencoursedeck-media-folder', version: 1,
      files: [{ id: '../escape', ref: 'library-file:../escape', file: '../escape.bin', name: 'a.pdf', size: 4, kind: 'pdf' }],
    };
    const h = await directory.getFileHandle('media-manifest.json', { create: true });
    const writer = await h.createWritable();
    await writer.write(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
    await writer.close();
    await expect(importLibraryMediaDirectory(directory)).rejects.toThrow(/invalid|unsafe/i);
  });
});

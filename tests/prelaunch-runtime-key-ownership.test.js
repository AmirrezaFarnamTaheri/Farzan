import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pre-release storage and AI ownership', () => {
  it('never adopts unshipped preference, course, playlist or Studio key aliases', () => {
    for (const path of [
      'bridge.js',
      'progress.js',
      'src/core/storageSafety.js',
      'src/features/aiClient.js',
    ]) {
      const source = fs.readFileSync(path, 'utf8');
      for (const oldKey of [
        'plasma_progress_v1', 'plasma_timestamps_v1',
        'plasma-playlists', 'plasma-studio-board', 'plasma-canvas-board',
        'ocd_canvas_board', 'ocd_my_courses',
        'plasma_accent', 'plasma_density', 'plasma_font_scale', 'plasma_dir',
        'plasma_theme', 'plasma_sidebar_collapsed',
        'plasma-ai-api-key-session', 'plasma-ai-authority-session',
      ]) expect(source.includes(oldKey), `${path}: ${oldKey}`).toBe(false);
    }
  });
  it('retains only current, scoped reset keys', () => {
    const source = fs.readFileSync('bridge.js', 'utf8');
    for (const live of ['ocd_playlists', 'ocd_studio_board', 'ocd_pdf_annotations_by_page']) {
      expect(source).toContain(live);
    }
    expect(source).toContain("'ocd_progress_fallback_v1'");
    expect(source).toContain("'ocd_timestamps_fallback_v1'");
    expect(fs.readFileSync('src/features/aiClient.js', 'utf8'))
      .toContain("'ocd_ai_api_key_session'");
  });
});

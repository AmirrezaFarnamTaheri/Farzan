import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pre-release backup import mirror ownership', () => {
  it('does not snapshot discarded localStorage progress and timestamp fallbacks', () => {
    const progress = fs.readFileSync('progress.js', 'utf8');
    for (const obsolete of ['ocd_progress_fallback_v1', 'ocd_timestamps_fallback_v1']) {
      expect(progress, obsolete + ' must not be a live import rollback mirror').not.toContain(obsolete);
    }
    // Current library, Studio and Notes UI mirrors remain protected during
    // non-atomic settings workflows; this does not drop current user data.
    for (const current of ['ocd_studio_board', 'ocd_notes_settings', 'ocd_user_library']) {
      expect(progress).toContain(current);
    }
  });
});

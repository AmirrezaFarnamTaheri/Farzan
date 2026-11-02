import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native Windows packaged app change detection', () => {
  it('runs Windows executable assurance when any packaged entry source changes on main or a PR', () => {
    const workflow = fs.readFileSync('.github/workflows/native-windows.yml', 'utf8');
    const required = ['boot.js', 'bridge.js', 'data.js', 'pdf.js', 'pdf-runtime.js', 'style.css'];
    for (const file of required) {
      const occurrences = workflow.split("      - '" + file + "'").length - 1;
      expect(occurrences, file + ' must trigger both push and pull_request native builds').toBe(2);
    }
    for (const existing of ['app.js', 'notes.js', 'canvas.js', 'src/index.js']) {
      expect(workflow.split("      - '" + existing + "'").length - 1).toBe(2);
    }
  });
});

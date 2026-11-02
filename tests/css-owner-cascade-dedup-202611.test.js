import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

// Only identical selector / context / property / value pairs are eligible.
// The lower-priority source stays unchanged for every OTHER declaration.
const canonical = [
  [
    "components.css",
    "farzan-redesign.css",
    ".breadcrumb-current",
    "color",
    "var(--text-primary)"
  ],
  [
    "components.css",
    "farzan-redesign.css",
    ".nav-group-label",
    "display",
    "block"
  ],
  [
    "components.css",
    "farzan-redesign.css",
    ".topbar-action-btn",
    "color",
    "var(--text-secondary)"
  ],
  [
    "components.css",
    "farzan-redesign.css",
    ".topbar-action-btn",
    "border",
    "1px solid transparent"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-subtitle",
    "color",
    "var(--text-secondary)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-actions",
    "display",
    "flex"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-actions",
    "flex-wrap",
    "wrap"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-actions",
    "margin-top",
    "var(--space-6)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-command-strip",
    "margin-top",
    "var(--space-6)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-command-strip strong",
    "color",
    "var(--text-primary)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-focus-head",
    "align-items",
    "flex-start"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-focus-status",
    "font-size",
    "var(--text-xs)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-focus-action",
    "color",
    "var(--text-primary)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-pulse-grid",
    "gap",
    "var(--space-3)"
  ],
  [
    "views.css",
    "workspace.css",
    ".home-pulse-item",
    "padding",
    "var(--space-4)"
  ],
  [
    "views.css",
    "enhancements.css",
    ".studio-canvas",
    "display",
    "block"
  ],
  [
    "views.css",
    "workspace.css",
    ".notfound-requested",
    "overflow-wrap",
    "anywhere"
  ],
  [
    "layout.css",
    "farzan-redesign.css",
    ".sidebar",
    "width",
    "var(--sidebar-width)"
  ],
  [
    "layout.css",
    "farzan-redesign.css",
    ".topbar",
    "min-height",
    "var(--topbar-height)"
  ],
  [
    "layout.css",
    "farzan-redesign.css",
    ".view-container",
    "flex",
    "1 1 auto"
  ],
  [
    "layout.css",
    "farzan-redesign.css",
    ".view-container",
    "min-height",
    "0"
  ],
  [
    "layout.css",
    "farzan-redesign.css",
    ".sidebar-logo-text",
    "min-width",
    "0"
  ],
  [
    "layout.css",
    "farzan-redesign.css",
    ".sidebar-collapse-btn",
    "margin-left",
    "auto"
  ],
  [
    "enhancements.css",
    "workspace.css",
    ".view-courses .filter-chip",
    "color",
    "var(--text-secondary)"
  ],
  [
    "study-polish.css",
    "workspace.css",
    ".home-command-strip",
    "color",
    "var(--text-secondary)"
  ]
];

describe('canonical CSS cascade property ownership (#175)', () => {
  it.each(canonical)('removes duplicate %s -> %s for %s %s without dropping the final value',
    (early, owner, selector, property, value) => {
      const report = inventoryCss();
      const sources = report.stylesheets.map(sheet => sheet.file);
      expect(sources.indexOf(early)).toBeLessThan(sources.indexOf(owner));
      const declarations = file => report.rules
        .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
        .flatMap(rule => parseDeclarations(rule.body))
        .filter(decl => decl.property === property).map(decl => decl.value);
      expect(declarations(early), 'obsolete earlier owner: ' + selector + ' ' + property)
        .not.toContain(value);
      expect(declarations(owner), 'canonical value: ' + selector + ' ' + property)
        .toContain(value);
      const actual = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      // A still-later redesign owner may intentionally use a different paint
      // (e.g. Home dark hero contrast). Removing an earlier identical copy
      // cannot change that final override; require it to stay downstream.
      expect(actual?.owner.file).toBeDefined();
      expect(sources.indexOf(actual.owner.file)).toBeGreaterThanOrEqual(sources.indexOf(owner));
    });
});

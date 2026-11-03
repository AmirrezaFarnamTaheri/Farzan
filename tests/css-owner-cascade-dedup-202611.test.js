import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

// Ownership checks track the active final selector/property value after
// pre-release cascade consolidation. Earlier values can differ, but cannot
// shadow the authoritative later owner or silently reintroduce old paint.
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
    "farzan-redesign.css",
    ".home-subtitle",
    "color",
    "#d5e8f6"
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
    "farzan-redesign.css",
    ".home-actions",
    "margin-top",
    "25px"
  ],
  [
    "views.css",
    "farzan-redesign.css",
    ".home-command-strip",
    "margin-top",
    "24px"
  ],
  [
    "views.css",
    "farzan-redesign.css",
    ".home-command-strip strong",
    "color",
    "#fff"
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
    "farzan-redesign.css",
    ".home-focus-action",
    "color",
    "#205389"
  ],
  [
    "views.css",
    "farzan-redesign.css",
    ".home-pulse-grid",
    "gap",
    "10px"
  ],
  [
    "views.css",
    "farzan-redesign.css",
    ".home-pulse-item",
    "padding",
    "14px"
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
    "farzan-redesign.css",
    ".view-courses .filter-chip",
    "color",
    "var(--fz-muted)"
  ],
  [
    "study-polish.css",
    "farzan-redesign.css",
    ".home-command-strip",
    "color",
    "#d5e4ee"
  ]
];

describe('canonical CSS cascade property ownership (#175)', () => {
  it.each(canonical)('keeps authoritative %s -> %s source ownership for %s %s',
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

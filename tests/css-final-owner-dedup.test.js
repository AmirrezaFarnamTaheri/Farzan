import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inventoryCss, parseDeclarations } = require('../scripts/css-owner-inventory.cjs');

describe('final-layer shared workspace style ownership (#175)', () => {
  it('retains seven proven final enhancement declarations without earlier duplicate values', () => {
    const report = inventoryCss();
    const rules = report.rules;
    // All of these are the same selector, property, value and empty at-rule
    // context in the SAME enhancement layer. The later farzan-redesign.css
    // declaration is authoritative; removing its earlier exact duplicate
    // cannot change same-layer cascade order or the computed value.
    const duplicates = [
      ['workspace.css', '.view-courses .filter-chip', 'background', 'var(--surface)'],
      ['workspace.css', '.home-title', 'font-family', 'var(--font-serif)'],
      ['study-polish.css', '.home-focus-panel', 'justify-content', 'center'],
      ['study-polish.css', '.home-focus-panel', 'min-height', '0'],
      ['study-polish.css', '.home-focus-progress', 'box-shadow', 'none'],
      ['workspace.css', '.home-pulse-item', 'background', 'var(--surface)'],
      ['workspace.css', '.card:hover, .card.card-interactive:hover', 'transform', 'none'],
    ];
    for (const [earlier, selector, property, value] of duplicates) {
      const declarations = file => rules
        .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
        .flatMap(rule => parseDeclarations(rule.body))
        .filter(item => item.property === property).map(item => item.value);
      expect(declarations(earlier), `${selector} ${property}: earlier ${earlier}`).not.toContain(value);
      expect(declarations('farzan-redesign.css'), `${selector} ${property}: final owner`).toContain(value);
      const final = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(final?.owner.file).toBe('farzan-redesign.css');
    }
  });
  it('leaves 15 exact view primitives to their authoritative final enhancement owner', () => {
    const report = inventoryCss();
    const manifest = report.stylesheets.map(sheet => sheet.file);
    expect(manifest.indexOf('views.css')).toBeLessThan(manifest.indexOf('farzan-redesign.css'));
    const primitives = [
          [
                ".home-title",
                "font-family",
                "var(--font-serif)"
          ],
          [
                ".home-grid",
                "display",
                "grid"
          ],
          [
                ".home-widget-copy",
                "min-width",
                "0"
          ],
          [
                ".courses-shell",
                "display",
                "grid"
          ],
          [
                ".courses-shell",
                "align-items",
                "start"
          ],
          [
                ".courses-list",
                "display",
                "grid"
          ],
          [
                ".course-item",
                "width",
                "100%"
          ],
          [
                ".course-item",
                "text-align",
                "start"
          ],
          [
                ".topic-row",
                "display",
                "grid"
          ],
          [
                ".topic-row",
                "align-items",
                "center"
          ],
          [
                ".view-studio",
                "display",
                "grid"
          ],
          [
                ".studio-toolbar-clusters",
                "display",
                "flex"
          ],
          [
                ".studio-toolbar-clusters",
                "flex-wrap",
                "wrap"
          ],
          [
                ".studio-toolbar-clusters",
                "align-items",
                "center"
          ],
          [
                ".studio-shell",
                "position",
                "relative"
          ]
    ];
    const values = (file, selector, property) => report.rules
      .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
      .flatMap(rule => parseDeclarations(rule.body))
      .filter(item => item.property === property).map(item => item.value);

    for (const [selector, property, value] of primitives) {
      expect(values('views.css', selector, property),
        `${selector} ${property}: redundant base owner`).not.toContain(value);
      expect(values('farzan-redesign.css', selector, property),
        `${selector} ${property}: final enhancement owner`).toContain(value);
      const owner = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(owner?.owner.file, `${selector} ${property}: final source`)
        .toBe('farzan-redesign.css');
    }
  });

  it('retires shadowed desktop shell declarations instead of preserving obsolete pre-release cascade', () => {
    const report = inventoryCss();
    const retire = [
      [
            "layout.css",
            ".ocd-app",
            "min-height"
      ],
      [
            "layout.css",
            ".ocd-app",
            "background"
      ],
      [
            "layout.css",
            ".sidebar",
            "height"
      ],
      [
            "layout.css",
            ".sidebar",
            "background"
      ],
      [
            "layout.css",
            ".sidebar",
            "box-shadow"
      ],
      [
            "layout.css",
            ".sidebar",
            "backdrop-filter"
      ],
      [
            "layout.css",
            ".sidebar",
            "position"
      ],
      [
            "layout.css",
            ".sidebar",
            "top"
      ],
      [
            "layout.css",
            ".main-content",
            "height"
      ],
      [
            "layout.css",
            ".topbar",
            "box-shadow"
      ],
      [
            "layout.css",
            ".topbar",
            "position"
      ],
      [
            "layout.css",
            ".topbar",
            "top"
      ],
      [
            "layout.css",
            ".view-container",
            "scroll-padding-top"
      ],
      [
            "layout.css",
            ".sidebar-logo",
            "background"
      ],
      [
            "layout.css",
            ".sidebar-logo-icon",
            "box-shadow"
      ],
      [
            "components.css",
            ".breadcrumb-current",
            "font-weight"
      ],
      [
            "components.css",
            ".topbar-action-btn",
            "width"
      ],
      [
            "components.css",
            ".topbar-action-btn",
            "height"
      ]
];
    const owned = (file, selector, property) => report.rules
      .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
      .flatMap(rule => parseDeclarations(rule.body))
      .filter(decl => decl.property === property);
    for (const [file, selector, property] of retire) {
      expect(owned(file, selector, property), `${file}: ${selector} ${property}`).toHaveLength(0);
      const final = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(final?.owner.file, `final owner: ${selector} ${property}`)
        .toBe('farzan-redesign.css');
    }
  });

  it('removes 21 obsolete global Home declarations shadowed by the final redesign', () => {
    const report = inventoryCss();
    const candidates = [[".home-title","margin"],[".home-title","max-width"],[".home-title","font-size"],[".home-title","line-height"],[".home-title","letter-spacing"],[".home-title","color"],[".home-subtitle","max-width"],[".home-subtitle","font-size"],[".home-subtitle","line-height"],[".home-focus-panel","align-self"],[".home-focus-panel","padding"],[".home-focus-panel","border-radius"],[".home-focus-panel","border"],[".home-focus-status","border-radius"],[".home-focus-status","border"],[".home-focus-status","background"],[".home-focus-status","color"],[".home-focus-progress","background"],[".home-focus-meta","color"],[".home-focus-action","border"],[".home-focus-action","background"]];
    const props = (file, selector, property) => report.rules
      .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
      .flatMap(rule => parseDeclarations(rule.body))
      .filter(decl => decl.property === property);
    for (const [selector, property] of candidates) {
      expect(props('views.css', selector, property), `obsolete owner ${selector}: ${property}`)
        .toHaveLength(0);
      expect(props('farzan-redesign.css', selector, property), `final owner ${selector}: ${property}`)
        .toHaveLength(1);
      const final = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(final?.owner.file, `final cascade ${selector}: ${property}`)
        .toBe('farzan-redesign.css');
    }
  });

  it('retires 20 unconditional study-polish declarations shadowed by final redesign owners', () => {
    const report = inventoryCss();
    const retire = [[".sidebar","gap"],[".sidebar","background"],[".topbar","background"],[".sidebar-logo","background"],[".sidebar-logo","border-radius"],[".nav-item","border-radius"],[".home-title","max-width"],[".home-title","font-family"],[".home-title","font-size"],[".home-title","font-weight"],[".home-title","line-height"],[".home-title","letter-spacing"],[".home-subtitle","max-width"],[".home-subtitle","font-size"],[".home-subtitle","line-height"],[".home-actions","margin-top"],[".home-command-strip","margin-top"],[".home-focus-panel","padding"],[".home-focus-panel","border-radius"],[".home-focus-head h2","font-size"]];
    const props = (file, selector, property) => report.rules
      .filter(rule => rule.file === file && rule.selector === selector && rule.context === '')
      .flatMap(rule => parseDeclarations(rule.body))
      .filter(item => item.property === property);
    for (const [selector, property] of retire) {
      expect(props('study-polish.css', selector, property),
        `obsolete study-polish owner: ${selector}: ${property}`).toHaveLength(0);
      expect(props('farzan-redesign.css', selector, property).length,
        `final redesign owner: ${selector}: ${property}`).toBeGreaterThan(0);
      const final = report.propertyOwnership.finalDeclarations.find(item =>
        item.selector === selector && item.context === '' && item.property === property);
      expect(final?.owner.file, `authoritative source: ${selector}: ${property}`)
        .toBe('farzan-redesign.css');
    }
  });

});

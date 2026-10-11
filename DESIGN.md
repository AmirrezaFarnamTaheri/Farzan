# Interface and writing guide

This is the current guide for the OpenCourseDeck interface. It describes the design decisions in the code, not a claim that every screen has completed manual accessibility testing.

## Source of truth

- `src/styles/index.css` defines CSS layer order. Keep layer imports explicit.
- `src/styles/tokens.css` defines type, spacing, radius, and base color variables.
- `src/styles/themes.css` defines the theme palettes. `src/styles/accents.css` defines selectable accents.
- `src/styles/layout.css`, `components.css`, and `views.css` define the shell, controls, and route layouts.
- `src/styles/study-polish.css` and `src/styles/workspace.css` contain later, shared refinements. Avoid further overrides when the underlying component can be corrected safely.
- `index.html` contains the shell and landmarks. `src/views/*Route.js` contains route markup and behavior.
- Vendored fonts, symbols, and other assets are under `vendor/` and `assets/`.

Do not duplicate theme values in route-specific rules. Use the variables above and test at least the default dark/light themes and the user-selectable accents.

## Visual direction

The interface is a study tool, not a landing page.

1. Show the next useful action before decorative content.
2. Keep headings short and specific to the route.
3. Separate groups with space and a border; reserve shadows for overlays that actually float.
4. Use one accent for selection and primary actions. Do not apply colored gradients or glows to ordinary cards.
5. Keep numbers tabular and label exactly what they measure.
6. Show loading as unknown (`—`) rather than as a fabricated zero. Show a read error when saved data is unavailable.
7. Avoid hover motion on static summaries. Interactive cards may change border or background without jumping.
8. Preserve usable widths for reading, searching, editing, and PDF work.

### Type

- `--font-sans` is used for interface labels, controls, and tool-page headings.
- `--font-serif` is reserved for the Home editorial heading and reading-oriented content.
- `--font-mono` and tabular figures are appropriate for code, timestamps, and measurements.
- Body copy should have a comfortable line height and a readable measure. Do not shrink explanatory text to fit decorative headers.
- Treat `text-overflow: ellipsis` as a last resort. Provide the complete accessible name for truncated controls.

### Colors and surfaces

The default accent is Lapis (`data-accent="lapis"`). Theme colors come from `src/styles/themes.css`, not a page component. The default dark theme uses ink/slate neutrals; the default light theme uses neutral gray-white surfaces. Other shipped themes remain independent.

- Main text: `--text-primary`; supporting text: `--text-secondary`.
- Panels: `--surface` / `--surface-2`; active or hovered surfaces: `--surface-hover`.
- Dividers: `--border` or the theme-derived `--workspace-rule`.
- Controls: `--accent` with `--accent-contrast` for filled buttons.
- Errors, success, and warnings use semantic tokens. Do not use green badges solely to indicate that a page exists.

Check contrast on every theme; a token name does not guarantee contrast by itself.

### Shell and route layout

- The sidebar provides grouped navigation and a visible current-page state. Do not hide its scrollable entries behind decorative masks.
- The topbar remains a small set of actions, not another dashboard.
- Home shows continuation, course and note actions, progress, and recent activity. It should remain useful to someone with no history.
- Courses, PDF, Notes, and Studio need room for their actual work areas. They are not constrained to the width of a prose page.
- Settings and Help should favor a narrow reading measure, clear section labels, and explicit destructive-action warnings.
- Preserve the active route, input values, keyboard focus, saved data, and existing actions when changing markup.
- Breakpoints must accommodate narrow phones and 200% zoom without horizontal clipping. Right-to-left layout must preserve visual and keyboard order.

## Interaction states

Each interactive control must be distinguishable when enabled, hovered, keyboard-focused, selected, busy, disabled, or invalid, as applicable.

- Use `:focus-visible` with a clear outline that is not replaced by a shadow.
- Native buttons, links, inputs, and headings are preferred to clickable `div` elements.
- Controls should have a sufficiently large target; aim for at least 44 CSS pixels where practical.
- Disabled controls are not hoverable actions. Explain why an unavailable action is disabled when needed.
- Confirm deletion and distinguish a complete save from a partial one.
- Loading states should not shift the main layout significantly.
- Respect `prefers-reduced-motion`, `prefers-contrast`, and forced-colors settings. Avoid autoplaying decoration.
- Dynamic content should be announced selectively. A large `aria-live` region is not a replacement for well-scoped status messages.

## Writing and terminology

Write for people using the app. Prefer a specific verb and an object: “Open a PDF”, “Save note”, “Delete course”, “Export study data”. Explain failures in ordinary language, say whether data changed, and give a next step.

Do not use promotional labels, generic status badges, invented feature names, or claims about flawless security and accessibility. Avoid describing a simple list as an “insight”, a settings page as a “control center”, or normal usage as a “journey”. Leave meaningful technical terms such as IndexedDB, PDF, Tauri, and AI endpoint intact when accuracy requires them.

For features that are implemented only partly, state what works and what does not. Never imply that JSON backups include binary media or that remote lessons work offline without a network.

## Review checks

Run the repository's `npm run ci` gate and relevant browser smoke tests, then inspect the rendered interface manually:

- Home: empty, loading, populated, and read-failure states.
- Course filters, video controls, PDF search and annotations, Notes editing, Studio tools, progress charts, and Settings.
- Default dark and light, paper and midnight, at least one alternate accent, compact density, and text zoom.
- Desktop/laptop width, narrow mobile width, 200% zoom, long translations, and RTL.
- Keyboard-only navigation, screen-reader landmarks, visible focus, modal return focus, and destructive confirmations.

Record which platforms and states were actually inspected. Automated tests do not establish WCAG 2.2 AA conformance or complete localization by themselves.

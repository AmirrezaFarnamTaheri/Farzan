# OpenCourseDeck Design System

## Layout

### Sidebar + Topbar + Content

```
┌──────────────────────────────────────────────────┐
│ Topbar (56px)                         [search] [+ ]│
├────────┬─────────────────────────────────────────┤
│Sidebar │  #view-container                        │
│ 260px  │  (route content rendered here)          │
│        │                                         │
│ collapsed: 64px                                  │
├────────┴─────────────────────────────────────────┤
```

- **Sidebar** (`#sidebar`): fixed left, 260px expanded / 64px collapsed. Contains nav groups (Library, Tools, Insights, System).
- **Topbar** (56px): fixed top, breadcrumbs + search + actions + theme switcher + accent picker.
- **Content** (`#view-container`): scrollable, max-width 1400px, centered.

### Responsive breakpoints

| Token | Value | Behavior |
|-------|-------|----------|
| `sm` | 640px | Mobile: sidebar becomes overlay |
| `md` | 768px | |
| `lg` | 1024px | |
| `xl` | 1280px | |
| `2xl` | 1536px | |

## Color system

### Tokens (CSS custom properties)

All colors defined in `src/styles/tokens.css`, overridden per-theme in `src/styles/themes.css`.

**Surfaces:**
- `--bg` — page background
- `--bg-secondary` — secondary background
- `--surface-1` through `--surface-4` — elevation layers
- `--surface-hover`, `--surface-active` — interaction states
- `--skeleton-base`, `--skeleton-shine` — loading skeletons

**Text:**
- `--text-primary` — headings, primary content
- `--text-secondary` — descriptions, labels
- `--text-tertiary` / `--text-muted` — placeholders, timestamps
- `--text-disabled` — disabled states
- `--text-inverse` — text on accent/colored backgrounds
- `--text-on-accent` — text on accent buttons

**Borders:**
- `--border` — default dividers (rgba white 0.07)
- `--border-strong` — emphasized borders (0.14)
- `--border-focus` — focus rings

**Semantic:**
- `--success` (#10b981), `--warning` (#f59e0b), `--danger` (#ef4444), `--info` (#3b82f6)
- Each with `--*-muted` variant for backgrounds

**Accent:**
- `--accent` (#7c3aed plasma default), `--accent-light`, `--accent-dark`, `--accent-muted`, `--accent-glow`
- `--accent-rgb` for rgba usage

### Themes (8)

| Theme | Base | Scheme |
|-------|------|--------|
| Dark (default) | #0f0f1a | dark |
| Light | #f5f5fa | light |
| Midnight | #000008 | dark |
| Forest | #0a120a | dark |
| Ocean | #020c18 | dark |
| Sunset | #180a00 | dark |
| Rose | #180010 | dark |
| Paper | #faf8f0 | light |

Applied via `data-theme` attribute on `<html>`.

### Accents (6)

| Accent | Color |
|--------|-------|
| Plasma (default) | #7c3aed |
| Cyan | #06b6d4 |
| Amber | #f59e0b |
| Rose | #f43f5e |
| Emerald | #10b981 |
| Sakura | #ec4899 |

Applied via `data-accent` attribute on `<html>`.

### Density (3 modes)

| Mode | Row height | Use case |
|------|-----------|----------|
| Compact | 40px | Dense data views |
| Comfortable (default) | 52px | General use |
| Spacious | 64px | Touch-friendly |

Applied via `data-density` attribute on `<html>`.

## Typography

### Font stacks

| Token | Font | Use |
|-------|------|-----|
| `--font-sans` | Inter | Body text, UI |
| `--font-mono` | JetBrains Mono | Code blocks, timestamps |
| `--font-serif` | Playfair Display | Display headings |

All vendored locally (no CDN). Font files in `vendor/fonts/`.

### Type scale

| Token | Size |
|-------|------|
| `--text-xs` | 0.75rem (12px) |
| `--text-sm` | 0.875rem (14px) |
| `--text-base` | 1rem (16px) |
| `--text-lg` | 1.125rem (18px) |
| `--text-xl` | 1.25rem (20px) |
| `--text-2xl` | 1.5rem (24px) |
| `--text-3xl` | 1.875rem (30px) |
| `--text-4xl` | 2.25rem (36px) |

Scalable via `--font-scale` (0.7–1.5, controlled by FontScale module).

## Spacing

4px base unit, 10 tokens:

`--space-1` (4px) through `--space-16` (64px).

## Border radius

7 tokens: `--radius-xs` (4px) through `--radius-full` (9999px).

## Shadows

- `--shadow-xs` through `--shadow-xl` — elevation shadows
- `--shadow-glow` — accent glow
- `--shadow-card` — card-specific

## Glassmorphism

For overlays and floating panels:
- `--glass-bg` — translucent background
- `--glass-bg-strong` — more opaque variant
- `--glass-border` — subtle border
- `--glass-highlight` — top-edge highlight
- `--glass-blur` — 18px backdrop blur

## Z-index scale

| Token | Value | Use |
|-------|-------|-----|
| `--z-base` | 1 | Default |
| `--z-dropdown` | 100 | Dropdowns |
| `--z-sticky` | 200 | Sticky elements |
| `--z-overlay` | 300 | Overlays |
| `--z-modal-backdrop` | 390 | Modal backdrop |
| `--z-modal` | 400 | Modals |
| `--z-toast` | 500 | Toast notifications |
| `--z-command-palette` | 600 | Command palette |
| `--z-top` | 9999 | Everything else |

## Animation

### Easing

- `--ease-out` — decelerating
- `--ease-in` — accelerating
- `--ease-inout` — smooth both ends
- `--ease-spring` — overshoot
- `--ease-bounce` — bounce

### Duration

- `--duration-fast` (120ms) — micro-interactions
- `--duration-base` (200ms) — standard transitions
- `--duration-slow` (350ms) — expand/collapse
- `--duration-slower` (500ms) — complex animations

Configurable via `OpenCourseDeck.config.animationDuration` (250ms default).

## Components

### Buttons

`.btn` base class with variants:
- `.btn-primary` — accent background, white text
- `.btn-ghost` — transparent, borderless
- `.btn-danger` — danger background
- Sizes: `.btn-sm`, `.btn-lg`

### Cards

`.card` — surface-2 background, border, radius-lg, shadow-card.
Card variants for courses, topics, achievements.

### Modals

Centered overlay with backdrop, focus trap, ESC dismiss.
Created via `Modal.create()` or `Modal.confirmAsync()`.
`OpenCourseDeck.state.openModals` tracks stack.

### Drawers

Slide-in panel from edge, with backdrop and focus trap.
Used for settings, details panels.

### Toasts

Stacked notifications (max 5), 4 types (info/success/warning/error).
Auto-dismiss after 4000ms, pause on hover.
`OpenCourseDeck.state.activeToasts` tracks stack.

### Tabs

`[role="tablist"]` with `aria-selected`, arrow key navigation.

### Accordions

Exclusive mode (only one open), animated height via `animateHeight()`.

### Dropdowns

`data-dropdown-trigger` pattern, auto-positioning, keyboard nav.

### Tooltips

`.tooltip` with `.tooltip-js` for JS-positioned tooltips.

### Search

Fuse.js fuzzy search across all content types. Results dropdown with keyboard navigation, highlighted matches, category labels.

### Command palette

Ctrl+K overlay, fuzzy command search, keyboard navigation.

## CSS Layer order

```
reset → tokens → themes → accents → density → base → layout → components → views → utilities → animations → elevation
```

Defined in `src/styles/index.css`.

## Accessibility

- Skip link to `#main-content`
- Native landmarks (`<nav>`, `<main>`, `<aside>`, `<header>`)
- `#aria-announcer` live region for route changes
- Focus trap in modals/drawers/command palette
- `OpenCourseDeck.state` tracks open overlays for restore
- `data-inert` on `#plasma-app` when overlay is open
- Keyboard shortcuts cheatsheet (Shift+?)
- All interactive elements keyboard-accessible

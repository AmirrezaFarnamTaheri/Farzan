# OpenCourseDeck Design System Specifications (`DESIGN.md`)

## 1. Global Vision
OpenCourseDeck (Farzan) is a high-performance, dark-first interactive learning studio combining desktop video playback, Rich Notes editing, 2D vector canvas sketching, PDF annotations, and SM-2 Spaced Repetition flashcards.

The aesthetic philosophy centers on **Sleek Glassmorphism with WebGL Atmospheric Accents**:
- **Palette**: Deep void dark tones (`#0f0f1a`, `#181825`) with vibrant OKLCH purple (`#7c3aed`) and cyan (`#06b6d4`) accents.
- **Backdrop**: Full-screen GPU WebGL shader canvas rendering 5-octave FBM atmospheric smoke with white-hot laser core alignment.
- **Card Styling**: High-contrast, semi-transparent backdrop blur surfaces with subtle border gradients.

---

## 2. Design Tokens

### Colors
| Token | CSS Variable | Hex / OKLCH Value | Purpose |
|---|---|---|---|
| **Base Background** | `--skeleton-base` | `#0f0f1a` | App shell backdrop |
| **Surface Card** | `--bg-card` | `rgba(24, 24, 37, 0.8)` | Floating containers & modals |
| **Primary Accent** | `--brand-primary` | `#7c3aed` | Key buttons, active states, branding |
| **Secondary Accent**| `--brand-accent` | `#06b6d4` | Secondary highlights & WebGL beam glows |
| **Text Primary** | `--text-primary` | `#f8fafc` | Headings & high-contrast text |
| **Text Muted** | `--text-muted` | `#94a3b8` | Subtitles & metadata labels |
| **Border Soft** | `--border-soft` | `rgba(255, 255, 255, 0.1)` | Subtle dividers & card outlines |

### Typography
- **Primary Body**: `Inter, system-ui, -apple-system, sans-serif`
- **Code / Monospace**: `JetBrains Mono, monospace`
- **Serif Accent**: `Playfair Display, Georgia, serif`
- **Font Scale**:
  - `H1`: `1.875rem` (`30px`), Font Weight: `800`
  - `H2`: `1.5rem` (`24px`), Font Weight: `700`
  - `H3`: `1.25rem` (`20px`), Font Weight: `600`
  - `Body`: `0.9375rem` (`15px`), Font Weight: `400`
  - `Small / Badge`: `0.75rem` (`12px`), Font Weight: `600`

### Spacing Scale
- `xs`: `0.25rem` (`4px`)
- `sm`: `0.5rem` (`8px`)
- `md`: `1rem` (`16px`)
- `lg`: `1.5rem` (`24px`)
- `xl`: `2rem` (`32px`)

### Radii & Shadow System
- `radius-sm`: `6px`
- `radius-md`: `12px`
- `radius-lg`: `20px`
- `radius-pill`: `9999px`
- `elevation-glass`: `0 8px 32px 0 rgba(0, 0, 0, 0.37)`
- `glow-primary`: `0 0 40px rgba(124, 58, 237, 0.4)`

---

## 3. Component Patterns

### Sidebar & Navigation
- **Collapsible Sidebar**: `Ctrl+B` toggle, active item highlighted with gradient text and pill background.
- **Flashcards Nav Entry**: Registered under `Tools` section (`#/flashcards`).

### Interactive Flashcard Studio
- **Flip Motion**: 3D card tilt & smooth front-to-back opacity transition.
- **Rating Buttons**:
  - `Again (1)`: Red border (`rgba(239, 68, 68, 0.4)`), soft red tint.
  - `Hard (2)`: Amber border (`rgba(245, 158, 11, 0.4)`), soft amber tint.
  - `Good (4)`: Blue border (`rgba(59, 130, 246, 0.4)`), soft blue tint.
  - `Easy (5)`: Emerald border (`rgba(16, 185, 129, 0.4)`), soft emerald tint.

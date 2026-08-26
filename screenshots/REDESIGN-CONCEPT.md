# OpenCourseDeck — redesign concept

## Product thesis

OpenCourseDeck becomes **the desk that keeps a learner's evidence together**: what they watched or read, the note they made, the question they still have, and the review that is due. The interface should make the next useful action obvious without hiding the power tools.

**Audience:** independent learners building durable understanding from courses, PDFs, and their own notes.

**Primary job:** begin or resume a focused study session in fewer than two decisions.

## What the screenshots reveal

| Current strength | Current friction | Redesign response |
| --- | --- | --- |
| Local-first privacy, rich learning tools, export options | The 14-item side rail makes tools compete with the learning flow | Five primary destinations; less-frequent utilities live in a contextual “More” menu. |
| Consistent dark theme and a familiar shell | Low-contrast text and almost-identical outlined panels flatten hierarchy | Use a warm paper workspace, high-contrast ink, one cool accent, and elevation only for active objects. |
| Notes, PDF, flashcards, and studio exist | Each begins as an isolated, mostly empty workspace | A shared **learning trail** links source → note → question → card, so tools retain context. |
| Powerful editors and media controls | The course, Studio, PDF, and note interfaces expose too many controls before content exists | Progressive disclosure: a clear primary action, a short contextual toolbar, and an inspector only when needed. |
| Progress dashboard and settings | Zero-state metric tiles and full-width empty charts feel like unfinished dashboards | A narrative weekly recap with meaningful empty states and an optional detailed analytics view. |

## Design direction — “Lapis & Index Cards”

This is a calm research desk, not a generic dashboard. A paper-like workspace gives study artifacts a home; the blue **learning thread** is the sole signature device. It moves from a source through annotations and questions to scheduled review, making the product’s value legible everywhere.

### Token system

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#F7F5F0` |
| Surface | `--surface` | `#FFFEFB` |
| Ink | `--ink` | `#18212E` |
| Muted ink | `--ink-muted` | `#5D6875` |
| Rule | `--rule` | `#DEDAD1` |
| Lapis / focus | `--focus` | `#2457D6` |
| Learning thread tint | `--focus-soft` | `#E7EEFF` |
| Mark / review due | `--mark` | `#C75822` |
| Completed | `--success` | `#087B5D` |

Type uses **Fraunces** for sparing editorial titles, **Manrope** for interface and reading, and **IBM Plex Mono** for timestamps, page numbers, and keyboard shortcuts. Use 16px body copy, 1.55 body line-height, and an 8px spacing scale.

### Information architecture

```text
Today                         one clear next action + current learning trail
Library                       courses, PDFs, saved sources, collections
Learn                         focused source viewer + notes + flashcards in context
Make                          cards, notes, and canvases created from selected evidence
Insights                      weekly recap, streak, review health, optional detail
──────────────────────────────────────────────────────────────────────────────
Search · Command palette · Notifications                         [avatar / More]
Settings, storage, imports/exports, privacy, theme               via avatar / More
```

Desktop uses a 248px rail with labels; at 768–1023px it becomes a 72px icon rail plus an overlay inspector; below 768px it becomes a five-item labeled bottom navigation. The present learning action remains fixed, while all secondary metadata collapses behind a details sheet.

## Key screens

### 1. Today — the new home

The top of the page is a single **Continue learning** card containing the current source title, remaining time, progress, and one strong CTA. A quiet “review queue” sits beside or immediately below it. The learning thread beneath shows the last source, linked note, and upcoming review; this replaces four empty metric cards.

### 2. Learn — source-first, not player-first

The media/PDF viewer owns the center. A compact, sticky source bar holds play/page controls. A right-hand evidence panel has three tabs: **Notes**, **Questions**, and **Cards**. Selecting text or a transcript moment creates a linked artifact; no context is lost. On smaller screens, the evidence panel is a bottom sheet.

### 3. Make — purposeful creation

Open Make with a choice that reflects the learner’s goal: “Capture a note,” “Create a card,” or “Map an idea.” The advanced canvas toolbar is hidden in an overflow menu until a canvas is active. Templates appear only after choosing “Map an idea.”

### 4. Insights — a story before a dashboard

Lead with “This week you studied 2h 40m across 3 sources” and a seven-day activity strip. Only show the course table and charts once data exists. A first-time state offers “Add a source” and explains what will be tracked.

### 5. Settings — preferences, not a destination

Use an anchored settings sheet with grouped sections: Appearance, Workspace, Privacy, Data. Keep backup/import/export in Data and mark destructive choices separately. AI remains opt-in and explains where processing occurs before a model field appears.

## Component rules

- One contained primary CTA per screen; secondary actions are text or quiet outline controls.
- Use Lucide-style 1.75px SVG icons; never use emoji for system controls.
- Cards have 14px radius, a 1px `--rule` edge, and a single soft shadow only when actionable/selected.
- Input, button, and icon-button hit areas are at least 44×44px; focus uses a 3px `--focus` ring.
- Source controls are grouped by task: navigate, annotate, export. Never show all groups by default.
- Motion is limited to 180–240ms opacity/transform transitions; the learning thread draws only on new-session entry and is disabled for reduced motion.

## Responsive behavior

| Width | Navigation | Main layout | Priority rule |
| --- | --- | --- | --- |
| 1440px+ | labeled rail | 12-column: content 8 / evidence 4 | concurrent source + evidence work |
| 1024–1439px | compact rail | 8-column with optional inspector | hide secondary metadata first |
| 768–1023px | icon rail + overlay | single content column | inspector opens on demand |
| <768px | labeled bottom navigation | one column, 16px gutters | continue/review before all analytics; inspector is a sheet |

## Accessibility and implementation guardrails

- Maintain 4.5:1 contrast for normal text and 3:1 for UI edges/states in both themes.
- Preserve keyboard routes: `/` opens search, `N` makes a note in context, `R` starts review; expose them in the command palette and do not capture inputs.
- Use semantic headings and landmarks; source controls have descriptive labels and transcripts are keyboard reachable.
- Reserve source-viewer and chart space before content loads. Use skeletons for sessions longer than 300ms.
- Respect text scaling and `prefers-reduced-motion`; do not rely on the blue thread or color alone to express artifact state.

## Recommended implementation order

1. Establish tokens, responsive shell, navigation reduction, and the command palette.
2. Build Today and the shared learning-trail model/components.
3. Redesign Learn so notes, cards, and annotations are source-linked.
4. Rebuild Make, Insights, and Settings using the same shell and states.
5. Validate at 375, 768, 1024, and 1440px with keyboard, dark theme, empty/loading/error states, and reduced motion.

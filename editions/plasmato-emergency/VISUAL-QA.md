# Plasmato v1.0.2 — Visual and functional acceptance audit

## Scope and proof

Executed real Chrome Playwright against release-built Farzan and standalone Plasmato. Eighteen independent browser scenarios passed and produced 107 actual screenshots: all 15 app routes in dark desktop/tablet/mobile (45), all 15 in light desktop/mobile (30), 26 genuine interaction states, and six standalone-player screenshots.

Repository screenshots: [all 107 real browser captures and seven contact sheets](../../screenshots/current/README.md) (see [checksummed manifest](../../screenshots/current/manifest.json)).
Archived original visual evidence: https://github.com/AmirrezaFarnamTaheri/Farzan/tree/evidence/plasmato-visual-38177326118/visual-evidence
Passing QA run: https://github.com/AmirrezaFarnamTaheri/Farzan/actions/runs/38177326118

## Confirmed defects resolved

1. English course search could not find Persian-titled Plasmato courses: indexed human-readable canonical slugs in two search implementations; verified actual dropdown and route navigation.
2. Translucent results popover exposed navigation beneath it: replaced with opaque surface.
3. Oversized Notes title clipped saved document names: scaled down and checked rendered font dimensions.
4. Empty player artwork URL loaded the app origin as a broken image: removed empty src and cleared it with removeAttribute when unavailable.
5. Standalone hierarchy auto-scroll hid mobile header on startup: limited scrolling to overflowing list containers; tested fresh scroll position.
6. Blank PDF fixture and missing ffmpeg did not prove rendering: replaced with a contentful rendered PDF and real WebM recorded inside Chrome, checking actual video time progression, persisted timestamps and PDF page note.
7. Screenshot capture could accept an empty frame: added pixel-statistics rejection, seven labeled contact sheets and persistent evidence collection.

## Functional workflows

Plasmato course selection/completion; Materials filter; written note autosave and reopening; user course creation; flashcards add/flip/grade; painted searchable PDF and page note; playlists; theme and font controls; global search and navigation; actual video playback/timestamp/bookmark; Studio text and shapes persisted through reopening; settings AI/storage panels; PDF zoom; standalone hierarchy, saved PDF, saved-only filter, focus mode and mobile search.

## Acceptance constraints and limits

Enforced 107 nonblank screenshots, 18 passing scenarios, zero broken images, no uncaught route errors, no detected horizontal overflow in sampled states, standard 907+ unit tests, web smoke and locked Windows installer build before publishing. Manual native installation/update/uninstallation, screen readers, every device density and third-party media hosting are not established by synthetic fixture success. Original Farzan main remains unchanged.

## Expanded Plasmato 1.0.3 visual acceptance gate

The next release is gated on 308 **newly captured within the same CI run** actual Chrome screenshots: 107 baseline captures plus 150 additional fifteen-route responsive/accessibility states and 51 additional working UI states. The enlarged matrix includes 320-pixel phones, wide desktops, light tablet, RTL directional stress, large type, compact density, reduced motion, keyboard focus, full-page captures, course/media facet changes, saved notes, settings, Studio, progress and achievements, and responsive standalone player states. All 24 groups receive dedicated labeled contact sheets; generated `manifest.json` checks every PNG size and SHA-256 plus its browser observation. Incomplete captures block publication. The earlier 107-image repository gallery remains historical; the complete 308-image set is packaged with the edition release's visual-evidence ZIP.

**Limits:** RTL direction tests do not imply Persian translation. Browser-generated WebM confirms actual local playback but not remote Plasmato media reachability. No claim of screen-reader certification or hardware-specific Windows installer acceptance follows from browser screenshots.

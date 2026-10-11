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

## Plasmato 1.0.4 — Native vision and expanded acceptance review (2026-10-12)

**Scope:** Directly inspected original Chrome screenshots and the 35 labeled contact sheets covering 470 successfully captured images from the first 476-state expansion. Each screenshot is an actual Chrome capture; six interactive captures were absent because two Playwright cases failed and ended early. Reviewed representative full-resolution route/action screens, not solely automated numeric summaries. The corrected CI must capture **all 476** and produce a SHA-256 manifest before release.

**Evidence-backed defects and actions**

1. **Mobile drawer state/accessibility:** The menu visibly opened while its controlling button remained `aria-expanded=false`; navigation left the drawer open. The edition now toggles and synchronizes the control, closes on destination or Escape, and restores focus on Escape. Added real Chrome assertions and router regressions.
2. **Landscape PDF near-empty capture:** The 844×390 PDF overview was a 4,460-byte mostly blank frame; the app reused an old internal shell scroll offset. Route navigation now resets persistent scroll position on pathname changes, retaining position for same-view deep links. The screenshot suite still rejects unexpectedly small captures.
3. **Phantom PDF page and notes:** The empty PDF view visibly displayed `1 / 0` and enabled Save page note with no document. It now announces “No PDF open”, presents an empty-state hint in the actual viewer area, disables page/note controls until a real PDF is loaded, and rejects direct phantom-note submissions. Added unit tests for empty state and a loaded three-page document.
4. **Invalid 200% zoom simulation:** The earlier test applied `style.zoom=2` while keeping desktop-width breakpoints, causing overlapping desktop panels. The suite now uses a 640×450 effective CSS layout viewport for an equivalent reflow-stress scenario, rather than claiming a browser-zoom result from an unrelated CSS transform.
5. **Standalone small-phone hierarchy:** Historical narrow captures showed six vertical metrics consuming the first screen; the independent emergency player's responsive two-column compact figures are now verified by its own 320px search/focus test.
6. **Saved Notes state:** The previous route-search remount could show stale filtered results and contradictory count states; the existing branch fix synchronizes the visible input and clears stale filters on unmount, verified by note state captures.

**Reviewed matrices:** desktop, mobile, tablet, small/medium phones, landscape phone, tablet portrait/landscape, wide desktop, light desktop/mobile/tablet, RTL desktop/mobile and light RTL counterparts, forced colors, high contrast, effective 200%-reflow stress, large text, reduced motion, keyboard focus, compact density, scroll-bottom, course/material/note/studio/setting/study interactions, standalone/responsive emergency player, and working PDF/video/note evidence. Screen contents remained generally readable and grouped consistently. The first-pass landscape PDF is an explicit rejected image, not valid evidence of a passing layout.

**Limits:** Pixel averages and visual inspection cannot prove keyboard semantics or screen-reader output. The `full-page` matrix uses browser `fullPage` capture, but some actual app content scrolls inside nested containers; the separate scroll-bottom and interactive state matrices document some of that content. Local WebM playback does not establish remote Plasmato-host availability. Win32 install/upgrade/uninstall and third-party PDF hosting remain separate acceptance work. All fixes are branch-only; `main` is not modified.

# Plasmato v1.0.2 — Visual and functional acceptance audit

## Scope and proof

Executed real Chrome Playwright against release-built Farzan and standalone Plasmato. Eighteen independent browser scenarios passed and produced 107 actual screenshots: all 15 app routes in dark desktop/tablet/mobile (45), all 15 in light desktop/mobile (30), 26 genuine interaction states, and six standalone-player screenshots.

Visual evidence: https://github.com/AmirrezaFarnamTaheri/Farzan/tree/evidence/plasmato-visual-38177326118/visual-evidence
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

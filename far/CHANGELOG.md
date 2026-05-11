## Changelog

All notable changes to this project will be documented in this file.

### Unreleased

- Tooling: esbuild bundling (`dist/plasma.js`), Workbox service worker generation, local fonts + Font Awesome vendoring.
- Fixes: splash dismiss, Progress namespace collision mitigation, canvas DPR transform, HttpClient cache TTL race, realtime disconnect payload, notes undo index.
- Security: DOMPurify-based sanitization for notes + view injection, CSP tightening (removed `unsafe-eval`), removed external font/CDN usage.
- UX: command palette, breadcrumb updates, storage meter, theme-color meta sync, SW update toast, skip link, overlay focus restore, app-root inert background, styled async confirm.
- Docs: expanded README, first-run guide, catalog guide, backup/restore guide, troubleshooting guide, and impact/effort roadmap.
- Performance: local debug timing marks for boot import, bundle-to-ready, and app init.
- UX: in-app Help route with first-run checklist, storage summary, docs links, backup entry, and shortcuts entry point.
- Fixes: route handlers are registered before router initialization so the initial hash resolves immediately.

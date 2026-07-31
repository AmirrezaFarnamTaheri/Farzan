# Security Policy

## Supported versions

Security fixes are provided for the current `main` branch and the newest
published release. Older releases should be upgraded before a report is
validated unless the issue also affects the current version.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
**Report a vulnerability** / Security Advisory flow for this repository and
include:

- affected commit or release;
- reproduction steps and prerequisites;
- impact and realistic attack scenario;
- logs, screenshots, or a minimal proof of concept with secrets removed;
- any known mitigations.

The maintainer will acknowledge a complete report, assess severity, coordinate
a fix and disclosure, and credit the reporter when requested and appropriate.
Do not access data that is not yours, degrade availability, or publish details
before a coordinated disclosure date.

## Security boundaries

OpenCourseDeck is a client-side application. User-approved remote endpoints,
imported backups, PDFs, media, browser storage, release artifacts, and desktop
packages are trust boundaries. Reports concerning integrity, origin approval,
storage deletion, import/export, or release provenance are in scope.

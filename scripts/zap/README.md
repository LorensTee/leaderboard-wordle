# ZAP baseline scans — local/preview only

Dockerized [OWASP ZAP](https://www.zaproxy.org/) **baseline (passive)** scan
against a local **non-production** preview of the app. Per
`Architecture-v3.md §OWASP ZAP`: baseline scans are a **starting point, not a
verdict** — every finding is triaged against the real code path and recorded
in the Phase-5 handoff triage table.

## Prerequisites

1. **Docker** with host-network support (the container reaches the host
   preview via `--network host`).
2. A built preview:
   ```bash
   bun run build
   bun run preview -- --port 4173 --host 127.0.0.1
   ```
   (or let the script build+start it: `./scripts/zap/zap-baseline.sh` with a
   preview already running — the script refuses to scan an unreachable target.)
3. Non-production env (same requirements as the test suites): `DATABASE_URL`
   + `BETTER_AUTH_SECRET` + `ALLOW_DB_WIPE=1` in `.env`/`.dev.vars`
   (local) or CI job env. The scan can also run without them — API routes
   then answer 401 envelopes, which the baseline records as expected.
4. Optional seed data (`bun run seed:answers` + an admin-created puzzle) for
   a richer scan surface — not required for the baseline.

## Exact command

```bash
./scripts/zap/zap-baseline.sh
```

Environment overrides: `PREVIEW_URL` (default `http://127.0.0.1:4173`),
`ZAP_IMAGE` (default `ghcr.io/zaproxy/zaproxy:stable`).

Reports (gitignored):

- `scripts/zap/reports/latest.json` — machine-readable findings
- `scripts/zap/reports/latest.html` — human-readable report

The **committed** artifact is the triage table in
`docs/phases/phase 5/phase-5-implementation-handoff-final.md` (§S5) —
confirm/reject/exploitability/status per finding, cross-referenced against
the real code path (or a unit/e2e pin).

## What it scans

- The SPA landing page + any links the spider discovers;
- passive (baseline) checks only: headers, CSP, cookie attributes, exposed
  files, TLS-adjacent config visible over http, etc.
- API endpoints only as the spider reaches them (the app is a client-side
  SPA; the deeper API matrix is covered by `tests/e2e/security.spec.ts` +
  the unit suites — ZAP complements, not replaces, those).

## Rules

- **NEVER scan production.** This script is for the local preview only.
- Active scanning is out of scope (no auth-aware context is configured).
- Findings are triaged; a green/red scanner run is never the verdict by
  itself.
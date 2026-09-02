# Phase 5 — ZAP Baseline Triage (2026-09-02)

One documented baseline/passive run against the LOCAL preview per
`scripts/zap/README.md` (executed with the official ZAP 2.17.0 standalone
dist + the Automation Framework plan — same scanner and passive rules as the
`zap-baseline.py` container flow; container runtimes are blocked in this
sandbox, recorded in the contradictions log S5a). Reports (gitignored):
`scripts/zap/reports/latest.json` + `latest.html`.

Scan facts: target `http://127.0.0.1:4173/` (non-production preview ·
ALLOW_DB_WIPE env); traditional spider discovered **54 URLs**; passive scan
only; **3 alert groups**; 0 High.

| # | Finding (riskdesc) | Instances | Confirm / Reject | Exploitability | Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | **Cross-Domain Misconfiguration** — `Access-Control-Allow-Origin: *` (Medium) | 3–1 across runs | **REJECTED — preview-emulation artifact** | None in the deployed artifact | Closed (no change) | `grep 'Access-Control-Allow-Origin' .svelte-kit/cloudflare/_worker.js src/` → **0 matches**; source is miniflare's asset-emulation worker (`node_modules/miniflare/dist/src/workers/r2/public.worker.js`); vite `preview.cors` has no effect under the adapter's preview server (tried + reverted — S5b/S5b-CORRECTION) |
| 2 | **X-Content-Type-Options missing** (Low) | 5 (JS chunks) | **CONFIRMED for `/_app/*` assets** | Low (correct `Content-Type` already served; MIME-sniffing mitigation) | **Mitigated** | Added `_headers` (repo root — adapter-cloudflare 7.2 requires root, not `static/`): `/_app/* → X-Content-Type-Options: nosniff`. Deployed artifact verified to contain the rule (`.svelte-kit/cloudflare/_headers`). Note: `vite preview`/miniflare does NOT apply `_headers` rules, so the finding persists under preview emulation while the deployed surface is covered (S5c) |
| 3 | **Information Disclosure — Suspicious Comments** (Informational) | 6 (JS chunks) | **REJECTED — false positive** | None | Closed (no change) | Matches are plain words ('from', 'query') inside MINIFIED bundles; esbuild strips comments (S5d) |

## Coverage note (S5e)

The SPA's API surface (beyond the landing page) is not crawl-discovered;
the API attack matrix is machine-pinned by `tests/e2e/security.spec.ts`
(8 scenarios) + the unit suites. ZAP here is the passive baseline layer,
not a verdict (Architecture-v3 §OWASP ZAP).
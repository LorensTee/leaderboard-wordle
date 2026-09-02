#!/usr/bin/env bash
# Phase-5 S5 — dockerized OWASP ZAP baseline scan against a LOCAL preview.
#
# Scans the LOCAL `vite preview` (non-production) deployment ONLY. Production
# scanning is explicitly out of scope (Architecture-v3 §OWASP ZAP). Scanner
# output is NOT a verdict: every finding is triaged against real code paths
# (triage table lives in docs/phases/phase 5/phase-5-implementation-handoff-final.md).
#
# Prerequisites (see scripts/zap/README.md):
#   - docker (host network access)
#   - `bun run build` + the preview running (the script can start it itself
#     with --start-preview)
#   - non-production DATABASE_URL / BETTER_AUTH_SECRET / ALLOW_DB_WIPE=1
#     (or the SPA still serves; API probes then get 401 envelopes, which is
#     a fine baseline target)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="$HERE/reports"
PREVIEW_URL="${PREVIEW_URL:-http://127.0.0.1:4173}"
ZAP_IMAGE="${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"
START_PREVIEW="${START_PREVIEW:-0}"
PREVIEW_PORT=4173

mkdir -p "$REPORTS_DIR"

if ! command -v docker >/dev/null 2>&1; then
	echo "error: docker is required (zap-baseline runs in a container)" >&2
	exit 1
fi

if [[ "$START_PREVIEW" == "1" ]]; then
	(cd "$(dirname "$HERE")/.." && bun run build >/dev/null 2>&1)
	(cd "$(dirname "$HERE")/.." && bun run preview -- --port "$PREVIEW_PORT" --host 127.0.0.1 >/dev/null 2>&1 &)
	PREVIEW_PID=$!
	trap 'kill "$PREVIEW_PID" 2>/dev/null || true' EXIT
	echo "preview started (pid $PREVIEW_PID)"
	for _ in $(seq 1 30); do
		if curl -fsS "$PREVIEW_URL" >/dev/null 2>&1; then break; fi
		sleep 1
	done
fi

if ! curl -fsS "$PREVIEW_URL" -o /dev/null 2>&1; then
	echo "error: preview not reachable at $PREVIEW_URL (start it or pass --start-preview)" >&2
	exit 1
fi

echo "==> scanning $PREVIEW_URL (baseline/passive only)"
# --network host so the container reaches the host-bound preview; -T 5 keeps
# the passive scan quick; -J/-r write JSON + HTML reports into the mounted
# reports dir (gitignored — the TRIAGE table is the committed artifact).
docker run --rm --network host \
	-v "$REPORTS_DIR:/zap/reports:rw" \
	"$ZAP_IMAGE" zap-baseline.py \
	-t "$PREVIEW_URL" \
	-J /zap/reports/latest.json \
	-r /zap/reports/latest.html \
	-T 5 \
	-d

echo "==> reports written:"
ls -la "$REPORTS_DIR/latest.json" "$REPORTS_DIR/latest.html"
echo "==> next step: triage findings against real code paths (handoff §S5 table)."
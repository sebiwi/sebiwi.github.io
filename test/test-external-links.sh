#!/usr/bin/env bash
set -e # halt script on error

# Always run from the repo root, regardless of where the script is invoked from
# (it lives in test/ but operates on paths relative to the repo root).
cd "$(dirname "$0")/.."

# External link validation (ONLINE). Kept separate from test/test.sh so the main
# test stays fast and deterministic. This one hits the network and can be slow
# or flaky depending on third-party sites.
#
# It checks only EXTERNAL http(s) links; internal links are already validated
# offline by test/test.sh. Tuned for speed: high concurrency, short timeout,
# single retry, on-disk cache (.lycheecache) so re-runs are near-instant.

echo "🌐 External link check (online)..."

# Reuse an existing build if present; otherwise build fresh.
if [ ! -d "public" ]; then
    echo "📦 No public/ found — building..."
    hugo --minify --panicOnWarning
fi

if ! command -v lychee >/dev/null 2>&1; then
    echo "❌ lychee not installed. Install with: brew install lychee"
    exit 1
fi

# Notes on the flags:
#  --scheme http/https     only web links (skip mailto:, etc.)
#  --exclude sebiwi...      skip our own domain (internal links → test/test.sh)
#  -E                       skip private/loopback/link-local IPs
#  --max-concurrency 64     parallelism for speed
#  --timeout 20             don't hang on slow hosts
#  --max-retries 1          one retry, short wait
#  --accept 200..=299,403,429,401  treat auth/bot-blocked/rate-limited as reachable
#                           (the resource exists; the server just blocks our bot)
#  --cache                  persist results to .lycheecache for fast re-runs
#  --user-agent             a real browser UA to reduce bot-blocking false positives
time lychee \
    --no-progress \
    --root-dir "$(pwd)/public" \
    --scheme https --scheme http \
    --exclude '^https?://(www\.)?sebiwi\.github\.io' \
    --exclude-all-private \
    --max-concurrency 64 \
    --timeout 20 \
    --max-retries 1 \
    --retry-wait-time 1 \
    --accept '200..=299,401,403,429' \
    --cache \
    --user-agent 'Mozilla/5.0 (compatible; lychee link-checker)' \
    public/

echo "✅ External link check passed!"

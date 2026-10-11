#!/usr/bin/env bash
# Runs scripted sessions against the built 404 shell in headless Chrome and
# compares what the terminal shows with test/notfound/golden/<case>.txt.
#
#   test/notfound/transcript.sh              every case
#   test/notfound/transcript.sh rm jobs      just those
#   test/notfound/transcript.sh --update rm  rewrite the golden file (read the diff first)
#
# Chrome's --virtual-time-budget fast-forwards timers, so a case that waits
# ten seconds for ping runs in well under one. No --user-data-dir: with one,
# Chrome never exits after --dump-dom. Each run is a new browser session, so
# sessionStorage (the shell history) starts empty anyway.
set -euo pipefail
cd "$(dirname "$0")/../.."

update=0
if [ "${1:-}" = "--update" ]; then
    update=1
    shift
fi

chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
    for candidate in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome google-chrome-stable chromium chromium-browser; do
        if [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1; then
            chrome="$candidate"
            break
        fi
    done
fi
if [ -z "$chrome" ]; then
    echo "transcript: no Chrome found (set CHROME=/path/to/chrome)"
    exit 2
fi

site="$(mktemp -d)"
port=$((20000 + RANDOM % 20000))
hugo --quiet --destination "$site" >/dev/null
cp test/notfound/probe.js "$site/probe.js"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$site" >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; /bin/rm -rf "$site"' EXIT
sleep 1

cases=("$@")
if [ ${#cases[@]} -eq 0 ]; then
    for file in test/notfound/cases/*.txt; do
        cases+=("$(basename "$file" .txt)")
    done
fi

# One case through Chrome: prints the transcript, fails when Chrome does.
render() {
    local dom
    dom="$("$chrome" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
        --virtual-time-budget=120000 \
        --dump-dom "http://127.0.0.1:$port/probe-$1.html" 2>/dev/null)" || return 1
    printf '%s' "$dom" | python3 -c 'import html, re, sys
dom = sys.stdin.read()
m = re.search(r"<pre id=\"transcript\">(.*?)</pre>", dom, re.S)
sys.stdout.write(html.unescape(m.group(1)) if m else "NO TRANSCRIPT\n")'
}

status=0
for name in "${cases[@]}"; do
    # The case text goes into the page as a JS string literal, so nothing
    # has to be fetched while Chrome's clock is virtual.
    python3 - "$site/404.html" "test/notfound/cases/$name.txt" "$site/probe-$name.html" <<'PY'
import json, sys
page, case, out = sys.argv[1:4]
html = open(page, encoding='utf-8').read()
text = open(case, encoding='utf-8').read()
inject = '<script>window.PROBE_CASE=' + json.dumps(text) + ';</script><script src="/probe.js"></script></body>'
open(out, 'w', encoding='utf-8').write(html.replace('</body>', inject, 1))
PY
    actual="$(mktemp)"
    # Chrome now and then dies on its own (SIGKILL, mid-case). That is the
    # browser, not the shell: run the case again, once, and say so. A
    # transcript that comes back wrong is never retried.
    if ! render "$name" > "$actual"; then
        echo "  (chrome died on $name; running it again)"
        render "$name" > "$actual" || echo "NO TRANSCRIPT (chrome died twice)" > "$actual"
    fi
    golden="test/notfound/golden/$name.txt"
    if [ "$update" = 1 ]; then
        cp "$actual" "$golden"
        echo "updated $name"
    elif [ -f "$golden" ] && diff -u "$golden" "$actual"; then
        echo "✓ $name"
    else
        [ -f "$golden" ] || echo "✗ $name: no golden file ($golden)"
        status=1
    fi
    /bin/rm -f "$actual"
done
exit "$status"

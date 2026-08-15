#!/usr/bin/env bash
set -euo pipefail # halt on error, unset var, or failed pipe stage

# Always run from the repo root, regardless of where the script is invoked from
# (it lives in test/ but operates on paths relative to the repo root).
cd "$(dirname "$0")/.."

echo "🧪 Testing Hugo build..."

# Build site with minification, cleaning stale files from previous builds.
# --cleanDestinationDir (instead of rm -rf public) removes the window where
# public/ doesn't exist, which matters if anything is serving it.
# --panicOnWarning turns template/render warnings (e.g. a broken RSS template,
# a missing resource) into hard build failures so they can't ship silently.
echo "🔨 Building site..."
hugo --minify --panicOnWarning --cleanDestinationDir

# Build search index (use the installed binary if present, else npx)
echo "🔍 Building search index..."
if command -v pagefind >/dev/null 2>&1; then
    pagefind --site public
else
    npx -y pagefind --site public
fi

# Check build succeeded
if [ ! -d "public" ]; then
    echo "❌ Build failed: public/ directory not created"
    exit 1
fi

# Check critical files exist
echo "✅ Checking critical files..."
files=("public/index.html" "public/blog/index.html" "public/comics/index.html" "public/404.html" "public/pagefind/pagefind.js")
for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing: $file"
        exit 1
    fi
    echo "✓ Found: $file"
done

# Check CSS and JS are minified and fingerprinted
echo "✅ Checking assets..."
if ! ls public/css/bundle.min.*.css >/dev/null 2>&1; then
    echo "❌ CSS not minified/fingerprinted"
    exit 1
fi
echo "✓ CSS minified and fingerprinted"

# The site bundle specifically (search, theme toggle, animations): a generic
# *.min.*.js glob would still pass if only a page-specific script survived.
if ! ls public/js/site.bundle.min.*.js >/dev/null 2>&1; then
    echo "❌ Site JS bundle not built/minified/fingerprinted"
    exit 1
fi
echo "✓ Site JS bundle minified and fingerprinted"

# Per-page and head scripts: each must be emitted minified + fingerprinted
# (they go through the script-tag partial). A wiring regression that drops
# one would otherwise only surface as a broken feature in production.
for script in theme-init view-transition-init comic-nav reading-progress notfound about-boot; do
    if ! ls public/js/${script}.min.*.js >/dev/null 2>&1; then
        echo "❌ ${script}.js not built/minified/fingerprinted"
        exit 1
    fi
done
echo "✓ All per-page scripts minified and fingerprinted"

# Check generated feeds and sitemap exist (the RSS template is custom, so a
# template error there wouldn't necessarily fail the build hard).
echo "✅ Checking feeds and sitemap..."
feeds=("public/sitemap.xml" "public/index.xml" "public/blog/index.xml" "public/comics/index.xml")
for feed in "${feeds[@]}"; do
    if [ ! -f "$feed" ]; then
        echo "❌ Missing: $feed"
        exit 1
    fi
    echo "✓ Found: $feed"
done

# Check the responsive-image pipeline actually produced WebP variants (a
# regression to a raw <img> fallback would otherwise pass silently).
echo "✅ Checking image pipeline..."
if [ "$(find public -name '*.webp' | head -1)" = "" ]; then
    echo "❌ No WebP variants generated — responsive-img pipeline may be broken"
    exit 1
fi
echo "✓ WebP variants generated"

# Palette single-ownership: JS applies the theme tint by reading
# --color-background off computed style, so the theme hexes must never
# reappear as literals in built JS. (#fff in the 404 shell's CRT effect is a
# scenic white, not the palette, and stays out of this pattern.)
echo "✅ Checking palette ownership..."
if grep -rlE '#(16161e|ffffff)' public/js/ >/dev/null 2>&1; then
    echo "❌ Theme palette hex found in built JS — style.css must be the only owner:"
    grep -rlE '#(16161e|ffffff)' public/js/
    exit 1
fi
echo "✓ No theme palette hexes in built JS"

# Comic Card checks (the comic-card partial owns these behaviours).
echo "✅ Checking comic cards..."

# Eager-loading: the comics index should have exactly 5 eager images: the
# profile avatar (profile.html always loads it eagerly) plus the first grid
# row of 4 cards. More means the lazy default broke; fewer means the eager
# flag stopped threading through the card's interface.
eager_count=$(grep -Eo 'loading="?eager"?' public/comics/index.html | wc -l | tr -d ' ')
if [ "$eager_count" != "5" ]; then
    echo "❌ Expected 5 eager images on comics index (profile + first row), got $eager_count"
    exit 1
fi
echo "✓ Comics index eager-loads exactly the first card row"

# Accessible names: every comic card announces "Title, Month D, YYYY". The
# card partial owns the format, so a card without a dated aria-label means
# the accessible-name policy regressed.
for page in public/index.html public/comics/index.html; do
    # The terminator (quote or space) keeps comic-card-meta/-title from matching.
    cards=$(grep -Eo 'class="?comic-card[" ]' "$page" | wc -l | tr -d ' ')
    dated=$(grep -Eo 'aria-label="[^"]+, [A-Za-z]+ [0-9]{1,2}, [0-9]{4}"' "$page" | wc -l | tr -d ' ')
    if [ "$cards" = "0" ] || [ "$cards" != "$dated" ]; then
        echo "❌ $page: $cards comic cards but $dated dated aria-labels"
        exit 1
    fi
    echo "✓ $page: all $cards comic cards have dated accessible names"
done

# The front-matter validation seam itself: a deliberately-invalid comic must
# fail a --panicOnWarning build. This proves the validate-page partial is
# still wired into the single template — without it, dropping that call in a
# refactor would pass every other test. Builds to a temp destination so the
# real public/ stays untouched. (Past date: future-dated pages aren't built,
# so they'd never reach the validator.)
echo "✅ Checking front-matter validation seam..."
probe="content/comics/2000-01-01-validation-probe.md"
printf -- '---\ntitle: Validation probe\ndate: 2000-01-01\n---\n' > "$probe"
if hugo --panicOnWarning --destination "$(mktemp -d)" >/dev/null 2>&1; then
    /bin/rm -f "$probe"
    echo "❌ Build succeeded despite invalid comic front matter — validation seam broken"
    exit 1
fi
/bin/rm -f "$probe"
echo "✓ Invalid front matter fails the build"

# Count pages
page_count=$(find public -name "*.html" | wc -l | tr -d ' ')
echo "📄 Built $page_count HTML pages"

# Check for broken links
echo "🔗 Checking for broken links..."
if command -v lychee >/dev/null 2>&1; then
    echo "Running lychee..."
    lychee --offline --root-dir "$(pwd)/public" --no-progress public/ \
        || { echo "⚠️  Some links are broken"; exit 1; }
    echo "✓ No broken internal links"
else
    echo "⚠️  lychee not installed. Skipping link check."
    echo "   Install with: brew install lychee"
fi

echo "✅ All tests passed!"

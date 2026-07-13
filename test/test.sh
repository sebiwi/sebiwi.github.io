#!/usr/bin/env bash
set -e # halt script on error

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
if ! ls public/css/style.min.*.css >/dev/null 2>&1; then
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

# Count pages
page_count=$(find public -name "*.html" | wc -l | tr -d ' ')
echo "📄 Built $page_count HTML pages"

# Check for broken links
echo "🔗 Checking for broken links..."
if command -v lychee >/dev/null 2>&1; then
    echo "Running lychee..."
    lychee --offline --root-dir "$(pwd)/public" --no-progress public/ \
        || (echo "⚠️  Some links are broken" && exit 1)
    echo "✓ No broken internal links"
else
    echo "⚠️  lychee not installed. Skipping link check."
    echo "   Install with: brew install lychee"
fi

echo "✅ All tests passed!"

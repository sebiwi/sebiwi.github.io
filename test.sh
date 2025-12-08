#!/usr/bin/env bash
set -e # halt script on error

echo "🧪 Testing Hugo build..."

# Clean previous build
echo "📦 Cleaning previous build..."
rm -rf public

# Build site with minification
echo "🔨 Building site..."
hugo --minify

# Build search index
echo "🔍 Building search index..."
pagefind --site public

# Check build succeeded
if [ ! -d "public" ]; then
    echo "❌ Build failed: public/ directory not created"
    exit 1
fi

# Check critical files exist
echo "✅ Checking critical files..."
files=("public/index.html" "public/blog/index.html" "public/comics/index.html")
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

if ! ls public/js/*.min.*.js >/dev/null 2>&1; then
    echo "❌ JS not minified/fingerprinted"
    exit 1
fi
echo "✓ JS minified and fingerprinted"

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

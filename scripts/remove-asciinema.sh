#!/usr/bin/env bash
set -e

echo "Removing asciinema script tags from blog posts..."

# Remove lines containing asciinema script tags
find content/blog -name "*.md" -type f -exec sed -i '' '/<script.*asciinema\.org.*<\/script>/d' {} \;

echo "✓ Removed asciinema references"

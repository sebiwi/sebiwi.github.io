#!/bin/bash

# Blog post migration
echo "Migrating blog posts..."

for file in blog/_posts/*.markdown; do
  if [ -f "$file" ]; then
    # Extract filename without path and date prefix
    filename=$(basename "$file")

    # Create target path in content/blog/
    target="content/blog/$filename"
    target="${target%.markdown}.md"

    # Copy file
    cp "$file" "$target"

    # Update front matter: category: blog -> (remove)
    sed -i '' '/^category: blog$/d' "$target"

    # Update front matter: tag: -> tags:
    sed -i '' 's/^tag:$/tags:/' "$target"

    # Update front matter: layout: post -> (remove)
    sed -i '' '/^layout: post$/d' "$target"

    # Update image paths: {{ site.url }}/assets/images/ -> /images/
    sed -i '' 's|{{ site\.url }}/assets/images/|/images/|g' "$target"
    sed -i '' 's|{{site\.url}}/assets/images/|/images/|g' "$target"

    # Update date format if needed (Jekyll dates work in Hugo too)

    echo "Migrated: $filename"
  fi
done

echo "Blog posts migration complete!"

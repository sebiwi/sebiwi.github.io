#!/bin/bash

# Comics post migration
echo "Migrating comics posts..."

for file in comics/_posts/*.markdown; do
  if [ -f "$file" ]; then
    # Extract filename
    filename=$(basename "$file")

    # Create target path
    target="content/comics/$filename"
    target="${target%.markdown}.md"

    # Copy file
    cp "$file" "$target"

    # Update front matter
    sed -i '' '/^category: comics$/d' "$target"
    sed -i '' 's/^tag:$/tags:/' "$target"
    sed -i '' '/^layout: post$/d' "$target"

    # Update image paths
    sed -i '' 's|{{ site\.url }}{{ page\.image }}|{{ .Params.image }}|g' "$target"
    sed -i '' 's|{{site\.url}}{{page\.image}}|{{ .Params.image }}|g' "$target"
    sed -i '' 's|/assets/images/comics/|/images/comics/|g' "$target"

    echo "Migrated: $filename"
  fi
done

echo "Comics posts migration complete!"

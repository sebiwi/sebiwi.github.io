#!/usr/bin/env python3
"""
Convert markdown images followed by HTML figcaption tags to Hugo figure shortcodes.

Pattern:
![alt](src){optional attrs}
<figcaption class="caption">caption text</figcaption>

Converts to:
{{< figure src="src" alt="alt" caption="caption text" class="optional-classes" >}}
"""

import re
import sys
from pathlib import Path

def convert_file(filepath):
    """Convert all figcaption patterns in a file to Hugo figure shortcodes."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Pattern: ![alt](src) or ![alt](src){attrs}
    # followed by <figcaption class="caption">text</figcaption>
    pattern = r'!\[([^\]]*)\]\(([^\)]+)\)(\{[^}]+\})?\s*\n<figcaption class="caption">(.+?)</figcaption>'

    def replace_match(match):
        alt = match.group(1)
        src = match.group(2)
        attrs = match.group(3) or ''  # Optional attributes like {: .center-image width="140px" }
        caption = match.group(4)

        # Extract class and width from attrs if present
        class_attr = ''
        width_attr = ''

        if attrs:
            # Extract class like {: .center-image }
            class_match = re.search(r'\.([a-z-]+)', attrs)
            if class_match:
                class_attr = f' class="{class_match.group(1)}"'

            # Extract width like width="140px"
            width_match = re.search(r'width="([^"]+)"', attrs)
            if width_match:
                width_attr = f' width="{width_match.group(1)}"'

        # Build figure shortcode
        result = f'{{{{< figure src="{src}" alt="{alt}" caption="{caption}"{class_attr}{width_attr} >}}}}'
        return result

    content = re.sub(pattern, replace_match, content, flags=re.MULTILINE)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    blog_dir = Path('content/blog')
    files_modified = 0

    for md_file in blog_dir.glob('*.md'):
        if convert_file(md_file):
            print(f'✓ Converted: {md_file.name}')
            files_modified += 1

    print(f'\n✓ Modified {files_modified} files')

if __name__ == '__main__':
    main()

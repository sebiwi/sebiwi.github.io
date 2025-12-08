#!/usr/bin/env python3
import re
from pathlib import Path

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Extract text from <a>text</a> in captions, removing the link
    # caption='<a href="url">text</a>' -> caption="text"
    content = re.sub(
        r"caption='<a href=\"[^\"]+\">([^<]+)</a>'",
        r'caption="\1"',
        content
    )

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

count = 0
for md_file in Path('content/blog').glob('*.md'):
    if fix_file(md_file):
        print(f'Simplified: {md_file.name}')
        count += 1

print(f'\nSimplified {count} files')

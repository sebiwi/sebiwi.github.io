#!/usr/bin/env python3
import re
from pathlib import Path

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Replace caption="<a href="url">text</a>" with caption='<a href="url">text</a>'
    # This allows the inner quotes to remain unescaped
    content = re.sub(
        r'caption="(<a href="[^"]+">.*?</a>)"',
        r"caption='\1'",
        content
    )

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

for md_file in Path('content/blog').glob('*.md'):
    if fix_file(md_file):
        print(f'Fixed: {md_file.name}')

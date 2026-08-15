# sebiwi.github.io

Personal site: a blog and a webcomic, built with Hugo and published on GitHub Pages.

## Language

**Comic**:
A single-image post in the comics section. Its transcript lives in the `alt` front matter key.

**Comic Card**:
The grid representation of a comic, used on the comics index and the home strip. Two variants: full (dated) and compact.
_Avoid_: comic thumbnail, comic tile

**404 shell**:
The fake terminal on the 404 page. Its filesystem mirrors the rendered page (the `ls ~/` links and a few page elements), so deleting things only affects the current view.

**Series**:
An ordered sequence of blog posts sharing a `series` front matter key. Parts are ordered oldest-first by date; part numbers derive from that position.

**Home strip**:
The "Recent comics" row on the home page; shows compact Comic Cards.

**Transcript**:
A comic's textual description, stored in the `alt` front matter key. One text, three jobs: image alt text, meta/OG description, and search text.

**Wide comic**:
A comic whose panels are too small to read at column width, marked `wide: true`; it bleeds past the column on its own page. An editorial legibility judgment, not an aspect-ratio fact: grids ignore it.
_Avoid_: landscape comic

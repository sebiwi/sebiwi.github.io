# Jekyll to Hugo Migration Design

**Date:** 2025-12-02
**Status:** Approved

## Overview

Complete rewrite of sebiwi.github.io from Jekyll to Hugo while maintaining feature parity. The migration will modernize the stack, simplify the codebase, and improve performance while keeping the site's core identity.

## Key Decisions

- **Static Site Generator:** Hugo (replacing Jekyll)
- **Styling:** Vanilla CSS with custom properties (replacing SCSS)
- **Hosting:** GitHub Pages with GitHub Actions
- **Branch Strategy:** Single `main` branch with Actions deployment
- **URL Structure:** Hugo's default sections (`/:section/:title/`) - maintains existing URLs
- **Design Direction:** Modernize while keeping the spirit
- **Features:** Keep all features but simplify and modernize them
- **Removed:** Disqus comments integration

## Site Architecture & Structure

### Content Organization
Hugo's section-based structure maps directly to URLs:
- `content/blog/` → `/blog/` section with all blog posts
- `content/comics/` → `/comics/` section with all comic posts
- `content/_index.md` → Home page content
- `content/about.md` → About page (optional)

### Layouts
- `layouts/_default/baseof.html` - Base template with HTML structure, CSS, meta tags
- `layouts/_default/single.html` - Individual post template (blog & comics)
- `layouts/_default/list.html` - Section listing pages (blog index, comics index)
- `layouts/index.html` - Home page layout
- `layouts/partials/` - Reusable components (header, footer, nav, post-card, etc.)

### Static Assets
- `static/images/` - All images (comics, blog assets, profile)
- `static/css/style.css` - Single vanilla CSS file
- Hugo copies these directly to output without processing

### Configuration
Single `hugo.toml` file handles all site config (title, author, social links, feature toggles).

## Styling with Vanilla CSS

### CSS Organization
Single `static/css/style.css` with logical sections:

```css
/* CSS Custom Properties (Variables) */
:root {
  --color-primary: #2d2d2d;
  --color-accent: #4a90e2;
  --spacing-unit: 1rem;
  --font-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "SF Mono", Monaco, monospace;
  --transition-speed: 0.2s;
}

/* Base Styles */
/* Layout */
/* Components */
/* Pages */
/* Utilities */
```

### Modern CSS Features
- Native CSS nesting for component scoping
- CSS custom properties for theming
- Container queries for responsive components
- CSS Grid and Flexbox for layouts
- `color-scheme` meta tag for system preferences

### Performance Benefits
- Single CSS file = one HTTP request
- No build step or preprocessing needed
- Minification only in production (via Hugo's asset pipeline)
- Smaller and more maintainable than original SCSS

## Features Implementation

### Next/Previous Navigation
Use Hugo's built-in `.NextInSection` and `.PrevInSection` methods for within-section navigation. No custom code needed - this is native Hugo functionality that replicates the Jekyll plugin behavior.

### Tags
Hugo's taxonomy system handles tags automatically:
- Clean tag cloud on `/tags/`
- Individual tag pages showing all posts with that tag
- Much simpler than Jekyll's approach

### Related Posts
Hugo's `.Site.RegularPages.Related` uses tags and content similarity:
- Limit to 3 related posts
- Display as simple cards below each post
- Automatic based on content similarity

### Read Time
Calculate with template function: `{{ div (countwords .Content) 220 }}` (average reading speed). No plugin needed.

### Author Info
Simplified author card at end of posts:
- Data from `hugo.toml`
- Avatar, bio, social links
- Minimal design since single author

### Animations
- Subtle CSS transitions
- Intersection observer for fade-in on scroll
- Small vanilla JS snippet
- Much lighter than jQuery-based animations

## Modern Best Practices (New Features)

### RSS Feeds
Hugo generates RSS automatically:
- `/index.xml` - All content (blog + comics)
- `/blog/index.xml` - Blog posts only
- `/comics/index.xml` - Comics only

### SEO & Social Sharing
- Open Graph tags for Facebook/LinkedIn previews
- Twitter Card meta tags for rich Twitter previews
- Structured data (JSON-LD) for search engines
- Automatic image optimization and responsive images

### Performance Optimizations
- Lazy loading for images (native `loading="lazy"`)
- Modern image formats (WebP with fallbacks)
- Minimal JavaScript (only for animations and interactions)
- Optimized font loading with `font-display: swap`

### Accessibility
- Semantic HTML5 elements (`<article>`, `<nav>`, `<aside>`)
- Proper heading hierarchy
- Alt text requirements for images
- ARIA labels where needed
- Keyboard navigation support

### Mobile Experience
- Mobile-first responsive design
- Touch-friendly tap targets (minimum 44px)
- Optimized typography for smaller screens
- Fast loading on slower connections

## GitHub Actions & Deployment

### Build Process
`.github/workflows/hugo.yml`:
1. Triggers on pushes to `main` branch
2. Checks out code
3. Sets up Hugo (latest version)
4. Builds site with `hugo --minify`
5. Deploys to GitHub Pages service directly

### Branch Structure
- Single `main` branch for source and deployment
- No separate branch for built site
- Built site never pollutes git history
- Configure GitHub Pages to deploy from "GitHub Actions"

### Build Speed
Hugo builds in under 1 second (vs Jekyll's 10-30 seconds). Much faster development loop.

### Local Development
Simple commands:
- `hugo server -D` - Live reload dev server at localhost:1313
- `hugo` - Build production site to `public/`

No Ruby dependencies, no bundle install, no gem updates. Just Hugo binary.

## Content Migration Strategy

### Front Matter Changes

**Blog posts:**
```yaml
# Jekyll (current)
---
title: "Post Title"
layout: post
date: 2017-03-04 10:50:02 +0100
tag:
- tips and tricks
category: blog
author: sebiwi
---

# Hugo (new)
---
title: "Post Title"
date: 2017-03-04T10:50:02+01:00
tags:
- tips and tricks
author: sebiwi
---
```

**Comics posts:**
```yaml
# Jekyll (current)
---
title: "Good ideas"
layout: post
date: 2017-11-16 20:19:02 +0100
tag:
- comics
category: comics
author: sebiwi
image: /assets/images/comics/2017-11-16-good-ideas.jpg
---

# Hugo (new)
---
title: "Good ideas"
date: 2017-11-16T20:19:02+01:00
tags:
- comics
author: sebiwi
image: /images/comics/2017-11-16-good-ideas.jpg
---
```

### Key Changes
- Remove `layout` (Hugo infers from location)
- Remove `category` (Hugo uses section folders)
- Change `tag:` to `tags:`
- ISO 8601 date format (Hugo is stricter)
- Update image paths from `/assets/images/` to `/images/`

### File Organization
- Move `blog/_posts/*.markdown` → `content/blog/*.md`
- Move `comics/_posts/*.markdown` → `content/comics/*.md`
- Keep date-prefixed filenames or use front matter dates

### Automated Migration
Write a script to batch-convert all front matter and update image paths automatically.

## Configuration (hugo.toml)

```toml
baseURL = 'https://sebiwi.github.io/'
languageCode = 'en-us'
title = 'Sebiwi'

[params]
  name = 'Sebiwi'
  bio = 'Tech, fun, and cookies'
  description = 'Tech, fun and cookies'
  picture = '/images/profile.jpg'
  email = 'contact.sebiwi@gmail.com'

  # Feature toggles
  showReadTime = true
  showTags = true
  showRelated = true
  showAuthor = true
  animations = true

  # Social links
  [params.social]
    twitter = 'sebiwicb'
    github = 'sebiwi'

[permalinks]
  blog = '/blog/:title/'
  comics = '/comics/:title/'

[taxonomies]
  tag = 'tags'

[outputs]
  home = ['HTML', 'RSS']
  section = ['HTML', 'RSS']
```

### Benefits
- Type-safe (TOML catches errors)
- Cleaner nested structure
- Feature toggles easily accessible in templates
- Single source of truth
- No separate authors config needed

## Visual Design & Layout

### Design Philosophy
Keep clean, minimalist aesthetic with modern refinements:
- More whitespace and breathing room
- Better typography hierarchy
- Smoother, subtler animations
- Cleaner component styling

### Home Page
- Centered layout with avatar and bio
- Clean navigation to Blog, Comics, Tags
- Social links with simple icon set
- Minimal, focused introduction

### List Pages (Blog/Comics Index)
Card-based post previews:
- Title, date, read time, tags
- Short excerpt (blog) or comic thumbnail (comics)
- Clean hover states
- Chronological ordering, newest first
- Responsive grid (1 column mobile, 2-3 desktop)

### Single Post Pages
- Generous line length for readability (~65-75 characters)
- Clear visual hierarchy for headings
- Next/Previous navigation as minimal arrows with post titles
- Related posts as small cards at bottom
- Simplified author card
- Clean tag badges

### Navigation
Sticky header with minimal design:
- Site name
- Main sections
- Theme awareness for system dark mode

### Modernizations
- Rounded corners (subtle, 4-8px)
- Soft shadows for depth
- Better mobile typography
- Improved contrast ratios (WCAG AA)
- Smoother transitions

## Success Criteria

- All existing URLs continue to work
- All blog posts and comics migrated with correct front matter
- Visual design feels modern but familiar
- Site builds in under 1 second locally
- All features work (tags, related posts, navigation, read time)
- Passes accessibility checks
- Works well on mobile devices
- RSS feeds functional
- Social sharing previews work correctly
- No Disqus code remains

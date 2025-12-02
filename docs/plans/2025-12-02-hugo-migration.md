# Jekyll to Hugo Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate sebiwi.github.io from Jekyll to Hugo with vanilla CSS, maintaining feature parity and modernizing the design.

**Architecture:** Hugo static site with section-based content organization (content/blog/, content/comics/), single vanilla CSS file with custom properties, minimal JavaScript for animations, GitHub Actions deployment to Pages.

**Tech Stack:** Hugo (latest), Vanilla CSS, GitHub Actions, GitHub Pages

---

## Prerequisites

### Task 1: Install Hugo

**Step 1: Check if Hugo is installed**

Run: `hugo version`
Expected: Either version info or "command not found"

**Step 2: Install Hugo if needed**

```bash
# macOS
brew install hugo

# Verify installation
hugo version
```

Expected: `hugo v0.1xx.x` or similar

**Step 3: Verify Hugo extended version**

Run: `hugo version | grep extended`
Expected: Output shows "extended" (needed for some features)

---

## Phase 1: Hugo Project Setup

### Task 2: Create Basic Hugo Structure

**Files:**
- Create: `hugo.toml`
- Create: `layouts/_default/baseof.html`
- Create: `content/_index.md`
- Create: `static/css/style.css`

**Step 1: Create hugo.toml configuration**

Create file at project root:

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

[markup]
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true
```

**Step 2: Create layouts directory structure**

```bash
mkdir -p layouts/_default layouts/partials layouts/blog layouts/comics
```

**Step 3: Create content directory structure**

```bash
mkdir -p content/blog content/comics
```

**Step 4: Create static directory structure**

```bash
mkdir -p static/css static/images static/js
```

**Step 5: Commit initial structure**

```bash
git add hugo.toml
git commit -m "feat: add Hugo configuration

Initial Hugo setup with:
- Site configuration
- Permalink structure matching Jekyll
- Feature toggles
- Social links configuration"
```

---

### Task 3: Create Base Layout

**Files:**
- Create: `layouts/_default/baseof.html`

**Step 1: Create base HTML template**

```html
<!DOCTYPE html>
<html lang="{{ .Site.LanguageCode }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="{{ if .Description }}{{ .Description }}{{ else }}{{ .Site.Params.description }}{{ end }}">

    <title>{{ if .IsHome }}{{ .Site.Title }} - {{ .Site.Params.bio }}{{ else }}{{ .Title }} - {{ .Site.Title }}{{ end }}</title>

    <!-- CSS -->
    <link rel="stylesheet" href="/css/style.css">

    <!-- RSS -->
    {{ range .AlternativeOutputFormats -}}
        {{ printf `<link rel="%s" type="%s" href="%s" title="%s" />` .Rel .MediaType.Type .Permalink $.Site.Title | safeHTML }}
    {{ end -}}

    <!-- Open Graph -->
    <meta property="og:title" content="{{ if .IsHome }}{{ .Site.Title }}{{ else }}{{ .Title }}{{ end }}">
    <meta property="og:description" content="{{ if .Description }}{{ .Description }}{{ else }}{{ .Site.Params.description }}{{ end }}">
    <meta property="og:type" content="{{ if .IsPage }}article{{ else }}website{{ end }}">
    <meta property="og:url" content="{{ .Permalink }}">
    {{ with .Params.image }}<meta property="og:image" content="{{ . | absURL }}">{{ end }}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:site" content="@{{ .Site.Params.social.twitter }}">
    <meta name="twitter:title" content="{{ if .IsHome }}{{ .Site.Title }}{{ else }}{{ .Title }}{{ end }}">
    <meta name="twitter:description" content="{{ if .Description }}{{ .Description }}{{ else }}{{ .Site.Params.description }}{{ end }}">
    {{ with .Params.image }}<meta name="twitter:image" content="{{ . | absURL }}">{{ end }}

    <!-- Theme -->
    <meta name="color-scheme" content="light dark">
</head>
<body>
    {{ partial "header.html" . }}

    <main>
        {{ block "main" . }}{{ end }}
    </main>

    {{ partial "footer.html" . }}

    {{ if .Site.Params.animations }}
    <script src="/js/animations.js"></script>
    {{ end }}
</body>
</html>
```

**Step 2: Commit base layout**

```bash
git add layouts/_default/baseof.html
git commit -m "feat: add base HTML layout template

Complete base layout with:
- Meta tags for SEO
- Open Graph tags for social sharing
- Twitter Card support
- RSS feed links
- Responsive viewport
- Theme support"
```

---

### Task 4: Create Header Partial

**Files:**
- Create: `layouts/partials/header.html`

**Step 1: Create header template**

```html
<header class="site-header">
    <div class="container">
        <a href="/" class="site-title">{{ .Site.Title }}</a>
        <nav class="site-nav">
            <a href="/blog/">Blog</a>
            <a href="/comics/">Comics</a>
            <a href="/tags/">Tags</a>
        </nav>
    </div>
</header>
```

**Step 2: Commit header partial**

```bash
git add layouts/partials/header.html
git commit -m "feat: add header partial with navigation"
```

---

### Task 5: Create Footer Partial

**Files:**
- Create: `layouts/partials/footer.html`

**Step 1: Create footer template**

```html
<footer class="site-footer">
    <div class="container">
        {{ partial "social-links.html" . }}
        <p class="copyright">&copy; {{ now.Year }} {{ .Site.Title }}</p>
    </div>
</footer>
```

**Step 2: Commit footer partial**

```bash
git add layouts/partials/footer.html
git commit -m "feat: add footer partial"
```

---

### Task 6: Create Social Links Partial

**Files:**
- Create: `layouts/partials/social-links.html`

**Step 1: Create social links template**

```html
<div class="social-links">
    {{ with .Site.Params.social.twitter }}
    <a href="https://twitter.com/{{ . }}" target="_blank" rel="noopener" aria-label="Twitter">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
        </svg>
    </a>
    {{ end }}

    {{ with .Site.Params.social.github }}
    <a href="https://github.com/{{ . }}" target="_blank" rel="noopener" aria-label="GitHub">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
        </svg>
    </a>
    {{ end }}

    {{ with .Site.Params.email }}
    <a href="mailto:{{ . }}" aria-label="Email">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
    </a>
    {{ end }}
</div>
```

**Step 2: Commit social links partial**

```bash
git add layouts/partials/social-links.html
git commit -m "feat: add social links partial with SVG icons"
```

---

## Phase 2: Layout Templates

### Task 7: Create Home Page Layout

**Files:**
- Create: `layouts/index.html`
- Create: `content/_index.md`

**Step 1: Create home page template**

```html
{{ define "main" }}
<div class="home-page">
    <div class="container">
        <div class="profile">
            <img src="{{ .Site.Params.picture }}" alt="{{ .Site.Params.name }}" class="profile-image">
            <h1>{{ .Site.Params.name }}</h1>
            <p class="bio">{{ .Site.Params.bio }}</p>
        </div>

        <nav class="home-nav">
            <a href="/blog/" class="home-nav-link">Blog</a>
            <a href="/comics/" class="home-nav-link">Comics</a>
            <a href="/tags/" class="home-nav-link">Tags</a>
        </nav>

        {{ partial "social-links.html" . }}
    </div>
</div>
{{ end }}
```

**Step 2: Create home page content**

Create `content/_index.md`:

```markdown
---
title: Home
---
```

**Step 3: Commit home page**

```bash
git add layouts/index.html content/_index.md
git commit -m "feat: add home page layout and content"
```

---

### Task 8: Create Single Post Layout

**Files:**
- Create: `layouts/_default/single.html`

**Step 1: Create single post template**

```html
{{ define "main" }}
<article class="post">
    <div class="container">
        <header class="post-header">
            {{ if and .Params.image (eq .Section "comics") }}
            <img class="post-image" src="{{ .Params.image }}" alt="{{ .Title }}">
            {{ end }}

            <h1 class="post-title">{{ .Title }}</h1>

            <div class="post-meta">
                <time datetime="{{ .Date.Format "2006-01-02" }}">
                    {{ .Date.Format "Monday, January 02, 2006" }}
                </time>

                {{ if .Site.Params.showReadTime }}
                <span class="read-time">{{ math.Round (div (countwords .Content) 220.0) }} min read</span>
                {{ end }}
            </div>

            {{ if .Site.Params.showTags }}
            {{ with .Params.tags }}
            <div class="post-tags">
                {{ range . }}
                <a href="{{ "/tags/" | relLangURL }}{{ . | urlize }}" class="tag">{{ . }}</a>
                {{ end }}
            </div>
            {{ end }}
            {{ end }}
        </header>

        <div class="post-content">
            {{ .Content }}
        </div>

        {{ partial "post-navigation.html" . }}

        {{ if .Site.Params.showRelated }}
        {{ partial "related.html" . }}
        {{ end }}

        {{ if .Site.Params.showAuthor }}
        {{ partial "author.html" . }}
        {{ end }}
    </div>
</article>
{{ end }}
```

**Step 2: Commit single post layout**

```bash
git add layouts/_default/single.html
git commit -m "feat: add single post layout

Includes:
- Post header with title, date, read time
- Tags display
- Post content
- Navigation (prev/next)
- Related posts
- Author info"
```

---

### Task 9: Create List Page Layout

**Files:**
- Create: `layouts/_default/list.html`
- Create: `layouts/partials/post-card.html`

**Step 1: Create list template**

```html
{{ define "main" }}
<div class="list-page">
    <div class="container">
        <h1 class="page-title">{{ .Title }}</h1>

        {{ if .Content }}
        <div class="page-content">
            {{ .Content }}
        </div>
        {{ end }}

        <div class="post-grid">
            {{ range .Pages }}
            {{ partial "post-card.html" . }}
            {{ end }}
        </div>

        {{ if eq (len .Pages) 0 }}
        <p class="no-posts">Nothing published yet!</p>
        {{ end }}
    </div>
</div>
{{ end }}
```

**Step 2: Create post card partial**

Create `layouts/partials/post-card.html`:

```html
<article class="post-card">
    <a href="{{ .RelPermalink }}" class="post-card-link">
        {{ if .Params.image }}
        <img src="{{ .Params.image }}" alt="{{ .Title }}" class="post-card-image" loading="lazy">
        {{ end }}

        <div class="post-card-content">
            <h2 class="post-card-title">{{ .Title }}</h2>

            <div class="post-card-meta">
                <time datetime="{{ .Date.Format "2006-01-02" }}">
                    {{ .Date.Format "Jan 02, 2006" }}
                </time>

                {{ if .Site.Params.showReadTime }}
                <span class="read-time">{{ math.Round (div (countwords .Content) 220.0) }} min read</span>
                {{ end }}
            </div>

            {{ if and .Summary (ne .Section "comics") }}
            <p class="post-card-summary">{{ .Summary | truncate 150 }}</p>
            {{ end }}

            {{ if .Params.tags }}
            <div class="post-card-tags">
                {{ range first 3 .Params.tags }}
                <span class="tag">{{ . }}</span>
                {{ end }}
            </div>
            {{ end }}
        </div>
    </a>
</article>
```

**Step 3: Commit list layout**

```bash
git add layouts/_default/list.html layouts/partials/post-card.html
git commit -m "feat: add list page layout and post card partial"
```

---

### Task 10: Create Post Navigation Partial

**Files:**
- Create: `layouts/partials/post-navigation.html`

**Step 1: Create post navigation template**

```html
{{ if or .NextInSection .PrevInSection }}
<nav class="post-navigation">
    {{ with .PrevInSection }}
    <a href="{{ .RelPermalink }}" class="post-nav-prev">
        <span class="post-nav-label">&laquo; Previous</span>
        <span class="post-nav-title">{{ .Title }}</span>
    </a>
    {{ else }}
    <span class="post-nav-placeholder"></span>
    {{ end }}

    {{ with .NextInSection }}
    <a href="{{ .RelPermalink }}" class="post-nav-next">
        <span class="post-nav-label">Next &raquo;</span>
        <span class="post-nav-title">{{ .Title }}</span>
    </a>
    {{ end }}
</nav>
{{ end }}
```

**Step 2: Commit post navigation**

```bash
git add layouts/partials/post-navigation.html
git commit -m "feat: add post navigation partial for prev/next within section"
```

---

### Task 11: Create Related Posts Partial

**Files:**
- Create: `layouts/partials/related.html`

**Step 1: Create related posts template**

```html
{{ $related := .Site.RegularPages.Related . | first 3 }}
{{ if $related }}
<section class="related-posts">
    <h3>Related Posts</h3>
    <div class="related-grid">
        {{ range $related }}
        <article class="related-card">
            <a href="{{ .RelPermalink }}">
                <h4>{{ .Title }}</h4>
                <time datetime="{{ .Date.Format "2006-01-02" }}">
                    {{ .Date.Format "Jan 02, 2006" }}
                </time>
            </a>
        </article>
        {{ end }}
    </div>
</section>
{{ end }}
```

**Step 2: Commit related posts**

```bash
git add layouts/partials/related.html
git commit -m "feat: add related posts partial"
```

---

### Task 12: Create Author Partial

**Files:**
- Create: `layouts/partials/author.html`

**Step 1: Create author info template**

```html
<aside class="author-info">
    <img src="{{ .Site.Params.picture }}" alt="{{ .Site.Params.name }}" class="author-avatar">
    <div class="author-details">
        <h4 class="author-name">{{ .Site.Params.name }}</h4>
        <p class="author-bio">{{ .Site.Params.bio }}</p>
        {{ partial "social-links.html" . }}
    </div>
</aside>
```

**Step 2: Commit author partial**

```bash
git add layouts/partials/author.html
git commit -m "feat: add author info partial"
```

---

### Task 13: Create Tags Page Layout

**Files:**
- Create: `layouts/_default/terms.html`
- Create: `layouts/_default/taxonomy.html`

**Step 1: Create tags list template**

Create `layouts/_default/terms.html`:

```html
{{ define "main" }}
<div class="tags-page">
    <div class="container">
        <h1 class="page-title">Tags</h1>

        <div class="tags-cloud">
            {{ range .Data.Terms.Alphabetical }}
            <a href="{{ .Page.RelPermalink }}" class="tag-cloud-item">
                {{ .Page.Title }} <span class="tag-count">({{ .Count }})</span>
            </a>
            {{ end }}
        </div>
    </div>
</div>
{{ end }}
```

**Step 2: Create single tag template**

Create `layouts/_default/taxonomy.html`:

```html
{{ define "main" }}
<div class="taxonomy-page">
    <div class="container">
        <h1 class="page-title">Posts tagged: {{ .Title }}</h1>

        <div class="post-grid">
            {{ range .Pages }}
            {{ partial "post-card.html" . }}
            {{ end }}
        </div>
    </div>
</div>
{{ end }}
```

**Step 3: Commit tag layouts**

```bash
git add layouts/_default/terms.html layouts/_default/taxonomy.html
git commit -m "feat: add tags page layouts"
```

---

## Phase 3: Styling with Vanilla CSS

### Task 14: Create CSS Custom Properties

**Files:**
- Create: `static/css/style.css`

**Step 1: Create CSS file with variables**

```css
/* ========================================
   CSS Custom Properties (Variables)
   ======================================== */

:root {
  /* Colors */
  --color-text: #2d2d2d;
  --color-text-light: #666;
  --color-background: #ffffff;
  --color-surface: #f9f9f9;
  --color-border: #e0e0e0;
  --color-accent: #4a90e2;
  --color-accent-hover: #357abd;

  /* Typography */
  --font-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
  --font-size-base: 16px;
  --font-size-large: 1.125rem;
  --font-size-xlarge: 1.5rem;
  --font-size-xxlarge: 2rem;
  --font-size-small: 0.875rem;
  --line-height-base: 1.6;
  --line-height-heading: 1.3;

  /* Spacing */
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;
  --spacing-xxl: 4rem;

  /* Layout */
  --container-width: 800px;
  --container-wide: 1200px;
  --border-radius: 6px;

  /* Transitions */
  --transition-speed: 0.2s;
  --transition-easing: ease-in-out;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Dark mode support (respects system preference) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #e0e0e0;
    --color-text-light: #a0a0a0;
    --color-background: #1a1a1a;
    --color-surface: #252525;
    --color-border: #404040;
    --color-accent: #6baeff;
    --color-accent-hover: #5a9ce8;
  }
}
```

**Step 2: Commit CSS variables**

```bash
git add static/css/style.css
git commit -m "feat: add CSS custom properties with dark mode support"
```

---

### Task 15: Add Base Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add base styles after variables**

```css
/* ========================================
   Base Styles
   ======================================== */

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: var(--font-size-base);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-base);
  font-size: 1rem;
  line-height: var(--line-height-base);
  color: var(--color-text);
  background-color: var(--color-background);
  transition: background-color var(--transition-speed) var(--transition-easing),
              color var(--transition-speed) var(--transition-easing);
}

/* Typography */
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: var(--line-height-heading);
  margin-bottom: var(--spacing-sm);
  color: var(--color-text);
}

h1 { font-size: var(--font-size-xxlarge); }
h2 { font-size: var(--font-size-xlarge); }
h3 { font-size: var(--font-size-large); }

p {
  margin-bottom: var(--spacing-sm);
}

a {
  color: var(--color-accent);
  text-decoration: none;
  transition: color var(--transition-speed) var(--transition-easing);
}

a:hover {
  color: var(--color-accent-hover);
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background-color: var(--color-surface);
  padding: 0.2em 0.4em;
  border-radius: 3px;
}

pre {
  background-color: var(--color-surface);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius);
  overflow-x: auto;
  margin-bottom: var(--spacing-sm);
}

pre code {
  background-color: transparent;
  padding: 0;
}

blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: var(--spacing-sm);
  margin-left: 0;
  margin-bottom: var(--spacing-sm);
  font-style: italic;
  color: var(--color-text-light);
}
```

**Step 2: Commit base styles**

```bash
git add static/css/style.css
git commit -m "feat: add base typography and element styles"
```

---

### Task 16: Add Layout Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add layout styles**

```css
/* ========================================
   Layout
   ======================================== */

.container {
  max-width: var(--container-width);
  margin: 0 auto;
  padding: 0 var(--spacing-sm);
}

main {
  min-height: calc(100vh - 200px);
  padding: var(--spacing-xl) 0;
}

/* Utility Classes */
.center-image {
  margin-left: auto;
  margin-right: auto;
}

.bigger-image {
  max-width: 100%;
}
```

**Step 2: Commit layout styles**

```bash
git add static/css/style.css
git commit -m "feat: add layout and container styles"
```

---

### Task 17: Add Header Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add header component styles**

```css
/* ========================================
   Header
   ======================================== */

.site-header {
  background-color: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  padding: var(--spacing-sm) 0;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
  background-color: rgba(255, 255, 255, 0.9);
}

@media (prefers-color-scheme: dark) {
  .site-header {
    background-color: rgba(26, 26, 26, 0.9);
  }
}

.site-header .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.site-title {
  font-size: var(--font-size-large);
  font-weight: 600;
  color: var(--color-text);
}

.site-title:hover {
  color: var(--color-accent);
}

.site-nav {
  display: flex;
  gap: var(--spacing-md);
}

.site-nav a {
  color: var(--color-text);
  font-weight: 500;
  padding: var(--spacing-xs) 0;
  border-bottom: 2px solid transparent;
  transition: border-color var(--transition-speed) var(--transition-easing);
}

.site-nav a:hover {
  border-bottom-color: var(--color-accent);
}

@media (max-width: 600px) {
  .site-nav {
    gap: var(--spacing-sm);
  }
}
```

**Step 2: Commit header styles**

```bash
git add static/css/style.css
git commit -m "feat: add header and navigation styles"
```

---

### Task 18: Add Footer Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add footer component styles**

```css
/* ========================================
   Footer
   ======================================== */

.site-footer {
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: var(--spacing-lg) 0;
  margin-top: var(--spacing-xxl);
  text-align: center;
}

.site-footer .container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.copyright {
  color: var(--color-text-light);
  font-size: var(--font-size-small);
  margin: 0;
}
```

**Step 2: Commit footer styles**

```bash
git add static/css/style.css
git commit -m "feat: add footer styles"
```

---

### Task 19: Add Social Links Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add social links styles**

```css
/* ========================================
   Social Links
   ======================================== */

.social-links {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: center;
}

.social-links a {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  transition: all var(--transition-speed) var(--transition-easing);
}

.social-links a:hover {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  transform: translateY(-2px);
}

.social-links a:hover svg {
  stroke: white;
}

.social-links svg {
  width: 20px;
  height: 20px;
  stroke: var(--color-text);
  transition: stroke var(--transition-speed) var(--transition-easing);
}
```

**Step 2: Commit social links styles**

```bash
git add static/css/style.css
git commit -m "feat: add social links styles"
```

---

### Task 20: Add Home Page Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add home page styles**

```css
/* ========================================
   Home Page
   ======================================== */

.home-page {
  padding: var(--spacing-xxl) 0;
}

.profile {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.profile-image {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  margin: 0 auto var(--spacing-md);
  border: 4px solid var(--color-border);
}

.profile h1 {
  font-size: var(--font-size-xxlarge);
  margin-bottom: var(--spacing-xs);
}

.bio {
  font-size: var(--font-size-large);
  color: var(--color-text-light);
  margin-bottom: var(--spacing-lg);
}

.home-nav {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
}

.home-nav-link {
  padding: var(--spacing-sm) var(--spacing-lg);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  font-weight: 500;
  transition: all var(--transition-speed) var(--transition-easing);
}

.home-nav-link:hover {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

**Step 2: Commit home page styles**

```bash
git add static/css/style.css
git commit -m "feat: add home page styles"
```

---

### Task 21: Add Post Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add single post styles**

```css
/* ========================================
   Single Post
   ======================================== */

.post {
  padding: var(--spacing-xl) 0;
}

.post-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.post-image {
  max-width: 100%;
  margin: 0 auto var(--spacing-lg);
  border-radius: var(--border-radius);
}

.post-title {
  font-size: var(--font-size-xxlarge);
  margin-bottom: var(--spacing-sm);
}

.post-meta {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: center;
  align-items: center;
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  margin-bottom: var(--spacing-sm);
}

.post-meta time::after {
  content: "•";
  margin-left: var(--spacing-sm);
}

.post-tags {
  display: flex;
  gap: var(--spacing-xs);
  justify-content: center;
  flex-wrap: wrap;
}

.tag {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: var(--font-size-small);
  color: var(--color-text);
  transition: all var(--transition-speed) var(--transition-easing);
}

.tag:hover {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.post-content {
  max-width: 680px;
  margin: 0 auto var(--spacing-xl);
}

.post-content p {
  margin-bottom: var(--spacing-md);
}

.post-content h2 {
  margin-top: var(--spacing-xl);
  margin-bottom: var(--spacing-sm);
}

.post-content h3 {
  margin-top: var(--spacing-lg);
  margin-bottom: var(--spacing-sm);
}

.post-content img {
  margin: var(--spacing-lg) auto;
  border-radius: var(--border-radius);
}

.post-content figcaption,
.caption {
  text-align: center;
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  margin-top: var(--spacing-xs);
  font-style: italic;
}
```

**Step 2: Commit post styles**

```bash
git add static/css/style.css
git commit -m "feat: add single post styles"
```

---

### Task 22: Add Post Card Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add post card and grid styles**

```css
/* ========================================
   Post Cards & Grid
   ======================================== */

.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-lg);
  margin-top: var(--spacing-lg);
}

@media (max-width: 768px) {
  .post-grid {
    grid-template-columns: 1fr;
  }
}

.post-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
  transition: all var(--transition-speed) var(--transition-easing);
}

.post-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}

.post-card-link {
  display: block;
  color: var(--color-text);
}

.post-card-link:hover {
  color: var(--color-text);
}

.post-card-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.post-card-content {
  padding: var(--spacing-md);
}

.post-card-title {
  font-size: var(--font-size-large);
  margin-bottom: var(--spacing-xs);
  color: var(--color-text);
}

.post-card-meta {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  margin-bottom: var(--spacing-sm);
}

.post-card-meta time::after {
  content: "•";
  margin-left: var(--spacing-sm);
}

.post-card-summary {
  color: var(--color-text-light);
  font-size: var(--font-size-small);
  margin-bottom: var(--spacing-sm);
}

.post-card-tags {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.post-card-tags .tag {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
}
```

**Step 2: Commit post card styles**

```bash
git add static/css/style.css
git commit -m "feat: add post card and grid styles"
```

---

### Task 23: Add Post Navigation Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add post navigation styles**

```css
/* ========================================
   Post Navigation
   ======================================== */

.post-navigation {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin: var(--spacing-xl) 0;
  padding: var(--spacing-lg) 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.post-nav-prev,
.post-nav-next {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  flex: 1;
  transition: all var(--transition-speed) var(--transition-easing);
}

.post-nav-prev:hover,
.post-nav-next:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.post-nav-next {
  text-align: right;
  align-items: flex-end;
}

.post-nav-label {
  font-size: var(--font-size-small);
  color: var(--color-text-light);
  font-weight: 500;
}

.post-nav-title {
  font-size: var(--font-size-base);
  color: var(--color-text);
}

.post-nav-placeholder {
  flex: 1;
}

@media (max-width: 600px) {
  .post-navigation {
    flex-direction: column;
  }

  .post-nav-next {
    text-align: left;
    align-items: flex-start;
  }
}
```

**Step 2: Commit post navigation styles**

```bash
git add static/css/style.css
git commit -m "feat: add post navigation styles"
```

---

### Task 24: Add Related Posts Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add related posts styles**

```css
/* ========================================
   Related Posts
   ======================================== */

.related-posts {
  margin: var(--spacing-xl) 0;
  padding: var(--spacing-lg);
  background-color: var(--color-surface);
  border-radius: var(--border-radius);
}

.related-posts h3 {
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-large);
}

.related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-md);
}

.related-card {
  padding: var(--spacing-sm);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  transition: all var(--transition-speed) var(--transition-easing);
}

.related-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.related-card a {
  display: block;
  color: var(--color-text);
}

.related-card h4 {
  font-size: var(--font-size-base);
  margin-bottom: var(--spacing-xs);
  color: var(--color-text);
}

.related-card time {
  font-size: var(--font-size-small);
  color: var(--color-text-light);
}

@media (max-width: 600px) {
  .related-grid {
    grid-template-columns: 1fr;
  }
}
```

**Step 2: Commit related posts styles**

```bash
git add static/css/style.css
git commit -m "feat: add related posts styles"
```

---

### Task 25: Add Author Info Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add author info styles**

```css
/* ========================================
   Author Info
   ======================================== */

.author-info {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  padding: var(--spacing-lg);
  margin: var(--spacing-xl) 0;
  background-color: var(--color-surface);
  border-radius: var(--border-radius);
}

.author-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  flex-shrink: 0;
}

.author-details {
  flex: 1;
}

.author-name {
  font-size: var(--font-size-large);
  margin-bottom: var(--spacing-xs);
}

.author-bio {
  color: var(--color-text-light);
  margin-bottom: var(--spacing-sm);
}

.author-info .social-links {
  justify-content: flex-start;
}

@media (max-width: 600px) {
  .author-info {
    flex-direction: column;
    text-align: center;
  }

  .author-info .social-links {
    justify-content: center;
  }
}
```

**Step 2: Commit author info styles**

```bash
git add static/css/style.css
git commit -m "feat: add author info styles"
```

---

### Task 26: Add Tags Page Styles

**Files:**
- Modify: `static/css/style.css`

**Step 1: Add tags page styles**

```css
/* ========================================
   Tags Page
   ======================================== */

.tags-page,
.taxonomy-page,
.list-page {
  padding: var(--spacing-xl) 0;
}

.page-title {
  font-size: var(--font-size-xxlarge);
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.tags-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  justify-content: center;
  padding: var(--spacing-lg) 0;
}

.tag-cloud-item {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: var(--font-size-base);
  color: var(--color-text);
  transition: all var(--transition-speed) var(--transition-easing);
}

.tag-cloud-item:hover {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
  transform: translateY(-2px);
}

.tag-count {
  font-size: var(--font-size-small);
  color: var(--color-text-light);
}

.tag-cloud-item:hover .tag-count {
  color: rgba(255, 255, 255, 0.8);
}

.no-posts {
  text-align: center;
  color: var(--color-text-light);
  padding: var(--spacing-xxl) 0;
}
```

**Step 2: Commit tags page styles**

```bash
git add static/css/style.css
git commit -m "feat: add tags and list page styles"
```

---

### Task 27: Add Animation JavaScript

**Files:**
- Create: `static/js/animations.js`

**Step 1: Create animations script**

```javascript
// Fade-in animations on scroll
document.addEventListener('DOMContentLoaded', () => {
  // Elements to animate
  const animateElements = document.querySelectorAll('.post-card, .related-card, .post-content img');

  // Intersection Observer options
  const options = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  // Intersection Observer callback
  const callback = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  };

  // Create observer
  const observer = new IntersectionObserver(callback, options);

  // Observe elements
  animateElements.forEach(element => {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(element);
  });
});
```

**Step 2: Commit animations script**

```bash
git add static/js/animations.js
git commit -m "feat: add fade-in scroll animations with Intersection Observer"
```

---

## Phase 4: Content Migration

### Task 28: Move Profile Image

**Files:**
- Move: `assets/images/profile.jpg` → `static/images/profile.jpg`

**Step 1: Move profile image**

```bash
cp assets/images/profile.jpg static/images/profile.jpg
```

**Step 2: Verify image exists**

```bash
ls -lh static/images/profile.jpg
```

Expected: File exists and shows size

**Step 3: Commit profile image**

```bash
git add static/images/profile.jpg
git commit -m "feat: add profile image to static directory"
```

---

### Task 29: Move Blog Post Images

**Files:**
- Move: `assets/images/` → `static/images/`

**Step 1: Copy all blog post images**

```bash
# Create directories
mkdir -p static/images/ara static/images/broom static/images/fpaste-cli

# Copy images (adjust paths as needed for all image directories)
find assets/images -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" \) ! -path "*/comics/*" -exec sh -c '
  for file; do
    relative_path="${file#assets/images/}"
    target="static/images/$relative_path"
    mkdir -p "$(dirname "$target")"
    cp "$file" "$target"
  done
' sh {} +
```

**Step 2: Verify images copied**

```bash
find static/images -type f | wc -l
```

Expected: Shows count of copied images

**Step 3: Commit blog images**

```bash
git add static/images
git commit -m "feat: migrate blog post images to static directory"
```

---

### Task 30: Move Comics Images

**Files:**
- Move: `assets/images/comics/` → `static/images/comics/`

**Step 1: Copy comics images**

```bash
mkdir -p static/images/comics
cp assets/images/comics/*.jpg static/images/comics/
```

**Step 2: Verify comics images**

```bash
ls static/images/comics/ | wc -l
```

Expected: Shows count of comic images

**Step 3: Commit comics images**

```bash
git add static/images/comics
git commit -m "feat: migrate comics images to static directory"
```

---

### Task 31: Create Blog Post Migration Script

**Files:**
- Create: `scripts/migrate-posts.sh`

**Step 1: Create migration script**

```bash
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
```

**Step 2: Make script executable**

```bash
chmod +x scripts/migrate-posts.sh
```

**Step 3: Commit migration script**

```bash
git add scripts/migrate-posts.sh
git commit -m "feat: add blog post migration script"
```

---

### Task 32: Run Blog Post Migration

**Step 1: Create content/blog directory**

```bash
mkdir -p content/blog
```

**Step 2: Run migration script**

```bash
./scripts/migrate-posts.sh
```

Expected: Output shows each migrated post

**Step 3: Verify migration**

```bash
ls content/blog/*.md | wc -l
```

Expected: Shows count matching blog/_posts/

**Step 4: Spot-check a migrated post**

```bash
head -20 content/blog/2017-03-04-fpaste-cli.md
```

Expected: Front matter looks correct (no category, has tags:, no layout)

**Step 5: Commit migrated blog posts**

```bash
git add content/blog
git commit -m "feat: migrate all blog posts to Hugo format"
```

---

### Task 33: Create Comics Post Migration Script

**Files:**
- Create: `scripts/migrate-comics.sh`

**Step 1: Create comics migration script**

```bash
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
```

**Step 2: Make script executable**

```bash
chmod +x scripts/migrate-comics.sh
```

**Step 3: Commit comics migration script**

```bash
git add scripts/migrate-comics.sh
git commit -m "feat: add comics post migration script"
```

---

### Task 34: Run Comics Post Migration

**Step 1: Create content/comics directory**

```bash
mkdir -p content/comics
```

**Step 2: Run migration script**

```bash
./scripts/migrate-comics.sh
```

Expected: Output shows each migrated comic

**Step 3: Verify migration**

```bash
ls content/comics/*.md | wc -l
```

Expected: Shows count matching comics/_posts/

**Step 4: Spot-check a migrated comic**

```bash
cat content/comics/2017-11-16-good-ideas.md
```

Expected: Front matter correct, image path updated

**Step 5: Commit migrated comics**

```bash
git add content/comics
git commit -m "feat: migrate all comics posts to Hugo format"
```

---

## Phase 5: GitHub Actions Deployment

### Task 35: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/hugo.yml`

**Step 1: Create workflow file**

```yaml
name: Deploy Hugo site to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

defaults:
  run:
    shell: bash

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      HUGO_VERSION: 0.121.0
    steps:
      - name: Install Hugo CLI
        run: |
          wget -O ${{ runner.temp }}/hugo.deb https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.deb \
          && sudo dpkg -i ${{ runner.temp }}/hugo.deb

      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive
          fetch-depth: 0

      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v4

      - name: Build with Hugo
        env:
          HUGO_ENVIRONMENT: production
          HUGO_ENV: production
        run: |
          hugo \
            --minify \
            --baseURL "${{ steps.pages.outputs.base_url }}/"

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Commit workflow**

```bash
git add .github/workflows/hugo.yml
git commit -m "feat: add GitHub Actions workflow for Hugo deployment"
```

---

### Task 36: Update .nojekyll File

**Files:**
- Verify: `.nojekyll` exists

**Step 1: Check if .nojekyll exists**

```bash
ls -la .nojekyll
```

Expected: File exists (already there from Jekyll)

**Step 2: If not exists, create it**

```bash
touch .nojekyll
git add .nojekyll
git commit -m "feat: add .nojekyll to disable Jekyll processing"
```

Note: File likely already exists, no commit needed

---

## Phase 6: Testing & Verification

### Task 37: Test Local Hugo Build

**Step 1: Run Hugo build**

```bash
hugo
```

Expected: Build completes successfully, shows stats

**Step 2: Check for errors**

Review output for any errors or warnings

Expected: No errors, maybe some warnings about missing templates

**Step 3: Check generated files**

```bash
ls -la public/
ls public/blog/
ls public/comics/
```

Expected: Directories exist with HTML files

**Step 4: If successful, commit any fixes made**

```bash
git add .
git commit -m "fix: resolve any build issues found during testing"
```

---

### Task 38: Test Local Hugo Server

**Step 1: Start Hugo server**

```bash
hugo server -D
```

Expected: Server starts at http://localhost:1313

**Step 2: Open browser and test**

Manual testing checklist:
- [ ] Home page loads
- [ ] Blog section loads with posts
- [ ] Comics section loads with comics
- [ ] Individual blog post loads
- [ ] Individual comic loads
- [ ] Tags page loads
- [ ] Click on a tag, see posts
- [ ] Next/previous navigation works
- [ ] Related posts show up
- [ ] Social links work
- [ ] Images load correctly
- [ ] Mobile responsive (resize browser)
- [ ] Dark mode (if system set to dark)

**Step 3: Stop server**

Press `Ctrl+C`

**Step 4: Document any issues found**

Create issues list if needed, fix in follow-up tasks

---

### Task 39: Clean Up Old Jekyll Files

**Files:**
- Remove: `_config.yml`, `_config-dev.yml`
- Remove: `_includes/`, `_layouts/`, `_sass/`, `_plugins/`
- Remove: `blog/`, `comics/` (old directories)
- Remove: `Gemfile`, `Rakefile`, `Makefile`
- Remove: `feed.xml`, `tags.html`, `index.html`

**Step 1: Remove Jekyll config files**

```bash
git rm _config.yml _config-dev.yml Gemfile Rakefile Makefile feed.xml tags.html index.html
```

**Step 2: Remove Jekyll directories**

```bash
git rm -r _includes _layouts _sass _plugins blog comics
```

**Step 3: Commit cleanup**

```bash
git commit -m "chore: remove Jekyll files and directories

Complete migration to Hugo - removed:
- Jekyll configuration files
- Jekyll templates and partials
- SCSS files
- Jekyll plugins
- Old content directories
- Old index and feed files"
```

---

### Task 40: Update README

**Files:**
- Modify: `README.md` (if exists) or Create: `README.md`

**Step 1: Create/update README**

```markdown
# sebiwi.github.io

Personal blog and comics built with [Hugo](https://gohugo.io/).

## Development

### Prerequisites

- [Hugo Extended](https://gohugo.io/installation/) v0.121.0 or later

### Local Development

```bash
# Start development server
hugo server -D

# Build site
hugo

# Build with minification (production)
hugo --minify
```

Visit http://localhost:1313

## Deployment

Site automatically deploys to GitHub Pages via GitHub Actions when pushing to `main` branch.

## Content Structure

- `content/blog/` - Blog posts
- `content/comics/` - Comics
- `static/images/` - All images
- `static/css/` - Styles
- `layouts/` - Hugo templates

## License

See LICENSE file.
```

**Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: update README for Hugo setup"
```

---

## Final Steps

### Task 41: Final Verification

**Step 1: Build site one more time**

```bash
hugo --minify
```

Expected: Clean build, no errors

**Step 2: Check RSS feeds**

```bash
ls public/index.xml public/blog/index.xml public/comics/index.xml
```

Expected: All RSS files exist

**Step 3: Verify permalinks match old structure**

```bash
# Check a blog post URL
ls public/blog/fpaste-cli/index.html

# Check a comic URL
ls public/comics/good-ideas/index.html
```

Expected: URLs match Jekyll structure (no dates in path)

**Step 4: Check image paths**

```bash
grep -r "/assets/images/" content/
```

Expected: No results (all paths updated to /images/)

---

### Task 42: Create Git Tag

**Step 1: Tag the migration**

```bash
git tag -a v2.0.0 -m "Hugo migration complete

- Migrated from Jekyll to Hugo
- Replaced SCSS with vanilla CSS
- Removed Disqus
- Added modern features (RSS, Open Graph, accessibility)
- GitHub Actions deployment"
```

**Step 2: Verify tag**

```bash
git tag -l
```

Expected: Shows v2.0.0

---

## Deployment Instructions

### Task 43: Configure GitHub Pages

**Manual steps (cannot be automated):**

1. Push the `main` branch to GitHub: `git push origin main`
2. Go to repository Settings > Pages
3. Under "Build and deployment":
   - Source: "GitHub Actions"
   - Save
4. Wait for Actions workflow to complete
5. Visit https://sebiwi.github.io to verify

**Verification checklist:**
- [ ] Site loads
- [ ] Blog posts visible
- [ ] Comics visible
- [ ] Navigation works
- [ ] Images load
- [ ] RSS feeds accessible
- [ ] Mobile responsive

---

## Success Criteria

✅ All blog posts migrated with correct front matter
✅ All comics migrated with correct front matter and images
✅ All images moved to static/ and paths updated
✅ URLs match old Jekyll structure (no broken links)
✅ Tags work correctly
✅ Related posts display
✅ Next/previous navigation works within sections
✅ Read time calculated
✅ Author info displays
✅ Social links work
✅ RSS feeds generated
✅ Open Graph tags present
✅ Mobile responsive
✅ Dark mode supported
✅ GitHub Actions deployment working
✅ Site accessible at sebiwi.github.io

---

## Rollback Plan

If issues occur:

```bash
# Switch back to source branch
git checkout source

# Verify old Jekyll site still works
bundle install
bundle exec jekyll serve

# If needed, force push source to main
git push origin source:main --force
```

**Note:** Keep `source` branch intact until new Hugo site is verified working in production for at least 1 week.

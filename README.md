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

Site automatically deploys to GitHub Pages via GitHub Actions when pushing to `master` branch.

## Content Structure

- `content/blog/` - Blog posts
- `content/comics/` - Comics
- `static/images/` - All images
- `static/css/` - Styles
- `layouts/` - Hugo templates

## License

See LICENSE file.

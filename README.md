# sebiwi.github.io

This is my website. Built with [Hugo](https://gohugo.io/). Heavily based on Sergio Kopplin's [indigo](https://github.com/sergiokopplin/indigo) theme.

## Development

### Prerequisites

- [Hugo Extended](https://gohugo.io/installation/) v0.152.2 or later
- [lychee](https://github.com/lycheeverse/lychee) (optional, for link checking)

### Local Development

```bash
# Start development server
hugo server -D

# Build site
hugo

# Build with minification (production)
hugo --minify

# Run tests
./test.sh
```

Visit <http://localhost:1313>

## Deployment

Site automatically deploys to GitHub Pages via GitHub Actions when pushing to the `main` branch.

The workflow:

1. Runs tests (build validation, asset checks, link checking)
2. Builds site with Hugo --minify
3. Deploys via GitHub Pages

## Content Structure

```
content/
├── blog/      # Blog posts
└── comics/    # Comics

assets/
├── css/       # Stylesheets (processed by Hugo pipeline)
└── js/        # JavaScript (processed by Hugo pipeline)

static/
└── images/    # Images (served as-is)

layouts/       # Hugo templates
```

## Performance

The site is optimized for speed:

- All CSS/JS minified and fingerprinted
- Subresource Integrity (SRI) enabled
- Deferred JavaScript loading
- ~27 KB initial page load
- Comprehensive link validation (2,029+ links checked)

## Testing

Run the test suite with:

```bash
./test.sh
```

Tests include:

- Build validation
- Critical file verification
- Asset minification/fingerprinting checks
- Link validation with lychee

## License

See LICENSE file.

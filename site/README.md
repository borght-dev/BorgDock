# BorgDock — Marketing site

Astro + React site for [BorgDock](https://borgdock.dev). Static-generated,
mostly zero-JS: React components are prerendered on the server and only the
theme toggle ships as an interactive island.

## Stack

- [Astro 5](https://astro.build) — pages, layouts, static generation
- [React 18](https://react.dev) — product-UI mockup components (SSR-only)
- [TypeScript](https://www.typescriptlang.org) (strict)

## Structure

```
src/
├── components/
│   ├── sections/    # Page sections (Hero, FocusFeature, …) — React, SSR-only
│   ├── screens/     # Product UI mockups (FocusSidebar, DiffViewer, …)
│   ├── ui/          # Atoms + primitives (StatusDot, PrCard, Pill, …)
│   ├── SiteNav.astro
│   ├── SiteFooter.astro
│   └── ThemeToggle.tsx  # The one hydrated island (client:load)
├── layouts/
│   └── Layout.astro  # <head>, fonts, theme-persist script, global CSS
├── pages/
│   ├── index.astro
│   ├── features.astro
│   ├── gallery.astro
│   ├── changelog.astro
│   └── download.astro
└── styles/
    ├── tokens.css   # Design tokens (dark + light)
    └── global.css   # Layout primitives + responsive rules
```

## Design tokens

`src/styles/tokens.css` is the single source of truth for colours, typography,
radii, spacing, and motion. Everything else references CSS custom properties
from that file. Extracted from the BorgDock Tauri app's own `DESIGN-SYSTEM.md`
so the site and the app feel like one product.

## Responsive strategy

The product mockups are intentionally desktop-shaped (an app sidebar is
440 px wide, a diff viewer is 1180 px). On narrow viewports the surrounding
page grid stacks, and each mockup is wrapped in a horizontally-scrollable
container at its natural desktop size — honest about what it is, legible at
any width. See `.mockup-scroll` in `src/styles/global.css`.

## Development

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # → dist/  (type-checks, then builds)
npm run preview   # preview the production build
```

## Deploy

The build output in `dist/` is a plain static site — ready for Cloudflare
Pages, Netlify, Vercel, GitHub Pages, or any static host. No server required.

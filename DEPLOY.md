# NEAGLE GOLF — Static Site (SSG) & Cloudflare Pages Deployment

This folder now contains a **multi-page static site** generated from the original
single-file SPA (`index.html`) for better SEO / GEO.

## Project layout

```
website/
├── index.html        # original SPA (kept as source of truth for data/styles)
├── build.mjs         # Static Site Generator — reads index.html & emits ./dist
├── wrangler.toml     # Cloudflare Pages config (build command + output)
├── dist/             # ← generated static site (deploy THIS folder)
│   ├── index.html
│   ├── golf-simulators/
│   │   ├── index.html
│   │   ├── golfpai-s1/index.html
│   │   ├── golfpai-a1/index.html
│   │   ├── golfpai-x1/index.html
│   │   ├── rg-ruge/index.html
│   │   └── faya-motion/index.html
│   ├── golf-ball-dispensers/
│   │   ├── index.html
│   │   ├── dispenser-machine/index.html
│   │   └── vending-machine/index.html
│   ├── catalog/index.html
│   ├── case-studies/index.html
│   ├── about/index.html
│   ├── 404.html
│   ├── sitemap.xml
│   └── robots.txt
└── DEPLOY.md
```

## Build locally

```bash
node build.mjs      # regenerates ./dist
```

The generator reuses `index.html`'s `<head>` (Tailwind CDN, fonts, all CSS) and
extracts the real product/case data, then renders each page as **server-side HTML**
with unique `<title>`, `meta description`, Open Graph tags, and JSON-LD
(`Product` + `BreadcrumbList` on product pages, `Organization`/`WebSite` sitewide).

## Deploy to Cloudflare Pages

### Option A — Git integration (recommended)
1. Push this `website/` folder to a GitHub/GitLab repo.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → connect repo.
3. Set:
   - **Build command:** `node build.mjs`
   - **Build output directory:** `dist`
4. Deploy. You get a `*.pages.dev` preview URL.

### Option B — Wrangler CLI
```bash
npx wrangler pages deploy dist
```

### Bind the production domain (neaglegolf.com)
1. Buy `neaglegolf.com` (recommended: Cloudflare Registrar) and add it as a site in Cloudflare.
2. In the Pages project → **Custom domains** → add `neaglegolf.com` and `www.neaglegolf.com`.
3. Cloudflare auto-issues a **free Universal SSL** certificate → HTTPS works automatically.
4. Set **SSL/TLS** mode to **Full (strict)**; enable **Always Use HTTPS**.

> Note: product images currently use `*.r2.dev` dev URLs. For production, bind a
> custom R2 domain (e.g. `cdn.neaglegolf.com`) and update `image` URLs in
> `index.html`'s `catalogDb` before rebuilding.

## Post-deploy SEO checklist
- [ ] Submit `https://www.neaglegolf.com/sitemap.xml` to Google Search Console & Bing Webmaster.
- [ ] Verify pages in Rich Results Test (Product schema).
- [ ] Monitor GSC "Indexing" + "Core Web Vitals".
- [ ] Keep `canonical` / OG URL consistent with the chosen apex (www vs bare).

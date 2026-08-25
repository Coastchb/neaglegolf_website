/**
 * NEAGLE GOLF — Static Site Generator (SSG)
 * --------------------------------------------------------------
 * Turns the single-file SPA (index.html) into a multi-page static
 * site optimized for SEO / GEO. Output goes to ./dist and is ready
 * to deploy on Cloudflare Pages.
 *
 * Run:  node build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, 'index.html');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.neaglegolf.com';

/* ── 1. Load source & extract pieces ───────────────────────────── */
const html = fs.readFileSync(SRC, 'utf-8');

// 1a. <head>...</head> (keeps Tailwind CDN, fonts, all CSS, base SEO)
const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
if (!headMatch) throw new Error('Cannot find <head> in index.html');
let head = headMatch[1];

// 1b. Extract catalogDb + caseStudies data via vm sandbox
const catalogSnip = html.match(/const catalogDb\s*=\s*(\{[\s\S]*?\n        \};)/);
const casesSnip = html.match(/const caseStudies\s*=\s*(\[[\s\S]*?\n        \];)/);
if (!catalogSnip || !casesSnip) throw new Error('Cannot extract data arrays');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`var catalogDb = ${catalogSnip[1]}; var caseStudies = ${casesSnip[1]};`, sandbox);
const catalogDb = sandbox.catalogDb;
const caseStudies = sandbox.caseStudies;

// 1c. Extract footer markup from the <template>
const footerMatch = html.match(/<template id="global-footer-template">([\s\S]*?)<\/template>/);
const footerInner = footerMatch ? footerMatch[1] : '';

/* ── 2. Helpers ────────────────────────────────────────────────── */
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (s = '') => s; // already formatted

// Map category id -> clean URL segment
const CAT_URL = { simulators: 'golf-simulators', dispenserMachines: 'golf-ball-dispensers' };
const catLink = (catId) => `/${CAT_URL[catId]}/`;
const prodLink = (catId, p) => `/${CAT_URL[catId]}/${p.id}/`;

/* ── 3. Page chrome (static nav + footer) ─────────────────────── */
function nav(active = '') {
  const item = (href, label, key) => {
    const cls = key === active
      ? 'text-golfGreen font-semibold'
      : 'text-white/80 hover:text-golfGreen transition-colors';
    return `<a href="${href}" class="${cls}">${label}</a>`;
  };
  return `
    <nav class="fixed top-0 left-0 w-full z-50 bg-black/85 backdrop-blur-md border-b border-white/10 h-12 flex items-center justify-between px-4 md:px-12 select-none">
        <a href="/" class="text-white hover:opacity-80 transition-opacity text-base md:text-lg tracking-wider font-semibold py-2">
            NEAGLE <span class="text-golfGreen">GOLF</span>
        </a>
        <div class="hidden lg:flex items-center space-x-6 text-xs">
            ${item('/golf-simulators/', 'Golf Simulators', 'simulators')}
            ${item('/golf-ball-dispensers/', 'Dispensers', 'dispenserMachines')}
            ${item('/case-studies/', 'Case Studies')}
            ${item('/about/', 'About')}
            <span class="text-white/30">|</span>
            <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="flex items-center space-x-1 text-white hover:text-golfGreen transition-colors">
                <i class="fa-brands fa-whatsapp text-base"></i><span>WhatsApp</span>
            </a>
            <a href="mailto:service@neaglegolf.com" class="flex items-center space-x-1 text-white hover:text-golfGreen transition-colors">
                <i class="fa-solid fa-envelope text-xs"></i><span>Email</span>
            </a>
        </div>
        <div class="lg:hidden flex items-center space-x-4 text-xs">
            <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="text-white hover:text-golfGreen"><i class="fa-brands fa-whatsapp text-base"></i></a>
            <a href="/case-studies/" class="text-white/80 hover:text-golfGreen">Cases</a>
            <a href="/about/" class="text-white/80 hover:text-golfGreen">About</a>
            <a href="/golf-simulators/" class="text-white/80 hover:text-golfGreen">Shop</a>
        </div>
    </nav>`;
}

function footer() {
  return `<footer class="py-12 border-t border-white/5 bg-black text-xs text-zinc-400 px-4 md:px-12 mt-24">
            <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-8">
                <div class="space-y-2 max-w-sm">
                    <span class="text-base font-bold text-white tracking-widest font-luxury uppercase">NEAGLE <span class="text-golfGreen">GOLF</span></span>
                    <p class="leading-relaxed">Tour-grade golf simulators, launch monitors, and automated ball dispensing systems for clubs, ranges, and home studios worldwide.</p>
                </div>
                <div class="space-y-3">
                    <span class="text-xs font-semibold text-white tracking-wider block uppercase">Direct Concierge Contact</span>
                    <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="text-zinc-200 hover:text-golfGreen transition-colors flex items-center gap-1.5">
                        <i class="fa-brands fa-whatsapp text-golfGreen"></i> +1 (314) 224-2264
                    </a>
                    <a href="mailto:service@neaglegolf.com" class="text-zinc-200 hover:text-golfGreen transition-colors flex items-center gap-1.5">
                        <i class="fa-solid fa-envelope text-golfGreen"></i> service@neaglegolf.com
                    </a>
                </div>
                <div class="space-y-2">
                    <span class="text-xs font-semibold text-white tracking-wider block uppercase">Explore</span>
                    <a href="/golf-simulators/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Golf Simulators</a>
                    <a href="/golf-ball-dispensers/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Ball Dispensers</a>
                    <a href="/case-studies/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Case Studies</a>
                    <a href="/about/" class="block text-zinc-200 hover:text-golfGreen transition-colors">About NEAGLE</a>
                </div>
            </div>
            <div class="max-w-7xl mx-auto pt-8 mt-8 border-t border-white/5 text-zinc-600 text-[11px]">
                © ${new Date().getFullYear()} NEAGLE GOLF. All rights reserved.
            </div>
        </footer>`;
}

/* ── 4. Page wrapper ───────────────────────────────────────────── */
function page({ title, description, extraHead = '', bodyClass = '', main, navActive = '' }) {
  // Replace base title/description/OG in head with page-specific values
  let h = head
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${esc(description)}">`)
    .replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(description)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(description)}">`);
  h += extraHead;
  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
${h}
<body class="overflow-x-hidden font-sans h-full flex flex-col bg-black text-white">
${nav(navActive)}
<main class="flex-1 pt-12 safe-pt">
${main}
</main>
${footer()}
</body>
</html>`;
}

/* ── 5. Reusable content blocks ───────────────────────────────── */
function breadcrumb(trail) {
  const parts = trail.map((t, i) =>
    i === trail.length - 1
      ? `<span class="text-white font-medium">${esc(t.label)}</span>`
      : `<a href="${t.href}" class="hover:text-white transition-colors">${esc(t.label)}</a>`
  ).join(` <i class="fa-solid fa-chevron-right text-[7px] text-zinc-600"></i> `);
  return `<div class="max-w-7xl mx-auto px-4 md:px-6 pt-4 text-[11px] md:text-xs text-zinc-500 flex items-center gap-2">${parts}</div>`;
}

function productCard(catId, p) {
  return `<a href="${prodLink(catId, p)}" class="card-glow group block rounded-3xl overflow-hidden bg-zinc-950/60 border border-white/8 p-5 hover:border-golfGreen/40 transition-all">
      <div class="aspect-[4/3] rounded-2xl overflow-hidden mb-4 bg-zinc-900">
        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
      </div>
      <h3 class="text-lg font-semibold text-white mb-1">${esc(p.name)}</h3>
      <p class="text-zinc-400 text-sm line-clamp-2 mb-3">${esc(p.tagline)}</p>
      <span class="text-golfGreen text-sm font-semibold">${esc(p.price)}</span>
    </a>`;
}

/* ── 6. Page builders ─────────────────────────────────────────── */
const pages = [];
const sitemapUrls = [];

function addPage(relPath, opts) {
  pages.push({ relPath, opts });
  sitemapUrls.push(SITE + (relPath === 'index.html' ? '/' : '/' + relPath.replace(/index\.html$/, '')));
}

/* 6a. HOME */
addPage('index.html', {
  title: 'NEAGLE GOLF — Golf Simulators, Launch Monitors & Ball Dispensers',
  description: 'NEAGLE GOLF designs tour-grade golf simulators, launch monitors, 4K golf simulation systems, and automated ball dispensing machines for clubs, ranges, and home studios.',
  navActive: '',
  main: `
  <header class="hero-glow relative overflow-hidden">
    <div class="absolute inset-0 tech-grid pointer-events-none"></div>
    <div class="absolute -top-24 -right-16 w-80 h-80 rounded-full float-orb pointer-events-none" style="background: radial-gradient(circle, rgba(0,230,118,0.22), transparent 65%);"></div>
    <div class="relative max-w-7xl mx-auto px-5 md:px-12 pt-20 md:pt-28 pb-16 md:pb-24 text-center">
      <span class="reveal inline-flex items-center gap-2 text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen glass rounded-full px-4 py-1.5 mb-6">
        <i class="fa-solid fa-microchip"></i> Next-Gen Golf Technology
      </span>
      <h1 class="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6">
        <span class="text-gradient">Precision Golf</span><br>
        <span class="text-gradient-cyan">Simulation, Redefined</span>
      </h1>
      <p class="mx-auto max-w-2xl text-base md:text-lg text-zinc-400 leading-relaxed mb-9">
        Tour-grade launch monitors, immersive simulators, and fully automated dispensing systems — engineered for clubs, venues, and serious players who demand the best.
      </p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a href="/golf-simulators/" class="btn-glow rounded-full px-8 py-3.5 text-sm md:text-base font-semibold tracking-wide flex items-center justify-center gap-2">
          Explore Simulators <i class="fa-solid fa-arrow-right"></i>
        </a>
        <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-ghost rounded-full px-8 py-3.5 text-sm md:text-base font-semibold tracking-wide flex items-center justify-center gap-2">
          <i class="fa-brands fa-whatsapp text-golfGreen"></i> Talk to an Expert
        </a>
      </div>
      <div class="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden glass max-w-4xl mx-auto">
        <div class="px-4 py-6 text-center bg-black/30"><div class="text-2xl md:text-3xl font-bold text-white">99.9%</div><div class="text-[11px] md:text-xs text-zinc-500 mt-1 uppercase tracking-wider">Shot Accuracy</div></div>
        <div class="px-4 py-6 text-center bg-black/30"><div class="text-2xl md:text-3xl font-bold text-white">4K+</div><div class="text-[11px] md:text-xs text-zinc-500 mt-1 uppercase tracking-wider">Visual Clarity</div></div>
        <div class="px-4 py-6 text-center bg-black/30"><div class="text-2xl md:text-3xl font-bold text-white">200+</div><div class="text-[11px] md:text-xs text-zinc-500 mt-1 uppercase tracking-wider">Global Installations</div></div>
        <div class="px-4 py-6 text-center bg-black/30"><div class="text-2xl md:text-3xl font-bold text-white">24/7</div><div class="text-[11px] md:text-xs text-zinc-500 mt-1 uppercase tracking-wider">Concierge Support</div></div>
      </div>
    </div>
  </header>

  <section class="max-w-4xl mx-auto px-4 md:px-6 pt-16 md:pt-24">
    <div class="text-center mb-10"><span class="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen">What We Do</span>
      <h2 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight">One Partner for Golf Simulation &amp; Automation</h2></div>
    <div class="space-y-5 text-zinc-400 text-sm md:text-base leading-relaxed">
      <p><strong class="text-white font-semibold">NEAGLE GOLF</strong> is a global provider of <em class="text-zinc-200">tour-grade golf simulators, launch monitors, and 4K golf simulation systems</em> for indoor golf studios, commercial driving ranges, clubs, and private homes. Our simulation packages combine high-speed camera and radar tracking with photoreal course rendering, delivering shot data accurate enough for professional fitting and training.</p>
      <p>Beyond simulation, we engineer <em class="text-zinc-200">automated golf ball dispensers</em> and self-service range hardware that reduce labor costs and unlock new revenue for facility operators. Every system ships with white-glove onboarding, training, and 24/7 concierge support.</p>
      <div class="glass rounded-2xl p-6 md:p-8">
        <h3 class="text-white font-semibold text-lg mb-4">Frequently Asked Questions</h3>
        <div class="space-y-4">
          <div><p class="text-white font-medium">What is the best golf simulator for a commercial range?</p><p class="mt-1">A ceiling or overhead launch-monitor system with multi-surface tracking, 4K projection, and durable enclosure — exactly what NEAGLE GOLF deploys for clubs and venues worldwide.</p></div>
          <div><p class="text-white font-medium">Do you supply automated ball dispensers?</p><p class="mt-1">Yes. Our dispensing machines support cashless, self-service operation and integrate with range management software for 24/7 commercial use.</p></div>
          <div><p class="text-white font-medium">Where do you ship?</p><p class="mt-1">NEAGLE GOLF serves clubs, ranges, and home studios worldwide, with dedicated concierge support in every region.</p></div>
        </div>
      </div>
    </div>
  </section>

  <section class="max-w-7xl mx-auto px-4 md:px-6 pt-20 md:pt-28">
    <div class="text-center max-w-2xl mx-auto mb-12"><span class="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen">Engineered to Perform</span>
      <h2 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight">A Smarter Way to Play &amp; Operate</h2></div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
      ${[
        ['fa-crosshairs','Tour-Grade Accuracy','Sub-millimeter launch monitors capture every angle, spin, and speed for data you can trust.','golfGreen'],
        ['fa-cube','Immersive 4K Simulation','Ultra-HD projection and lifelike physics transport you to the world\'s greatest courses.','sky-400'],
        ['fa-robot','Fully Automated','Self-service ball dispensing and cashless management reduce labor and boost revenue.','golfGreen'],
        ['fa-chart-line','Real-Time Analytics','Live reporting and player insights for clubs, ranges, and training academies.','sky-400'],
        ['fa-shield-halved','Enterprise Reliability','Rugged, weather-resistant builds engineered for 24/7 commercial operation.','golfGreen'],
        ['fa-headset','White-Glove Support','Dedicated concierge onboarding, training, and round-the-clock assistance.','sky-400'],
      ].map(([ic,t,d,c]) => `
        <div class="glass rounded-2xl p-6 md:p-7">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center text-${c} mb-5" style="background:rgba(0,230,118,0.1);border:1px solid rgba(0,230,118,0.25);"><i class="fa-solid ${ic} text-xl"></i></div>
          <h3 class="text-lg font-semibold text-white mb-2">${t}</h3><p class="text-zinc-400 text-sm leading-relaxed">${d}</p>
        </div>`).join('')}
    </div>
  </section>

  <section class="max-w-7xl mx-auto px-4 md:px-6 pt-20 md:pt-28">
    <h2 class="text-3xl md:text-4xl font-bold tracking-tight mb-8">Featured Products</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
      ${catalogDb.simulators.items.slice(0,3).map(p => productCard('simulators', p)).join('')}
      ${catalogDb.dispenserMachines.items.map(p => productCard('dispenserMachines', p)).join('')}
    </div>
    <div class="mt-10"><a href="/golf-simulators/" class="btn-ghost rounded-full px-8 py-3.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-solid fa-arrow-right"></i> Browse Complete Catalog</a></div>
  </section>

  <section class="max-w-7xl mx-auto px-4 md:px-6 pt-20 md:pt-28 pb-4">
    <div class="relative overflow-hidden rounded-3xl hero-glow border border-white/10 px-6 md:px-16 py-14 md:py-20 text-center">
      <div class="absolute inset-0 tech-grid pointer-events-none opacity-60"></div>
      <div class="relative">
        <span class="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen">Ready When You Are</span>
        <h2 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">Build Your Dream Golf Experience</h2>
        <p class="mt-4 text-zinc-400 text-sm md:text-base max-w-xl mx-auto">From a single simulator to a fully automated facility — our concierge team will tailor the perfect setup for you.</p>
        <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow rounded-full px-8 py-3.5 text-sm md:text-base font-semibold inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp</a>
          <a href="mailto:service@neaglegolf.com" class="btn-ghost rounded-full px-8 py-3.5 text-sm md:text-base font-semibold inline-flex items-center gap-2"><i class="fa-solid fa-envelope text-golfGreen"></i> Email Our Team</a>
        </div>
      </div>
    </div>
  </section>`
});

/* 6b. CATEGORY pages */
for (const catId of Object.keys(catalogDb)) {
  const cat = catalogDb[catId];
  const cards = cat.items.map(p => productCard(catId, p)).join('');
  addPage(CAT_URL[catId] + '/index.html', {
    title: `${cat.title} | NEAGLE GOLF`,
    description: cat.desc,
    navActive: catId,
    main: `
    ${breadcrumb([{ label: 'Home', href: '/' }, { label: cat.title }])}
    <section class="max-w-7xl mx-auto px-4 md:px-6 pt-10">
      <h1 class="text-3xl md:text-5xl font-bold tracking-tight mb-3">${esc(cat.title)}</h1>
      <p class="text-zinc-400 max-w-2xl mb-10">${esc(cat.desc)}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">${cards}</div>
    </section>`
  });
}

/* 6c. PRODUCT pages (with Product + BreadcrumbList Schema) */
for (const catId of Object.keys(catalogDb)) {
  const cat = catalogDb[catId];
  for (const p of cat.items) {
    const specsRows = Object.entries(p.specs || {}).map(([k, v]) =>
      `<tr class="border-b border-white/5"><th class="text-left py-3 pr-4 text-zinc-300 font-medium align-top">${esc(k)}</th><td class="py-3 text-zinc-400">${esc(v)}</td></tr>`).join('');
    const highlights = (p.highlights || []).map(h => `<li class="flex gap-2 text-zinc-300"><i class="fa-solid fa-circle-check text-golfGreen mt-1 text-sm"></i><span>${esc(h)}</span></li>`).join('');
    const useCases = (p.useCases || []).map(u => `<span class="text-xs px-3 py-1 rounded-full bg-white/5 text-zinc-300 border border-white/10">${esc(u)}</span>`).join(' ');
    const gallery = (p.images || [p.image]).slice(0, 4).map(src =>
      `<div class="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900"><img src="${src}" alt="${esc(p.name)}" loading="lazy" class="w-full h-full object-cover hover:scale-105 transition-transform"></div>`).join('');
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: p.tagline,
      image: p.images || [p.image],
      brand: { '@type': 'Brand', name: 'NEAGLE GOLF' },
      offers: { '@type': 'Offer', price: p.price.replace(/[^0-9.]/g, ''), priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
      category: cat.title
    };
    const breadcrumbSchema = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: cat.title, item: SITE + catLink(catId) },
        { '@type': 'ListItem', position: 3, name: p.name, item: SITE + prodLink(catId, p) }
      ]
    };
    addPage(CAT_URL[catId] + '/' + p.id + '/index.html', {
      title: `${p.name} | NEAGLE GOLF`,
      description: p.tagline,
      navActive: catId,
      extraHead: `<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`,
      main: `
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: cat.title, href: catLink(catId) }, { label: p.name }])}
      <section class="max-w-7xl mx-auto px-4 md:px-6 pt-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          <div class="aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-900 mb-4"><img src="${p.image}" alt="${esc(p.name)}" class="w-full h-full object-cover"></div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${gallery}</div>
        </div>
        <div>
          <span class="text-[11px] uppercase tracking-widest text-golfGreen font-semibold">${esc(cat.title)}</span>
          <h1 class="text-3xl md:text-4xl font-bold tracking-tight mt-2 mb-3">${esc(p.name)}</h1>
          <p class="text-zinc-400 leading-relaxed mb-5">${esc(p.tagline)}</p>
          <div class="text-2xl font-bold text-golfGreen mb-6">${esc(p.price)}</div>
          <div class="flex flex-wrap gap-3 mb-8">${useCases}</div>
          <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow rounded-full px-8 py-3.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Get a Quote on WhatsApp</a>
          <div class="mt-10">
            <h2 class="text-xl font-bold text-white mb-4">Key Highlights</h2>
            <ul class="space-y-3">${highlights}</ul>
          </div>
        </div>
      </section>
      <section class="max-w-7xl mx-auto px-4 md:px-6 pt-12">
        <h2 class="text-2xl font-bold text-white mb-5">Specifications</h2>
        <table class="w-full text-sm border border-white/5 rounded-2xl overflow-hidden">${specsRows}</table>
      </section>
      <section class="max-w-7xl mx-auto px-4 md:px-6 pt-16 pb-4">
        <h2 class="text-2xl font-bold text-white mb-6">More from ${esc(cat.title)}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          ${cat.items.filter(x => x.id !== p.id).slice(0, 3).map(x => productCard(catId, x)).join('')}
        </div>
      </section>`
    });
  }
}

/* 6d. CATALOG (all products) */
const allCards = Object.keys(catalogDb).flatMap(catId => catalogDb[catId].items.map(p => productCard(catId, p))).join('');
addPage('catalog/index.html', {
  title: 'Complete Golf Product Catalog | NEAGLE GOLF',
  description: 'Browse the full NEAGLE GOLF catalog of golf simulators, launch monitors, and automated ball dispensing systems.',
  main: `
  ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Catalog' }])}
  <section class="max-w-7xl mx-auto px-4 md:px-6 pt-10">
    <h1 class="text-3xl md:text-5xl font-bold tracking-tight mb-3">Complete Catalog</h1>
    <p class="text-zinc-400 max-w-2xl mb-10">Every NEAGLE GOLF simulator and dispensing system, in one place.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">${allCards}</div>
  </section>`
});

/* 6e. CASE STUDIES */
const caseCards = caseStudies.map(c => `
  <div class="card-glow rounded-3xl overflow-hidden bg-zinc-950/60 border border-white/8 p-5">
    <div class="aspect-[16/9] rounded-2xl overflow-hidden mb-4 bg-zinc-900"><img src="${c.image}" alt="${esc(c.title)}" loading="lazy" class="w-full h-full object-cover"></div>
    <h3 class="text-lg font-semibold text-white mb-2">${esc(c.title)}</h3>
    <p class="text-zinc-400 text-sm leading-relaxed">${esc(c.description)}</p>
  </div>`).join('');
addPage('case-studies/index.html', {
  title: 'Customer Cases & Installations | NEAGLE GOLF',
  description: 'See how clubs, ranges, dealerships, and homes worldwide use NEAGLE GOLF simulators and dispensing systems.',
  main: `
  ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Case Studies' }])}
  <section class="max-w-7xl mx-auto px-4 md:px-6 pt-10">
    <h1 class="text-3xl md:text-5xl font-bold tracking-tight mb-3">Customer Cases</h1>
    <p class="text-zinc-400 max-w-2xl mb-10">Real installations across clubs, ranges, hospitality, and private homes.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">${caseCards}</div>
  </section>`
});

/* 6f. ABOUT */
addPage('about/index.html', {
  title: 'About NEAGLE GOLF',
  description: 'NEAGLE GOLF — tour-grade golf simulation and automation technology, engineered by aerospace radar developers and touring professionals for clubs, ranges, and players worldwide.',
  main: `
  ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'About' }])}
  <section class="max-w-4xl mx-auto px-4 md:px-6 pt-10">
    <div class="py-10 border-b border-white/10 space-y-4">
      <span class="text-[10px] md:text-xs uppercase tracking-widest text-golfGreen font-bold">ABOUT NEAGLE LAB</span>
      <h1 class="text-3xl md:text-5xl font-bold tracking-tight leading-tight">Engineering Physical Authenticity Indoors.</h1>
      <p class="text-zinc-300 text-sm md:text-lg leading-relaxed font-light">Formed by a collective of aerospace radar developers, acoustic research physicists, and competitive touring professionals, NEAGLE GOLF targets the absolute apex of indoor simulation science. We do not manufacture projection toys; we craft sub-millimetric golf installations that translate true outdoor ball aerodynamics into micro-level indoor metrics.</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 py-8 md:py-12">
      <div class="space-y-2"><h3 class="text-base md:text-lg font-bold text-white">99.9% Trajectory Precision</h3><p class="text-xs text-zinc-400 leading-relaxed">Every single micro-Doppler radar array undergoes stringent testing utilizing custom pneumatic launchers, performing over 100,000 strikes to map dynamic spin vectors across extreme launch windows.</p></div>
      <div class="space-y-2"><h3 class="text-base md:text-lg font-bold text-white">Cloud-Connected Longevity</h3><p class="text-xs text-zinc-400 leading-relaxed">All NEAGLE frameworks support seamless over-the-air firmware upgrades. Our high-performance processing hardware guarantees continuous algorithms, features, and new LiDAR course releases.</p></div>
    </div>
    <div class="p-8 md:p-12 rounded-3xl bg-gradient-to-tr from-zinc-950 to-zinc-900 border border-white/5 text-center space-y-6">
      <h3 class="text-lg md:text-xl font-bold text-white">The NEAGLE Concierge Service</h3>
      <p class="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">From custom framing and structural sound isolation to adaptive air-flow design, our team handles all installation steps to guarantee a flawless finished sporting asset.</p>
      <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow px-8 py-3 rounded-full text-xs font-bold tracking-wider uppercase inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Get Started</a>
    </div>
  </section>`
});

/* ── 7. Write files + sitemap ─────────────────────────────────── */
fs.mkdirSync(DIST, { recursive: true });
for (const { relPath, opts } of pages) {
  const out = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(opts));
}

// sitemap.xml
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sm);

// robots.txt
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

// 404 fallback (Cloudflare Pages serves 404.html)
fs.writeFileSync(path.join(DIST, '404.html'), page({
  title: 'Page Not Found | NEAGLE GOLF',
  description: 'The page you are looking for could not be found.',
  main: `<section class="max-w-3xl mx-auto px-4 text-center pt-32 pb-32"><h1 class="text-4xl font-bold mb-4">404</h1><p class="text-zinc-400 mb-8">The page you requested could not be found.</p><a href="/" class="btn-glow rounded-full px-8 py-3 text-sm font-semibold inline-flex items-center gap-2">Back to Home</a></section>`
}));

console.log(`✅ Generated ${pages.length} pages + sitemap.xml + robots.txt + 404.html into ./dist`);
console.log('   Pages:', sitemapUrls.length);

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

/* ── 1b-i. Detailed specs html mapping (products/ folder source of truth) ── */
// NOTE: products/ lives one level ABOVE this build script (project root).
const PRODUCTS_ROOT = path.join(ROOT, '..', 'products');
const SPECS_FILES = {
  'golfpai-s1': 'simulator/S1/golfpai_s1_specs_en.html',
  'golfpai-a1': 'simulator/A1/golfpai_a1_specs_en.html',
  'golfpai-x1': 'simulator/X1/golfpai_x1_specs_en.html',
  'rg-ruge': 'simulator/RG/ruge_specs_tabs.html',
  'faya-motion': 'simulator/FAYA_Motion/faya_motion_specs.html',
  'dispenser-machine': 'Dispenser_Machine/golf_ball_dispenser_specs.html',
  'vending-machine': 'Vending_Machine/golf_ball_vending_specs.html',
};
// Prefix every selector in an embedded specs stylesheet so it only applies
// inside .specs-wrap. This prevents rules like `.grid { ... }` or `body { ... }`
// from leaking out and breaking the rest of the product page.
function scopeCss(css) {
  // Drop global-only rules that should never be embedded.
  css = css.replace(/@font-face\s*\{[^{}]*\}/gi, '');
  // Scope a single selector. We keep :root as-is so variables remain global,
  // but we rewrite body/html/* selectors to target .specs-wrap instead.
  const scopeSelector = (sel) => {
    const s = sel.trim();
    if (!s) return '';
    if (s === ':root' || s.startsWith(':root')) return s;
    if (s === 'html' || s === 'body') return '';
    if (s === '*' || s.startsWith('*,')) return s.replace(/^\*/g, '.specs-wrap *');
    if (s.includes(',')) return s.split(',').map(scopeSelector).join(', ');
    return '.specs-wrap ' + s;
  };
  // Recursively scope rule blocks, including nested @media / @supports.
  const scopeBlock = (block) => {
    let out = '';
    const re = /([^{}@]+|@[^{}]+\{)(\{([^{}]|\{[^}]*\})*\})/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      const prelude = m[1].trim();
      const inner = m[2];
      if (prelude.startsWith('@media') || prelude.startsWith('@supports') || prelude.startsWith('@document')) {
        const body = inner.slice(1, -1);
        out += prelude + '{' + scopeBlock(body) + '}';
      } else if (prelude.startsWith('@')) {
        // other at-rules (keyframes, etc.): keep as-is
        out += prelude + inner;
      } else {
        const scopedSel = scopeSelector(prelude);
        if (scopedSel) out += scopedSel + inner;
      }
    }
    return out;
  };
  return scopeBlock(css);
}

function embedSpecs(productId) {
  const rel = SPECS_FILES[productId];
  if (!rel) return '';
  const fp = path.join(PRODUCTS_ROOT, rel);
  if (!fs.existsSync(fp)) return '';
  const raw = fs.readFileSync(fp, 'utf-8');
  const styles = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(m => m[1]).join('\n');
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : raw;
  // Remove any remaining inline <style> tags from the body so we do not
  // output the same stylesheet twice (once scoped, once unscoped).
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Downgrade any top-level <h1> in the embedded specs to <h2> so product
  // pages keep a single <h1> (the page title) for clean document outline.
  body = body.replace(/<h1([\s>])/gi, '<h2$1').replace(/<\/h1>/gi, '</h2>');
  if (!body.trim()) return '';
  // Some specs files (A1/S1/X1) rely on CSS variables that are NOT defined
  // inside the file (they expect an external theme). Inject a light-theme
  // variable set so the cards render with readable light colors.
  let varStyle = '';
  if (/var\(--color-/.test(raw) && !/:root/.test(styles)) {
    varStyle = `<style>
:root{
  --color-background-primary:#ffffff;
  --color-background-secondary:#f4f6f8;
  --color-background-info:#e8f7ef;
  --color-background-success:#e3f9ec;
  --color-text-primary:#1a1a1a;
  --color-text-secondary:#6b7280;
  --color-text-info:#009e5a;
  --color-text-success:#15803d;
  --color-border-tertiary:#e5e7eb;
  --color-border-secondary:#d1d5db;
  --color-border-info:#00e676;
  --border-radius-md:8px;
  --border-radius-lg:12px;
}</style>`;
  }
  const scopedStyles = scopeCss(styles);
  return `${varStyle}<style>${scopedStyles}</style>
<style class="specs-override">
/* Dark-theme overrides for embedded product specs */
.specs-wrap{background:#0d0d0f !important;color:#e4e4e7 !important}
.specs-wrap .wrap{background:transparent !important;max-width:none !important}
.specs-wrap .header h1{color:#fff !important}
.specs-wrap .header p{color:#a1a1aa !important}
.specs-wrap .stabs,
.specs-wrap .tabs{justify-content:flex-start !important;flex-wrap:wrap !important;gap:0.5rem !important;margin-left:0 !important;padding-left:0 !important}
.specs-wrap .stab,
.specs-wrap .tab{background:rgba(255,255,255,0.05) !important;border:1px solid rgba(255,255,255,0.1) !important;color:#e4e4e7 !important;backdrop-filter:blur(4px)}
.specs-wrap .stab:hover,
.specs-wrap .tab:hover{border-color:rgba(0,230,118,0.5) !important;color:#00e676 !important}
.specs-wrap .stab.active,
.specs-wrap .tab.active{background:rgba(0,230,118,0.12) !important;border-color:#00e676 !important;color:#00e676 !important}
.specs-wrap .stab i,
.specs-wrap .tab i{color:#00e676 !important}
.specs-wrap .card,
.specs-wrap .range-card{background:rgba(24,24,27,0.85) !important;border:1px solid rgba(255,255,255,0.08) !important;color:#fff !important;backdrop-filter:blur(4px)}
.specs-wrap .card.hi,
.specs-wrap .range-card.hi{background:rgba(0,230,118,0.08) !important;border-color:rgba(0,230,118,0.25) !important}
.specs-wrap .card .val,
.specs-wrap .card-val{color:#fff !important}
.specs-wrap .card .lbl,
.specs-wrap .card-lbl{color:#a1a1aa !important}
.specs-wrap .card .sub,
.specs-wrap .card-sub{color:#71717a !important}
.specs-wrap .range-name{color:#a1a1aa !important}
.specs-wrap .range-val{color:#fff !important}
.specs-wrap .range-acc{color:#00e676 !important}
.specs-wrap .tour-badge{background:rgba(0,230,118,0.08) !important;border:1px solid rgba(0,230,118,0.25) !important;color:#00e676 !important}
.specs-wrap .section-title{color:#d4d4d8 !important}
.specs-wrap .section-title::after{background:linear-gradient(90deg,#00e676,transparent) !important}
.specs-wrap .table-card table{color:#e4e4e7 !important}
.specs-wrap .table-card th{color:#a1a1aa !important;border-color:rgba(255,255,255,0.08) !important}
.specs-wrap .table-card td{border-color:rgba(255,255,255,0.08) !important}
.specs-wrap .sec{color:#a1a1aa !important}
.specs-wrap .itxt{color:#e4e4e7 !important}
</style>
<div class="specs-wrap">${body}</div>`;
}

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
            ${item('/golf-simulators/compare/', 'Compare', 'simulators')}
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
                    <a href="/golf-simulators/cost/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Simulator Cost</a>
                    <a href="/golf-simulators/room-size/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Room Size</a>
                    <a href="/golf-simulators/installation/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Installation</a>
                    <a href="/golf-simulators/compare/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Compare Models</a>
                    <a href="/golf-simulators/buying-guide/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Buying Guide</a>
                    <a href="/case-studies/" class="block text-zinc-200 hover:text-golfGreen transition-colors">Case Studies</a>
                    <a href="/about/" class="block text-zinc-200 hover:text-golfGreen transition-colors">About NEAGLE</a>
                </div>
            </div>
            <div class="max-w-7xl mx-auto pt-8 mt-8 border-t border-white/5 text-zinc-600 text-[11px]">
                © ${new Date().getFullYear()} NEAGLE GOLF. All rights reserved.
            </div>
        </footer>`;
}

// ---------------------------------------------------------------------------
// Guide / resource pages (high-intent SEO/GEO landing pages, generated from
// the same catalogDb data so prices / space requirements stay in sync).
// ---------------------------------------------------------------------------

// Single source of truth for space figures: System Size = equipment envelope
// (from catalog spaceRequired). Used by the room-size guide AND every
// product detail page so the numbers never drift apart.
const spaceSizes = (p) => {
  // Read spaceRequired first (simulators), fall back to the `space` field
  // (dispenser/vending machines) so every product with dimensions gets a
  // Minimum Space row instead of the customizable fallback.
  const dims = String(p.spaceRequired || p.space || '').match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*[×x]\s*([\d.]+)/);
  if (!dims) return null;
  // Preserve the precision written in the source data (e.g. 1.65 stays 1.65,
  // 6.0 stays 6.0) for the displayed system size.
  const fmtNum = (raw) => {
    const t = String(raw).trim();
    return t.includes('.') ? t : t + '.0';
  };
  return {
    sys: `${fmtNum(dims[1])} × ${fmtNum(dims[2])} × ${fmtNum(dims[3])} m`
  };
};

// Topic-cluster contextual links: interconnects the three guide pages with
// each other and with the compare / product / case-study hubs.
const clusterLinks = (active) => {
  const items = [
    ['/golf-simulators/cost/', 'Simulator Cost & Pricing'],
    ['/golf-simulators/room-size/', 'Room Size & Space'],
    ['/golf-simulators/installation/', 'Installation Process'],
    ['/golf-simulators/compare/', 'Compare Simulators'],
    ['/golf-simulators/', 'All Simulators'],
    ['/case-studies/', 'Case Studies']
  ];
  return `
    <div class="mt-14 glass rounded-2xl p-6 md:p-8">
      <h2 class="text-white font-semibold text-lg mb-1">Keep Exploring</h2>
      <p class="text-zinc-400 text-sm mb-5">Plan your purchase end to end — cost, space, installation, and real-world setups.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${items.map(([href, label]) => href === active
          ? `<span class="px-4 py-3 rounded-xl border border-golfGreen/30 bg-golfGreen/10 text-golfGreen text-sm font-medium">${label}</span>`
          : `<a href="${href}" class="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-golfGreen/40 hover:bg-golfGreen/5 text-zinc-200 text-sm transition-colors">${label}</a>`).join('')}
      </div>
    </div>`;
};

function guideCostPage() {
  const sims = catalogDb.simulators.items
    .map(p => ({ name: p.name, type: p.type, price: p.price, tracking: p.tracking, courses: p.courses }));
  const disp = catalogDb.dispenserMachines.items
    .map(p => ({ name: p.name, type: p.type, price: p.price }));
  const rowsSim = sims.map(s => `<tr class="border-t border-white/5">
      <td class="py-3 pr-4 text-white font-medium">${esc(s.name)}</td>
      <td class="py-3 pr-4 text-zinc-300">${esc(s.tracking || '—')}</td>
      <td class="py-3 pr-4 text-zinc-300">${s.courses ? esc(String(s.courses)) + ' courses' : '—'}</td>
      <td class="py-3 text-golfGreen font-semibold">${esc(s.price)}</td>
    </tr>`).join('');
  const rowsDisp = disp.map(d => `<tr class="border-t border-white/5">
      <td class="py-3 pr-4 text-white font-medium">${esc(d.name)}</td>
      <td class="py-3 pr-4 text-zinc-300">${esc(d.type)}</td>
      <td class="py-3 text-golfGreen font-semibold">${esc(d.price)}</td>
    </tr>`).join('');
  const schema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How much does a NEAGLE GOLF simulator cost?',
        acceptedAnswer: { '@type': 'Answer', text: 'NEAGLE GOLF simulator packages range from about ' + sims[sims.length-1].price + ' for the GOLFPAI X1 Smart Golf Simulator up to ' + sims[0].price + ' for the GOLFPAI S1 all-in-one system. Pricing varies by tracking technology, projection, and course library.' } },
      { '@type': 'Question', name: 'How much does a golf ball dispenser cost?',
        acceptedAnswer: { '@type': 'Answer', text: 'Automated golf ball dispensers start at ' + disp[0].price + ' for the standard unit, with vending and self-service models priced on configuration.' } }
    ]
  };
  const costMain = `
    <section class="max-w-4xl mx-auto px-4 md:px-6 pt-16 md:pt-24">
      <span class="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen">Pricing</span>
      <h1 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Golf Simulator Cost &amp; Pricing</h1>
      <p class="mt-5 text-zinc-400 leading-relaxed">NEAGLE GOLF builds tour-grade golf simulation and automation systems for clubs, ranges, and private studios. Below is the current price range across our simulator and dispenser lines. Every package includes white-glove installation and 24/7 concierge support.</p>

      <h2 class="mt-12 text-2xl font-bold text-white mb-4">Golf Simulator Price Range</h2>
      <div class="glass rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="text-zinc-400 text-left"><tr><th class="py-3 pr-4">Model</th><th class="py-3 pr-4">Tracking</th><th class="py-3 pr-4">Courses</th><th class="py-3">Price</th></tr></thead>
          <tbody>${rowsSim}</tbody>
        </table>
      </div>

      <h2 class="mt-12 text-2xl font-bold text-white mb-4">Ball Dispenser Price Range</h2>
      <div class="glass rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="text-zinc-400 text-left"><tr><th class="py-3 pr-4">Model</th><th class="py-3 pr-4">Type</th><th class="py-3">Price</th></tr></thead>
          <tbody>${rowsDisp}</tbody>
        </table>
      </div>

      <div class="mt-12 glass rounded-2xl p-6 md:p-8" itemscope itemtype="https://schema.org/FAQPage">
        <h2 class="text-white font-semibold text-lg mb-4">Cost FAQ</h2>
        <div class="space-y-4">
          <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
            <h3 itemprop="name" class="text-white font-medium">How much does a NEAGLE GOLF simulator cost?</h3>
            <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" class="mt-2 text-zinc-300 text-sm leading-relaxed"><span itemprop="text">NEAGLE GOLF simulator packages range from about ${esc(sims[sims.length-1].price)} for the GOLFPAI X1 Smart Golf Simulator up to ${esc(sims[0].price)} for the GOLFPAI S1 all-in-one system. Pricing varies by tracking technology, projection, and course library.</span></div>
          </div>
          <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
            <h3 itemprop="name" class="text-white font-medium">How much does a golf ball dispenser cost?</h3>
            <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" class="mt-2 text-zinc-300 text-sm leading-relaxed"><span itemprop="text">Automated golf ball dispensers start at ${esc(disp[0].price)} for the standard unit, with vending and self-service models priced on configuration.</span></div>
          </div>
        </div>
      </div>

      <div class="mt-12 text-center">
        <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow rounded-full px-8 py-3.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Get a Custom Quote</a>
      </div>
      ${clusterLinks('/golf-simulators/cost/')}
    </section>`;
  return { main: costMain, schema };
}

function guideRoomSizePage() {
  // spaceRequired is the equipment/system envelope (W x D x H in meters).
  // System Size is computed by the shared spaceSizes() helper so the guide
  // table always matches the numbers shown on each product detail page.
  const items = Object.keys(catalogDb).flatMap(catId => catalogDb[catId].items)
    .filter(p => p.spaceRequired)
    .map(p => {
      const s = spaceSizes(p);
      return { name: p.name, sys: s ? s.sys : p.spaceRequired, cats: p.useCases };
    });
  const rows = items.map(i => `<tr class="border-t border-white/5">
      <td class="py-3 pr-4 text-white font-medium">${esc(i.name)}</td>
      <td class="py-3 pr-4 text-zinc-300">${esc(i.sys)}</td>
      <td class="py-3 text-zinc-300">${esc(i.cats.join(', '))}</td>
    </tr>`).join('');
  const schema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How much room do I need for a golf simulator?',
        acceptedAnswer: { '@type': 'Answer', text: 'Each NEAGLE GOLF model lists its System Size (the physical equipment envelope, W × D × H) in the table above. For example, the GOLFPAI S1 system is 6.0 × 3.8 × 2.8 m. See the per-model table for exact figures.' } }
    ]
  };
  const roomMain = `
    <section class="max-w-4xl mx-auto px-4 md:px-6 pt-16 md:pt-24">
      <span class="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen">Planning</span>
      <h1 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Golf Simulator Room Size &amp; Space Requirements</h1>
      <p class="mt-5 text-zinc-400 leading-relaxed">Before choosing a system, confirm your available ceiling height, width, and depth. The table below lists the <strong class="text-white">System Size</strong> (the physical equipment envelope, W × D × H) for each model. Our team performs a free site survey to validate fit before installation.</p>

      <h2 class="mt-12 text-2xl font-bold text-white mb-4">Space Requirements by Model</h2>
      <div class="glass rounded-2xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="text-zinc-400 text-left"><tr><th class="py-3 pr-4">Model</th><th class="py-3 pr-4">System Size (W×D×H)</th><th class="py-3">Best For</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="mt-12 glass rounded-2xl p-6 md:p-8" itemscope itemtype="https://schema.org/FAQPage">
        <h2 class="text-white font-semibold text-lg mb-4">Space FAQ</h2>
        <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
          <h3 itemprop="name" class="text-white font-medium">How much room do I need for a golf simulator?</h3>
          <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" class="mt-2 text-zinc-300 text-sm leading-relaxed"><span itemprop="text">Each NEAGLE GOLF model lists its System Size (the physical equipment envelope, W × D × H) in the table above. For example, the GOLFPAI S1 system is 6.0 × 3.8 × 2.8 m. See the per-model table above for exact figures.</span></div>
        </div>
      </div>
      ${clusterLinks('/golf-simulators/room-size/')}
    </section>`;
  return { main: roomMain, schema };
}

function guideInstallationPage() {
  const steps = [
    ['Site Survey', 'We review your room dimensions, ceiling height, power, and network to confirm fit and placement.'],
    ['Delivery & Unboxing', 'White-glove delivery to the install room; all hardware and cabling are inventoried on-site.'],
    ['Mounting & Enclosure', 'Projector, screen, and tracking hardware are mounted; impact enclosure and flooring are assembled.'],
    ['Calibration', 'Launch monitor / radar is calibrated to the hitting position; projection is aligned to the screen.'],
    ['Software & Courses', 'Simulation software is activated with your course library and user accounts configured.'],
    ['Training & Handover', 'On-site training for operators/owners, plus 24/7 concierge support after go-live.']
  ];
  const stepHtml = steps.map((s, i) => `<div class="flex gap-4">
      <div class="shrink-0 w-9 h-9 rounded-full bg-golfGreen/15 text-golfGreen flex items-center justify-center font-semibold">${i+1}</div>
      <div><h3 class="text-white font-medium">${esc(s[0])}</h3><p class="text-zinc-400 text-sm mt-1 leading-relaxed">${esc(s[1])}</p></div>
    </div>`).join('');
  const schema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How is a NEAGLE GOLF simulator installed?',
        acceptedAnswer: { '@type': 'Answer', text: 'Installation follows six steps: site survey, delivery, mounting and enclosure build, calibration, software activation, and on-site training. Most systems are fully operational within one to two days.' } },
      { '@type': 'Question', name: 'Do you offer on-site installation?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes. Every NEAGLE GOLF system ships with white-glove delivery, professional mounting, calibration, and training as part of the package.' } }
    ]
  };
  const installMain = `
    <section class="max-w-4xl mx-auto px-4 md:px-6 pt-16 md:pt-24">
      <span class="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-golfGreen">Process</span>
      <h1 class="mt-3 text-3xl md:text-5xl font-bold tracking-tight">Golf Simulator Installation Process</h1>
      <p class="mt-5 text-zinc-400 leading-relaxed">Every NEAGLE GOLF system is delivered and installed by our team — no third-party contractors. The typical deployment takes one to two days depending on enclosure complexity.</p>

      <h2 class="mt-12 text-2xl font-bold text-white mb-6">What to Expect</h2>
      <div class="space-y-6">${stepHtml}</div>

      <div class="mt-12 glass rounded-2xl p-6 md:p-8" itemscope itemtype="https://schema.org/FAQPage">
        <h2 class="text-white font-semibold text-lg mb-4">Installation FAQ</h2>
        <div class="space-y-4">
          <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
            <h3 itemprop="name" class="text-white font-medium">How is a NEAGLE GOLF simulator installed?</h3>
            <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" class="mt-2 text-zinc-300 text-sm leading-relaxed"><span itemprop="text">Installation follows six steps: site survey, delivery, mounting and enclosure build, calibration, software activation, and on-site training. Most systems are fully operational within one to two days.</span></div>
          </div>
          <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
            <h3 itemprop="name" class="text-white font-medium">Do you offer on-site installation?</h3>
            <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" class="mt-2 text-zinc-300 text-sm leading-relaxed"><span itemprop="text">Yes. Every NEAGLE GOLF system ships with white-glove delivery, professional mounting, calibration, and training as part of the package.</span></div>
          </div>
        </div>
      </div>

      <div class="mt-12 text-center">
        <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow rounded-full px-8 py-3.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Book a Site Survey</a>
      </div>
      ${clusterLinks('/golf-simulators/installation/')}
    </section>`;
  return { main: installMain, schema };
}

/* ── 4. Page wrapper ───────────────────────────────────────────── */
// DEFAULT_OG: brand hero image used on home/section pages
const DEFAULT_OG = 'https://pub-668f8b794c5b4860a9cb5c27e8ff77e0.r2.dev/images/card_bg_1.jpg';
function page({ title, description, extraHead = '', bodyClass = '', main, navActive = '', url = '/', ogImage = DEFAULT_OG, noindex = false }) {
  const canon = noindex ? '' : `<link rel="canonical" href="${esc(SITE + url)}">`;
  const robots = noindex ? '<meta name="robots" content="noindex, follow">' : '';
  // Replace base title/description/OG/canonical in head with page-specific values
  let h = head
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${esc(description)}">`)
    .replace(/<link rel="canonical"[^>]*>/i, canon)
    .replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(description)}">`)
    .replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(SITE + url)}">`)
    .replace(/<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${esc(ogImage)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(description)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${esc(ogImage)}">`);
  h = robots + h;
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
  // Derive canonical url from file path: index.html -> "/", a/b/index.html -> "/a/b/"
  const url = relPath === 'index.html' ? '/' : '/' + relPath.replace(/index\.html$/, '');
  pages.push({ relPath, opts: { url, ...opts } });
  sitemapUrls.push(SITE + url);
}

/* 6a. HOME */
const faqSchema = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is the best golf simulator for a commercial range?',
      acceptedAnswer: { '@type': 'Answer', text: 'A ceiling or overhead launch-monitor system with multi-surface tracking, 4K projection, and durable enclosure — exactly what NEAGLE GOLF deploys for clubs and venues worldwide.' } },
    { '@type': 'Question', name: 'Do you supply automated ball dispensers?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes. Our dispensing machines support cashless, self-service operation and integrate with range management software for 24/7 commercial use.' } },
    { '@type': 'Question', name: 'Where do you ship?',
      acceptedAnswer: { '@type': 'Answer', text: 'NEAGLE GOLF serves clubs, ranges, and home studios worldwide, with dedicated concierge support in every region.' } }
  ]
};
addPage('index.html', {
  title: 'NEAGLE GOLF — Golf Simulators, Launch Monitors & Ball Dispensers',
  description: 'NEAGLE GOLF designs tour-grade golf simulators, launch monitors, 4K golf simulation systems, and automated ball dispensing machines for clubs, ranges, and home studios.',
  navActive: '',
  extraHead: `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`,
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
      <div class="glass rounded-2xl p-6 md:p-8" id="faq">
        <h3 class="text-white font-semibold text-lg mb-4">Frequently Asked Questions</h3>
        <div class="space-y-4">
          <div id="faq-commercial-simulator"><p class="text-white font-medium">What is the best golf simulator for a commercial range?</p><p class="mt-1">A ceiling or overhead launch-monitor system with multi-surface tracking, 4K projection, and durable enclosure — exactly what NEAGLE GOLF deploys for clubs and venues worldwide.</p></div>
          <div id="faq-ball-dispensers"><p class="text-white font-medium">Do you supply automated ball dispensers?</p><p class="mt-1">Yes. Our dispensing machines support cashless, self-service operation and integrate with range management software for 24/7 commercial use.</p></div>
          <div id="faq-shipping"><p class="text-white font-medium">Where do you ship?</p><p class="mt-1">NEAGLE GOLF serves clubs, ranges, and home studios worldwide, with dedicated concierge support in every region.</p></div>
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
      <p class="text-zinc-400 max-w-2xl mb-6">${esc(cat.desc)}</p>
      ${catId === 'simulators' ? `<div class="flex flex-wrap gap-3 mb-10"><a href="/golf-simulators/compare/" class="btn-ghost rounded-full px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-solid fa-table-cells-large text-golfGreen"></i> Compare models</a><a href="/golf-simulators/buying-guide/" class="btn-ghost rounded-full px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-solid fa-book-open text-golfGreen"></i> Buying guide</a></div>` : ''}
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
    // Minimum Space row — rendered in the same style as the Key Highlights list.
    // When the product has no size data, show the customizable fallback instead.
    const s = spaceSizes(p);
    const spaceText = s ? s.sys.replace(/ m$/, ' meters') : 'Fully customizable to your space';
    const spaceSizesHtml = `<li class="flex gap-2 text-zinc-300"><i class="fa-solid fa-ruler-combined text-golfGreen mt-1 text-sm"></i><span>Minimum Space (length, width, height): ${spaceText}</span></li>`;
    const specsHtml = embedSpecs(p.id);
    const highlights = (p.highlights || []).map(h => `<li class="flex gap-2 text-zinc-300"><i class="fa-solid fa-circle-check text-golfGreen mt-1 text-sm"></i><span>${esc(h)}</span></li>`).join('');
    const useCases = (p.useCases || []).map(u => `<span class="text-xs px-3 py-1 rounded-full bg-white/5 text-zinc-300 border border-white/10">${esc(u)}</span>`).join(' ');
    const galleryImgs = (p.images && p.images.length ? p.images : [p.image]);
    const videos = (p.videos && p.videos.length) ? p.videos : (p.video ? [p.video] : []);
    const hasMultiImages = galleryImgs.length > 1;
    const videoLabel = (src, idx) => {
      const name = String(src).split('/').pop().replace(/\.[^/.]+$/, '').toLowerCase();
      const map = { intro: 'Intro', introduction: 'Intro', tech: 'Tech', demo: 'Demo', overview: 'Overview', operation: 'Operation' };
      const key = Object.keys(map).find(k => name.includes(k));
      return map[key] || (videos.length > 1 ? `Video ${idx + 1}` : 'Intro');
    };
    const galleryThumbs = galleryImgs.map((src, i) =>
      `<div class="detail-thumb ${i === 0 ? 'active' : ''}" onclick="setGalleryImage(${i})"><img src="${esc(src)}" alt="Thumbnail ${i + 1}" loading="lazy"></div>`).join('');
    const videoSection = videos.length
      ? `<div id="detail-video-section" class="border-t border-white/10 pt-4 mt-4">
          <h4 class="text-sm uppercase tracking-widest text-zinc-500 mb-3">Product Videos</h4>
          <div id="detail-video-list" class="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            ${videos.map((src, i) => `<div class="video-thumb" onclick="openVideoLightbox('${esc(src)}')"><img src="${esc(galleryImgs[0] || '')}" alt="Video cover" loading="lazy"><div class="absolute inset-0 bg-black/40 flex items-center justify-center"><div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center"><i class="fa-solid fa-play text-zinc-900 text-base ml-0.5"></i></div></div><span class="absolute bottom-2 right-2 text-xs text-white/80 bg-black/50 px-2 py-1 rounded">${esc(videoLabel(src, i))}</span></div>`).join('')}
          </div>
        </div>`
      : '';
    const productUrl = SITE + prodLink(catId, p);
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      sku: p.id,
      url: productUrl,
      description: p.tagline,
      image: p.images || [p.image],
      brand: { '@type': 'Brand', name: 'NEAGLE GOLF' },
      category: cat.title,
      offers: {
        '@type': 'Offer',
        url: productUrl,
        priceCurrency: 'USD',
        price: p.price.replace(/[^0-9.]/g, ''),
        itemCondition: 'https://schema.org/NewCondition',
        availability: 'https://schema.org/PreOrder',
        seller: { '@type': 'Organization', name: 'NEAGLE GOLF', url: SITE + '/' }
      },
      ...(s ? { additionalProperty: [
        { '@type': 'PropertyValue', name: 'Minimum Space', value: s.sys }
      ] } : {})
    };
    const breadcrumbSchema = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: cat.title, item: SITE + catLink(catId) },
        { '@type': 'ListItem', position: 3, name: p.name, item: productUrl }
      ]
    };
    addPage(CAT_URL[catId] + '/' + p.id + '/index.html', {
      title: `${p.name} | NEAGLE GOLF`,
      description: p.tagline,
      navActive: catId,
      ogImage: p.image,
      extraHead: `<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.17.0/dist/tabler-icons.min.css">`,
      main: `
      ${breadcrumb([{ label: 'Home', href: '/' }, { label: cat.title, href: catLink(catId) }, { label: p.name }])}
      <style>
        #detail-main-media{position:relative;aspect-ratio:4/3;border-radius:1.5rem;overflow:hidden;background:#18181b;cursor:zoom-in;margin-bottom:1rem}
        #detail-main-media img{width:100%;height:100%;object-fit:cover}
        #detail-main-media .nav-btn{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;opacity:0;transition:opacity .2s,background .2s}
        #detail-main-media:hover .nav-btn{opacity:1}
        #detail-main-media .nav-btn:hover{background:rgba(0,0,0,.75)}
        #detail-main-media .nav-btn.left{left:1rem}
        #detail-main-media .nav-btn.right{right:1rem}
        #detail-main-media .img-counter{position:absolute;bottom:1rem;right:1rem;background:rgba(0,0,0,.5);color:#fff;padding:.35rem .75rem;border-radius:9999px;font-size:.75rem}
        /* no play button on main image */
        .detail-thumb{position:relative;flex:0 0 auto;width:48px;height:48px;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;background:#18181b;transition:border-color .2s}
        .detail-thumb:hover{border-color:rgba(255,255,255,.3)}
        .detail-thumb.active{border-color:#22c55e}
        .detail-thumb img{width:100%;height:100%;object-fit:cover}
        .video-thumb{position:relative;flex:0 0 auto;width:192px;height:112px;border-radius:12px;overflow:hidden;cursor:pointer;background:#000}
        .video-thumb img{width:100%;height:100%;object-fit:cover}
        .video-thumb .absolute{position:absolute}
        .video-thumb .inset-0{inset:0}
        .lightbox-overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.95);display:none;align-items:center;justify-content:center}
        .lightbox-overlay.active{display:flex}
        .lightbox-overlay img{max-width:90vw;max-height:90vh;object-fit:contain}
        .lightbox-overlay video{max-width:90vw;max-height:90vh;object-fit:contain}
        .lightbox-overlay .close-btn{position:absolute;top:1.5rem;right:1.5rem;width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none}
        .lightbox-overlay .lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none}
        .lightbox-overlay .lb-nav.left{left:1.5rem}
        .lightbox-overlay .lb-nav.right{right:1.5rem}
        .lightbox-overlay .lb-counter{position:absolute;bottom:1.5rem;left:50%;transform:translateX(-50%);color:#fff;background:rgba(0,0,0,.5);padding:.35rem .75rem;border-radius:9999px;font-size:.75rem}
        .lightbox-overlay .lb-caption{position:absolute;bottom:3.5rem;left:50%;transform:translateX(-50%);color:#e4e4e7;font-size:.875rem;text-align:center;max-width:80%}
      </style>
      <section class="max-w-7xl mx-auto px-4 md:px-6 pt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-10">
        <div>
          <div id="detail-main-media" onclick="openLightbox()">
            <img id="detail-main-image" src="${esc(galleryImgs[0])}" alt="${esc(p.name)}">
            ${hasMultiImages ? `<button class="nav-btn left" onclick="event.stopPropagation();navigateGallery(-1)"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="nav-btn right" onclick="event.stopPropagation();navigateGallery(1)"><i class="fa-solid fa-chevron-right"></i></button>
            <span class="img-counter"><span id="detail-current-index">1</span> / ${galleryImgs.length}</span>` : ''}
          </div>
          ${hasMultiImages ? `<div id="detail-thumbnails" class="flex gap-2 overflow-x-auto pb-1 scrollbar-none">${galleryThumbs}</div>` : ''}
          ${videoSection}
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
            <ul class="space-y-3">${highlights}${spaceSizesHtml}</ul>
          </div>
        </div>
      </section>
      <section class="max-w-7xl mx-auto px-4 md:px-6 pt-12">
        <h2 class="text-2xl font-bold text-white mb-5">Specifications</h2>
        ${specsHtml || `<table class="w-full text-sm border border-white/5 rounded-2xl overflow-hidden">${specsRows}</table>`}
      </section>
      <section class="max-w-7xl mx-auto px-4 md:px-6 pt-16 pb-4">
        <h2 class="text-2xl font-bold text-white mb-6">More from ${esc(cat.title)}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          ${cat.items.filter(x => x.id !== p.id).slice(0, 3).map(x => productCard(catId, x)).join('')}
        </div>
      </section>

      <!-- Image lightbox -->
      <div id="lightbox-overlay" class="lightbox-overlay" onclick="if(event.target===this) closeLightbox()">
        <button class="close-btn" onclick="closeLightbox()"><i class="fa-solid fa-xmark text-xl"></i></button>
        <button class="lb-nav left" onclick="event.stopPropagation();navigateLightbox(-1)"><i class="fa-solid fa-chevron-left"></i></button>
        <button class="lb-nav right" onclick="event.stopPropagation();navigateLightbox(1)"><i class="fa-solid fa-chevron-right"></i></button>
        <img id="lightbox-image" src="" alt="Full size">
        <div class="lb-caption" id="lightbox-caption"></div>
        <div class="lb-counter" id="lightbox-counter"></div>
      </div>

      <!-- Video lightbox -->
      <div id="video-lightbox" class="lightbox-overlay" onclick="if(event.target===this) closeVideoLightbox()">
        <button class="close-btn" onclick="closeVideoLightbox()"><i class="fa-solid fa-xmark text-xl"></i></button>
        <video id="video-lightbox-player" src="" controls playsinline webkit-playsinline></video>
      </div>

      <script>
      (function(){
        var imgs = ${JSON.stringify(galleryImgs)};
        var vids = ${JSON.stringify(videos)};
        var cur = 0;
        function setGalleryImage(idx){
          if(!imgs.length) return;
          cur = (idx % imgs.length + imgs.length) % imgs.length;
          var main = document.getElementById('detail-main-image');
          main.style.opacity = '0.8';
          setTimeout(function(){ main.src = imgs[cur]; main.style.opacity = '1'; }, 150);
          document.getElementById('detail-current-index').textContent = cur + 1;
          document.querySelectorAll('#detail-thumbnails .detail-thumb').forEach(function(t,i){
            t.classList.toggle('active', i === cur);
          });
        }
        window.setGalleryImage = setGalleryImage;
        window.navigateGallery = function(d){ setGalleryImage(cur + d); };
        window.openLightbox = function(){
          if(!imgs.length) return;
          document.getElementById('lightbox-image').src = imgs[cur];
          document.getElementById('lightbox-overlay').classList.add('active');
          document.getElementById('lightbox-counter').textContent = (cur + 1) + ' / ' + imgs.length;
          document.getElementById('lightbox-caption').textContent = document.querySelector('h1') ? document.querySelector('h1').textContent : '';
        };
        window.closeLightbox = function(){ document.getElementById('lightbox-overlay').classList.remove('active'); };
        window.navigateLightbox = function(d){ setGalleryImage(cur + d); openLightbox(); };
        window.openVideoLightbox = function(src){
          var lb = document.getElementById('video-lightbox');
          var player = document.getElementById('video-lightbox-player');
          player.src = src;
          player.pause();
          lb.classList.add('active');
          if(window.__videoPlayTimer) clearTimeout(window.__videoPlayTimer);
          window.__videoPlayTimer = setTimeout(function(){ player.play().catch(function(){}); }, 2000);
        };
        window.closeVideoLightbox = function(){
          if(window.__videoPlayTimer) clearTimeout(window.__videoPlayTimer);
          var player = document.getElementById('video-lightbox-player');
          player.pause(); player.removeAttribute('src');
          document.getElementById('video-lightbox').classList.remove('active');
        };
        document.addEventListener('keydown', function(e){
          if(e.key === 'Escape'){ closeLightbox(); closeVideoLightbox(); }
          if(document.getElementById('lightbox-overlay').classList.contains('active')){
            if(e.key === 'ArrowLeft') navigateLightbox(-1);
            if(e.key === 'ArrowRight') navigateLightbox(1);
          }
        });
        // touch swipe
        var touchStartX = 0;
        var mainMedia = document.getElementById('detail-main-media');
        if(mainMedia){
          mainMedia.addEventListener('touchstart', function(e){ touchStartX = e.changedTouches[0].screenX; });
          mainMedia.addEventListener('touchend', function(e){
            var diff = touchStartX - e.changedTouches[0].screenX;
            if(Math.abs(diff) > 50) navigateGallery(diff > 0 ? 1 : -1);
          });
        }
        setGalleryImage(0);
      })();
      </script>`
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

/* 6e. CASE STUDIES (listing) */
// P1④: Project snapshot facts per case. Each value is verbatim information
// already present in the case data (title / description / keywords). Rows are
// omitted when the source case does not state the value — nothing is invented.
const CASE_FACTS = {
  'lincoln-4s': [
    ['Facility', 'Auto Dealership'],
    ['Simulator', 'Golfpai smart golf simulator'],
    ['Focus', 'Smart Golf Retention']
  ],
  'automatives': [
    ['Facility', 'Automotive Dealership'],
    ['Focus', 'Showroom Experience Ecosystem']
  ],
  'in-house': [
    ['Facility', 'Chinese Mansion'],
    ['Project', 'Basement Golf Studio']
  ],
  'jp-rest': [
    ['Facility', 'Restaurant'],
    ['Project', 'High-End Hospitality Golf Integration']
  ],
  'shanghai-g-town': [
    ['Location', 'Shanghai, China'],
    ['Facility', 'Clubhouse'],
    ['Simulator', 'Golfpai S1'],
    ['Focus', 'Coastal Golf & Dining']
  ],
  'clubhouse': [
    ['Location', 'Richmond, Greater Vancouver Area'],
    ['Facility', 'Indoor Golf Center'],
    ['Simulator', 'RG Eagleye III'],
    ['Bays', '6'],
    ['VIP Rooms', '3'],
    ['Course Library', '180+ real 4K courses'],
    ['Project', 'Full renovation']
  ],
  'oclock': [
    ['Location', 'Regina'],
    ['Facility', 'Entertainment Venue'],
    ['Simulator', 'RG Eagleye III'],
    ['Bays', '9'],
    ['VIP Rooms', '2'],
    ['Project', 'Ground-up build']
  ],
  'toroto-house': [
    ['Location', 'Toronto'],
    ['Facility', 'Sun Room Conversion'],
    ['Simulator', 'RG Eagleye III with Auto Tee'],
    ['Project', 'Multi-Entertainment Suite']
  ]
};
const caseSlug = (c) => `/case-studies/${c.id}/`;
const caseCards = caseStudies.map(c => `
  <a href="${caseSlug(c)}" class="card-glow block rounded-3xl overflow-hidden bg-zinc-950/60 border border-white/8 p-5 hover:border-golfGreen/40 transition-all">
    <div class="aspect-[16/9] rounded-2xl overflow-hidden mb-4 bg-zinc-900"><img src="${c.image}" alt="${esc(c.title)}" loading="lazy" class="w-full h-full object-cover"></div>
    <h3 class="text-lg font-semibold text-white mb-2">${esc(c.title)}</h3>
    <p class="text-zinc-400 text-sm leading-relaxed">${esc(c.description)}</p>
  </a>`).join('');
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

/* 6e-b. CASE STUDY individual pages */
for (const c of caseStudies) {
  const csUrl = SITE + caseSlug(c);
  // P1③: <title> uses the case's scene label (before the // │ : separator the
  // data already uses) and the meta description is trimmed to ~160 chars — no
  // new content is ever invented, only the existing copy is shortened.
  const shortLabel = (c.title.split(/[│|]|\/\/|：|:/)[0] || c.title).trim();
  const metaDesc = c.description.length <= 160
    ? c.description
    : c.description.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  // P1④: Project snapshot — every value is explicitly stated in the case data.
  const facts = CASE_FACTS[c.id] || [];
  const factsHtml = facts.length ? `
    <div class="mt-8 glass rounded-2xl p-6 md:p-8">
      <h2 class="text-white font-semibold text-lg mb-4">Project Snapshot</h2>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        ${facts.map(([k, v]) => `<div class="flex items-start justify-between gap-4 border-b border-white/5 pb-2.5"><dt class="text-zinc-400">${esc(k)}</dt><dd class="text-white text-right font-medium">${esc(v)}</dd></div>`).join('')}
      </dl>
    </div>` : '';
  const csSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': csUrl + '#article',
    headline: c.title,
    description: c.description,
    image: [c.image],
    author: { '@type': 'Organization', name: 'NEAGLE GOLF', url: SITE + '/', '@id': SITE + '/#organization' },
    publisher: { '@type': 'Organization', name: 'NEAGLE GOLF', url: SITE + '/', '@id': SITE + '/#organization' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': csUrl }
  };
  const related = caseStudies.filter(x => x.id !== c.id).slice(0, 3).map(x =>
    `<a href="${caseSlug(x)}" class="card-glow block rounded-2xl overflow-hidden bg-zinc-950/60 border border-white/8 p-4 hover:border-golfGreen/40 transition-all">
      <div class="aspect-[16/9] rounded-xl overflow-hidden mb-3 bg-zinc-900"><img src="${x.image}" alt="${esc(x.title)}" loading="lazy" class="w-full h-full object-cover"></div>
      <h4 class="text-sm font-semibold text-white">${esc(x.title)}</h4>
    </a>`).join('');
  addPage('case-studies/' + c.id + '/index.html', {
    title: `${shortLabel} Case Study | NEAGLE GOLF`,
    description: metaDesc,
    ogImage: c.image,
    extraHead: `<script type="application/ld+json">${JSON.stringify(csSchema)}</script>`,
    main: `
    ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Case Studies', href: '/case-studies/' }, { label: shortLabel }])}
    <section class="max-w-4xl mx-auto px-4 md:px-6 pt-10">
      <span class="text-[10px] md:text-xs uppercase tracking-widest text-golfGreen font-bold">Case Study</span>
      <h1 class="text-3xl md:text-5xl font-bold tracking-tight leading-tight mt-2 mb-6">${esc(c.title)}</h1>
      <div class="aspect-[16/9] rounded-3xl overflow-hidden bg-zinc-900 mb-8"><img src="${c.image}" alt="${esc(c.title)}" class="w-full h-full object-cover"></div>
      <p class="text-zinc-300 text-base leading-relaxed mb-6">${esc(c.description)}</p>
      ${factsHtml}
      <p class="text-zinc-400 text-sm leading-relaxed">This installation demonstrates how NEAGLE GOLF's tour-grade simulation and automation systems help ${esc(c.keywords || 'forward-thinking venues')} engage customers and unlock new value. Our concierge team handles planning, delivery, and on-site setup end to end.</p>
      <div class="mt-8"><a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow rounded-full px-8 py-3.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Start Your Project</a></div>
    </section>
    <section class="max-w-7xl mx-auto px-4 md:px-6 pt-16 pb-4">
      <h2 class="text-2xl font-bold text-white mb-6">More Case Studies</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">${related}</div>
    </section>`
  });
}

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

/* 6g. COMPARISON page (high-leverage GEO content) */
const sims = catalogDb.simulators.items;
const compareRows = (label, fn) =>
  `<tr class="border-b border-white/5"><th class="text-left py-4 pr-4 text-zinc-300 font-medium align-top w-40">${label}</th>${
    sims.map(p => `<td class="py-4 text-zinc-400 align-top">${fn(p)}</td>`).join('')
  }</tr>`;
addPage('golf-simulators/compare/index.html', {
  title: 'Golf Simulator Comparison | GOLFPAI S1 vs A1 vs X1 | NEAGLE GOLF',
  description: 'Compare NEAGLE GOLF golf simulators side by side — launch monitor type, projection, space needs, and best use case for each model.',
  main: `
  ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Golf Simulators', href: '/golf-simulators/' }, { label: 'Compare' }])}
  <section class="max-w-7xl mx-auto px-4 md:px-6 pt-10">
    <h1 class="text-3xl md:text-5xl font-bold tracking-tight mb-3">Golf Simulator Comparison</h1>
    <p class="text-zinc-400 max-w-2xl mb-10">Not sure which system fits your space and budget? Here is how our tour-grade simulators stack up across the factors that matter most.</p>
    <div class="overflow-x-auto rounded-2xl border border-white/5">
      <table class="w-full text-sm min-w-[640px]">
        <thead><tr class="border-b border-white/10">
          <th class="text-left p-4 text-zinc-400 font-medium">Feature</th>
          ${sims.map(p => `<th class="text-left p-4 text-white font-semibold">${esc(p.name)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${compareRows('Tagline', p => esc(p.tagline))}
          ${compareRows('Best for', p => (p.useCases || []).join(', '))}
          ${compareRows('Highlights', p => (p.highlights || []).slice(0, 2).join('; '))}
          ${compareRows('Space required', p => esc(p.spaceRequired || '—'))}
          ${compareRows('Indicative price', p => esc(p.price))}
          ${compareRows('Learn more', p => `<a href="${prodLink('simulators', p)}" class="text-golfGreen hover:underline">View details →</a>`)}
        </tbody>
      </table>
    </div>
    <p class="text-zinc-500 text-sm mt-6">Need a tailored recommendation? <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="text-golfGreen hover:underline">Talk to our concierge team</a> with your room dimensions and use case.</p>
  </section>`
});

/* 6h. BUYING GUIDE (knowledge / GEO answer content) */
addPage('golf-simulators/buying-guide/index.html', {
  title: 'How to Choose a Golf Simulator: The Complete Buying Guide | NEAGLE GOLF',
  description: 'A practical guide to choosing a golf simulator — launch monitor types, space and ceiling requirements, projection, and what commercial ranges vs home studios actually need.',
  main: `
  ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Golf Simulators', href: '/golf-simulators/' }, { label: 'Buying Guide' }])}
  <article class="max-w-3xl mx-auto px-4 md:px-6 pt-10 space-y-8">
    <header>
      <span class="text-[10px] md:text-xs uppercase tracking-widest text-golfGreen font-bold">Buying Guide</span>
      <h1 class="text-3xl md:text-5xl font-bold tracking-tight leading-tight mt-2">How to Choose a Golf Simulator</h1>
      <p class="text-zinc-400 mt-4 leading-relaxed">Whether you run a commercial driving range or plan a home studio, the right simulator comes down to tracking technology, available space, and how the system will actually be used. This guide breaks it down.</p>
    </header>
    <section><h2 class="text-2xl font-bold text-white mb-3">1. Launch monitor technology</h2><p class="text-zinc-400 leading-relaxed">Camera-based and radar-based (Doppler) systems each have trade-offs. Camera systems excel in controlled indoor light; radar tracks the full ball flight and is favored for outdoor-adjacent setups. NEAGLE GOLF simulators use tour-grade tracking for sub-millimeter accuracy.</p></section>
    <section><h2 class="text-2xl font-bold text-white mb-3">2. Space & ceiling height</h2><p class="text-zinc-400 leading-relaxed">Most enclosures need roughly 3 m (10 ft) of ceiling clearance and 4–5 m of depth. Measure swing space — especially for driver — before committing. Our team provides a free room-fit check during concierge onboarding.</p></section>
    <section><h2 class="text-2xl font-bold text-white mb-3">3. Projection & visuals</h2><p class="text-zinc-400 leading-relaxed">A 4K projector with a short-throw lens keeps the image sharp on a impact screen. Higher contrast and refresh rate reduce perceived latency between strike and ball flight.</p></section>
    <section><h2 class="text-2xl font-bold text-white mb-3">4. Commercial vs home</h2><p class="text-zinc-400 leading-relaxed">Commercial ranges need durable enclosures, cashless management, and self-service options (pair with our automated ball dispensers). Home studios prioritize footprint, aesthetics, and quick setup.</p></section>
    <section><h2 class="text-2xl font-bold text-white mb-3">5. Budget & support</h2><p class="text-zinc-400 leading-relaxed">Price varies widely by tracking tech and enclosure. Factor in installation, screens, and ongoing support. NEAGLE GOLF includes white-glove onboarding and 24/7 concierge support on every system.</p></section>
    <div class="p-8 rounded-3xl bg-gradient-to-tr from-zinc-950 to-zinc-900 border border-white/5 text-center">
      <h3 class="text-lg font-bold text-white mb-3">Still deciding?</h3>
      <a href="https://api.whatsapp.com/send?phone=13142242264" target="_blank" class="btn-glow rounded-full px-8 py-3.5 text-sm font-semibold inline-flex items-center gap-2"><i class="fa-brands fa-whatsapp"></i> Get a Free Recommendation</a>
    </div>
  </article>`
});

/* 6i. GUIDE PAGES — Cost / Room Size / Installation (high-intent GEO) */
const costPage = guideCostPage();
addPage('golf-simulators/cost/index.html', {
  title: 'Golf Simulator Cost & Pricing | NEAGLE GOLF',
  description: 'NEAGLE GOLF simulator and ball dispenser pricing — from the ' + catalogDb.simulators.items[catalogDb.simulators.items.length - 1].price + ' GOLFPAI X1 Smart Golf Simulator to the ' + catalogDb.simulators.items[0].price + ' S1 all-in-one. Compare by tracking, projection, and course library.',
  extraHead: `<script type="application/ld+json">${JSON.stringify(costPage.schema)}</script>`,
  main: costPage.main
});
const roomPage = guideRoomSizePage();
addPage('golf-simulators/room-size/index.html', {
  title: 'Golf Simulator Room Size & Space Requirements | NEAGLE GOLF',
  description: 'How much space do you need for a golf simulator? NEAGLE GOLF lists the System Size (equipment envelope) for each model, from launch monitors to all-in-one systems.',
  extraHead: `<script type="application/ld+json">${JSON.stringify(roomPage.schema)}</script>`,
  main: roomPage.main
});
const installPage = guideInstallationPage();
addPage('golf-simulators/installation/index.html', {
  title: 'Golf Simulator Installation Process | NEAGLE GOLF',
  description: 'How NEAGLE GOLF installs golf simulators: site survey, white-glove delivery, mounting, calibration, software activation, and on-site training with 24/7 support.',
  extraHead: `<script type="application/ld+json">${JSON.stringify(installPage.schema)}</script>`,
  main: installPage.main
});

/* ── 7. Write files + sitemap ─────────────────────────────────── */
fs.mkdirSync(DIST, { recursive: true });
for (const { relPath, opts } of pages) {
  const out = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(opts));
}

// sitemap.xml
const LASTMOD = new Date().toISOString().slice(0, 10);
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url><loc>${u}</loc><lastmod>${LASTMOD}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sm);

// robots.txt
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

// 404 fallback (Cloudflare Pages serves 404.html) — noindex, no canonical
fs.writeFileSync(path.join(DIST, '404.html'), page({
  title: 'Page Not Found | NEAGLE GOLF',
  description: 'The page you are looking for could not be found.',
  url: '/404.html',
  noindex: true,
  main: `<section class="max-w-3xl mx-auto px-4 text-center pt-32 pb-32"><h1 class="text-4xl font-bold mb-4">404</h1><p class="text-zinc-400 mb-8">The page you requested could not be found.</p><a href="/" class="btn-glow rounded-full px-8 py-3 text-sm font-semibold inline-flex items-center gap-2">Back to Home</a></section>`
}));

console.log(`✅ Generated ${pages.length} pages + sitemap.xml + robots.txt + 404.html into ./dist`);
console.log('   Pages:', sitemapUrls.length);

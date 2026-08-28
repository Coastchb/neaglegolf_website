/**
 * NEAGLE GOLF — Cloudflare Worker entry (paired with the static assets in ./dist).
 *
 * Enforces the canonical host + HTTPS with a single 301 redirect:
 *   http://neaglegolf.com/*      -> https://neaglegolf.com/*
 *   http://www.neaglegolf.com/*  -> https://neaglegolf.com/*
 *   https://www.neaglegolf.com/* -> https://neaglegolf.com/*
 *
 * workers.dev preview and local dev (wrangler dev) are served as-is.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname;

    // local dev (wrangler dev) — serve directly
    if (host === 'localhost' || host === '127.0.0.1') {
      return env.ASSETS.fetch(request);
    }

    // enforce canonical host only on the apex/www custom domain
    if (host === 'neaglegolf.com' || host === 'www.neaglegolf.com') {
      if (url.protocol !== 'https:' || host === 'www.neaglegolf.com') {
        const dest = new URL(url);
        dest.protocol = 'https:';
        dest.hostname = 'neaglegolf.com';
        dest.port = '';
        return Response.redirect(dest.toString(), 301);
      }
    }

    // workers.dev preview & everything else — serve static assets
    return env.ASSETS.fetch(request);
  }
};

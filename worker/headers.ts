import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';

/**
 * Security headers on every response. Static files get them from public/_headers (Cloudflare applies that file only to
 * files it serves itself); everything the Worker answers (API, images, item pages, robots.txt, sitemap) gets them
 * here. tests/headers.test.ts checks the two lists match.
 *
 * The Content-Security-Policy only covers framing, plugins, <base> and form targets. Scripts, styles and images
 * aren't restricted: index.html has inline scripts and artwork can be linked from any https site.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  // Older browsers' equivalent of frame-ancestors: no other site can show these pages in a frame (clickjacking).
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // HTTPS only from here on (workers.dev already is; this covers a custom domain). No includeSubDomains, so other
  // sites on the same domain aren't affected.
  'Strict-Transport-Security': 'max-age=31536000',
};

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  // A fresh Response, since one passed through from fetch() can have read-only headers.
  c.res = new Response(c.res.body, c.res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
};

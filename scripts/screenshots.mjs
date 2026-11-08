// Takes the README screenshots in docs/screenshots/, as WebP.
//
// Builds the site, runs it with `wrangler dev` against a throwaway local database, loads the made-up catalog in
// scripts/demo-catalog.json, and captures pages in Chromium. Artwork is drawn on the fly, so no studio's posters or
// covers appear, and your own local database is never touched. The site follows the visitor's clock, so the browser
// clock is fixed: an afternoon for the light shots, the night for the dark ones. Needs Playwright with Chromium
// installed (it isn't a dependency of the site):
//
//   node scripts/screenshots.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'docs', 'screenshots');
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ART = 'https://art.stacks-demo.example';
const catalog = JSON.parse(readFileSync(join(ROOT, 'scripts', 'demo-catalog.json'), 'utf8'));
const { chromium } = createRequire(import.meta.url)('playwright');

// ---- Drawn artwork ----------------------------------------------------------------------------------------------

const hueOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const titleOf = (id) => catalog.items.find((i) => i.id === id)?.title.en ?? '';
const personOf = (id) => catalog.people.find((p) => p.id === id);

/** A poster-like picture: a gradient, a few shapes and the title. */
function artSvg(kind, id) {
  const h = hueOf(id);
  const [w, ht] = kind === 'backdrop' ? [1280, 720] : kind === 'poster' ? [600, 900] : kind === 'photo' ? [400, 400] : [600, 600];
  const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 58%)"/>
    <stop offset="1" stop-color="hsl(${(h + 60) % 360} 60% 28%)"/></linearGradient></defs><rect width="${w}" height="${ht}" fill="url(#g)"/>`;
  if (kind === 'photo') {
    const p = personOf(id);
    const initials = (p?.name.en ?? '?').split(' ').map((s) => s[0]).join('').slice(0, 2);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}">${bg}<circle cx="200" cy="160" r="80" fill="#fff" opacity=".85"/>
      <path d="M70 400 Q200 230 330 400 Z" fill="#fff" opacity=".85"/><text x="200" y="178" font-family="Georgia,serif" font-size="56" text-anchor="middle"
      fill="hsl(${h} 50% 30%)">${esc(initials)}</text></svg>`;
  }
  const shapes = [0, 1, 2].map((i) => {
    const r = (ht / 5) * (1 + ((h + i * 47) % 3) / 2);
    return `<circle cx="${(w * (0.25 + i * 0.3)) | 0}" cy="${(ht * (0.3 + ((h + i * 13) % 40) / 100)) | 0}" r="${r | 0}" fill="hsl(${(h + i * 40) % 360} 80% 75%)" opacity=".35"/>`;
  }).join('');
  const title = kind === 'backdrop' ? '' : `<text x="${w / 2}" y="${ht - (kind === 'poster' ? 110 : 70)}" font-family="Georgia,serif" font-weight="700"
    font-size="${kind === 'poster' ? 54 : 46}" text-anchor="middle" fill="#fff">${esc(titleOf(id))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}">${bg}${shapes}${title}</svg>`;
}

// ---- The site, against a throwaway database ---------------------------------------------------------------------

const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });

async function startSite(state) {
  run('npm', ['run', 'build']);
  run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state]);
  const server = spawn('npx', ['wrangler', 'dev', '-c', 'dist/the_stacks/wrangler.json', '--local', '--persist-to', state,
    '--port', String(PORT), '--ip', '127.0.0.1', '--var', 'DEV_AUTH_BYPASS:true'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/catalog`)).ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop(server);
  throw new Error(`The site didn't start on port ${PORT}`);
}

/** Stops wrangler and the workerd processes it started (they share a process group). */
function stop(server) {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function admin(method, path, body) {
  const res = await fetch(`${BASE}/api/admin${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`);
  return data;
}

async function loadDemo() {
  // Leave the drawn artwork linked: there's nothing real to copy into storage.
  await admin('PUT', '/settings', { keepCopies: false });
  await admin('POST', '/ingest/preview', { file: catalog, decisions: {} });
  await admin('POST', '/ingest/apply', { file: catalog, decisions: {}, filename: 'demo-catalog.json' });
}

// ---- Pictures ---------------------------------------------------------------------------------------------------

const SHOTS = [
  { name: 'home', path: '/', width: 1280, height: 900 },
  { name: 'detail', path: '/title/signal-to-noise', width: 1280, height: 900 },
  { name: 'browse', path: '/watch', width: 1280, height: 900 },
  { name: 'japanese', path: '/?lang=ja', width: 1280, height: 900 },
  { name: 'phone', path: '/game/lighthouse-keeper', width: 390, height: 600, phone: true },
];

// Light and dark come from the time of day: 14:00 is "afternoon", 22:30 is "night".
const TIMES = { light: '2026-11-08T14:00:00', dark: '2026-11-08T22:30:00' };

/** WebP is a fraction of PNG's size. Chromium's canvas encodes it, so nothing else needs installing. */
async function toWebp(page, png) {
  const dataUrl = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.9);
  }, png.toString('base64'));
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

const state = mkdtempSync(join(tmpdir(), 'stacks-screenshots-'));
let server;
try {
  server = await startSite(state);
  await loadDemo();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [scheme, time] of Object.entries(TIMES)) {
      for (const shot of SHOTS) {
        const context = await browser.newContext({
          viewport: { width: shot.width, height: shot.height },
          deviceScaleFactor: 2,
          timezoneId: 'UTC',
          locale: 'en-US',
          reducedMotion: 'reduce',
          ...(shot.phone ? { isMobile: true, hasTouch: true } : {}),
        });
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date(`${time}Z`));
        await page.route(`${ART}/**`, (route) => {
          const [, kind, file] = new URL(route.request().url()).pathname.split('/');
          return route.fulfill({ contentType: 'image/svg+xml', body: artSvg(kind, file.replace(/\.svg$/, '')) });
        });
        await page.goto(`${BASE}${shot.path}`);
        await page.locator('main').first().waitFor();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (sideways) console.warn(`${shot.name} (${scheme}) scrolls sideways`);
        const file = join(OUT, `${shot.name}-${scheme}.webp`);
        writeFileSync(file, await toWebp(page, await page.screenshot()));
        console.log(`Saved ${file}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  if (server) stop(server);
  rmSync(state, { recursive: true, force: true });
}

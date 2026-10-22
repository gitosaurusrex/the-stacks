import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from '../worker/index';
import type { Bindings } from '../worker/env';
import type { CompanyDoc, GenreDoc, ItemDoc, PersonDoc } from '../src/shared/schema';

/**
 * The Worker's API end to end, against a real (in-memory) local D1 database from Wrangler: the admin ingests the
 * example catalog, edits and deletes records and switches sections, and the public catalog reflects it.
 */

const seed = JSON.parse(readFileSync(new URL('../seed/example-catalog.json', import.meta.url), 'utf8'));

let proxy: Awaited<ReturnType<typeof getPlatformProxy<Bindings>>>;
let env: Bindings;

beforeAll(async () => {
  // No .env / .dev.vars, so a developer's TMDB key can't make these tests call out.
  proxy = await getPlatformProxy<Bindings>({ persist: false, envFiles: [], remoteBindings: false });
  // The admin bypass only works on localhost, which is where these requests go.
  env = { DB: proxy.env.DB, DEV_AUTH_BYPASS: 'true' };
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8').replace(/^--.*$/gm, '');
    for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await env.DB.prepare(stmt).run();
  }
}, 30_000);

afterAll(() => proxy?.dispose());

const call = (path: string, init: RequestInit = {}) => app.request(`http://localhost${path}`, init, env);
const send = (method: string, path: string, body: unknown) =>
  call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

interface Catalog { items: ItemDoc[]; people: PersonDoc[]; companies: CompanyDoc[]; genres: GenreDoc[] }
const catalog = async () => (await (await call('/api/catalog')).json()) as Catalog;

describe('ingest → public catalog', () => {
  it('previews, then applies the example catalog', async () => {
    const preview = await (await send('POST', '/api/admin/ingest/preview', { file: seed })).json();
    expect(preview.fileErrors).toEqual([]);
    expect(preview.counts.error).toBe(0);

    const res = await send('POST', '/api/admin/ingest/apply', { file: seed, filename: 'example-catalog.json' });
    expect(res.status).toBe(200);
    const { ingestId, summary } = await res.json();
    const total = seed.items.length + seed.people.length + seed.companies.length + seed.genres.length;
    expect(summary.counts.added).toBe(total);

    const recent = await (await call('/api/admin/ingests')).json();
    expect(recent[0]).toMatchObject({ id: ingestId, filename: 'example-catalog.json' });
  });

  it('serves every item, with an item medium derived from its kind', async () => {
    const c = await catalog();
    expect(c.items).toHaveLength(seed.items.length);
    const game = c.items.find((i) => i.kind === 'game')!;
    expect(game.medium).toBe('play');
    expect(game.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('re-applying the same file changes nothing', async () => {
    const preview = await (await send('POST', '/api/admin/ingest/preview', { file: seed })).json();
    expect(preview.counts.unchanged).toBe(preview.entries.length);
  });
});

describe('admin edits', () => {
  it('saves an edit and the catalog shows it', async () => {
    const item = (await catalog()).items[0];
    const res = await send('PUT', `/api/admin/entities/item/${item.id}`, { ...item, summary: { ...item.summary, en: 'An edited summary.' } });
    expect(res.status).toBe(200);
    expect((await catalog()).items.find((i) => i.id === item.id)!.summary.en).toBe('An edited summary.');
  });

  it("won't delete a person an item still credits", async () => {
    const item = (await catalog()).items.find((i) => i.directors?.length)!;
    const res = await call(`/api/admin/entities/person/${item.directors![0]}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
    expect((await res.json()).referencedBy.map((r: { id: string }) => r.id)).toContain(item.id);
  });

  it('deletes an item, and its people stop being listed once nothing uses them', async () => {
    const c = await catalog();
    const credited = (p: string, items: ItemDoc[]) => items.some((i) => [i.directors, i.cast, i.artists, i.creators].some((l) => l?.includes(p)));
    // An item with someone credited on nothing else.
    const item = c.items.find((i) => (i.directors ?? []).some((p) => !credited(p, c.items.filter((o) => o.id !== i.id))))!;
    const only = item.directors!.find((p) => !credited(p, c.items.filter((o) => o.id !== item.id)))!;

    expect((await call(`/api/admin/entities/item/${item.id}`, { method: 'DELETE' })).status).toBe(200);
    const after = await catalog();
    expect(after.items.map((i) => i.id)).not.toContain(item.id);
    expect(after.people.map((p) => p.id)).not.toContain(only);
    // Still in the database for the admin.
    const all = await (await call('/api/admin/all')).json();
    expect(all.people.map((p: PersonDoc) => p.id)).toContain(only);
  });
});

describe('section switches', () => {
  it('hides a switched-off section, its genres and its studios from the public catalog', async () => {
    expect((await send('PUT', '/api/admin/settings', { media: { play: false } })).status).toBe(200);
    const c = await catalog();
    expect(c.items.some((i) => i.medium === 'play')).toBe(false);
    expect(c.genres.some((g) => g.medium === 'play')).toBe(false);
    const studioIds = new Set(c.items.flatMap((i) => [...(i.developers ?? []), ...(i.publishers ?? [])]));
    expect(c.companies.every((s) => studioIds.has(s.id))).toBe(true);

    await send('PUT', '/api/admin/settings', { media: { play: true } });
    expect((await catalog()).items.some((i) => i.medium === 'play')).toBe(true);
  });
});

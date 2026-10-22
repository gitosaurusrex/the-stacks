import { Hono } from 'hono';
import { analyze, SECTION, summarize, writesFor, type Decision, type IngestFile } from '../src/shared/ingest';
import { ENTITY_TYPES, hasText, IMAGE_FIELDS, isStoredImage, LANGS, MEDIA, type AnyDoc, type EntityType, type I18n, type ItemDoc, type Medium, type PersonDoc, type SiteSettings } from '../src/shared/schema';
import { normalize, referencesOf } from '../src/shared/validate';
import { ArtError, artStatus, fillPerson, findArt, type Credit } from './art';
import { fillDoc, gapsOf, labelOf, TranslateError } from './translate';
import { fillPlan, planKeys } from '../src/shared/fill';
import { login, logout, requireAdmin } from './auth';
import { entitiesVersion, getEntity, getSettings, loadAll, putSetting, upsert } from './db';
import type { AppEnv } from './env';
import { importImage, MediaError, serveImage, storeImage } from './media';

const app = new Hono<AppEnv>().basePath('/api');

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong on the server.' }, 500);
});

// ───────────────────────────── Public ─────────────────────────────

/** Weak ETag for the catalog: the stored records' version, the settings and the deployed Worker version. */
async function catalogTag(version: string, settings: SiteSettings, deployed = '') {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${deployed}|${version}|${JSON.stringify(settings)}`));
  return `W/"${[...new Uint8Array(digest).subarray(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('')}"`;
}

const matchesTag = (header: string | undefined, tag: string) => !!header && header.split(',').some((t) => t.trim() === tag);

/** Everything the public site needs, minus any medium that's switched off. */
app.get('/catalog', async (c) => {
  // Always revalidated, so admin edits and section switches show up immediately; when nothing changed, the
  // browser's copy is reused (304) without reading every record.
  c.header('Cache-Control', 'no-cache');
  const [version, settings] = await Promise.all([entitiesVersion(c.env.DB), getSettings(c.env.DB)]);
  const tag = await catalogTag(version, settings, c.env.CF_VERSION_METADATA?.id);
  c.header('ETag', tag);
  if (matchesTag(c.req.header('If-None-Match'), tag)) return c.body(null, 304);

  const all = await loadAll(c.env.DB);
  const items = [...all.item.values()].filter((i) => settings.media[(i as ItemDoc).medium]) as ItemDoc[];
  const used = new Set(items.flatMap((i) => referencesOf('item', i).map((r) => r.key)));
  const pick = (type: EntityType) => [...all[type].values()].filter((d) => used.has(`${type}:${d.id}`));
  return c.json({
    settings,
    items,
    people: pick('person'),
    companies: pick('company'),
    genres: [...all.genre.values()].filter((g) => settings.media[(g as { medium: Medium }).medium]),
  });
});

// ───────────────────────────── Admin ─────────────────────────────

const admin = new Hono<AppEnv>();
// Registered before the guard, so they're reachable while signed out.
admin.post('/login', login);
admin.post('/logout', logout);
admin.use('*', requireAdmin);

admin.get('/me', (c) => c.json({ email: c.get('adminEmail') }));

/** Everything, including hidden media — the admin sees it all. */
admin.get('/all', async (c) => {
  const [all, settings] = await Promise.all([loadAll(c.env.DB), getSettings(c.env.DB)]);
  return c.json({
    settings,
    items: [...all.item.values()],
    people: [...all.person.values()],
    companies: [...all.company.values()],
    genres: [...all.genre.values()],
  });
});

const isType = (t: string): t is EntityType => (ENTITY_TYPES as string[]).includes(t);

function referencedBy(all: Awaited<ReturnType<typeof loadAll>>, type: EntityType, id: string) {
  if (type === 'item') return [];
  const key = `${type}:${id}`;
  return [...all.item.values()]
    .filter((i) => referencesOf('item', i).some((r) => r.key === key))
    .map((i) => ({ id: i.id, title: (i as ItemDoc).title, kind: (i as ItemDoc).kind }));
}

admin.get('/entities/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  if (!isType(type)) return c.notFound();
  const all = await loadAll(c.env.DB);
  const doc = all[type].get(id);
  if (!doc) return c.json({ error: 'Not found.' }, 404);
  return c.json({ doc, referencedBy: referencedBy(all, type, id) });
});

async function validateForSave(db: D1Database, type: EntityType, body: unknown) {
  const { doc, errors, warnings } = normalize(type, body);
  if (!doc) return { errors, warnings };
  if (type === 'item') {
    const all = await loadAll(db);
    for (const r of referencesOf('item', doc)) {
      const [t, ...rest] = r.key.split(':');
      if (!all[t as EntityType].has(rest.join(':'))) errors.push(`${r.field} → "${r.id}" doesn't exist yet — create it first`);
    }
  }
  return { doc: errors.length ? undefined : doc, errors, warnings };
}

admin.post('/entities/:type', async (c) => {
  const { type } = c.req.param();
  if (!isType(type)) return c.notFound();
  const { doc, errors, warnings } = await validateForSave(c.env.DB, type, await c.req.json());
  if (!doc) return c.json({ errors, warnings }, 400);
  if (await getEntity(c.env.DB, type, doc.id)) return c.json({ errors: [`"${doc.id}" already exists — pick a different id.`], warnings }, 409);
  const toSave = type === 'item' ? { ...(doc as ItemDoc), added: (doc as ItemDoc).added ?? new Date().toISOString().slice(0, 10) } : doc;
  await upsert(c.env.DB, type, toSave).run();
  return c.json({ doc: toSave, warnings }, 201);
});

admin.put('/entities/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  if (!isType(type)) return c.notFound();
  const current = await getEntity(c.env.DB, type, id);
  if (!current) return c.json({ errors: ['This record no longer exists.'] }, 404);
  const body = (await c.req.json()) as Record<string, unknown>;
  if (type !== 'genre') body.id = id; // ids are permanent once created
  const { doc, errors, warnings } = await validateForSave(c.env.DB, type, body);
  if (!doc) return c.json({ errors, warnings }, 400);
  if (doc.id !== id) return c.json({ errors: ["A genre's section and slug can't change. Create a new genre instead."], warnings }, 400);
  const toSave: AnyDoc = type === 'item' ? { ...(doc as ItemDoc), added: (doc as ItemDoc).added ?? (current as ItemDoc).added } : doc;
  await upsert(c.env.DB, type, toSave).run();
  return c.json({ doc: toSave, warnings });
});

admin.delete('/entities/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  if (!isType(type)) return c.notFound();
  const all = await loadAll(c.env.DB);
  const refs = referencedBy(all, type, id);
  if (refs.length) {
    return c.json({ error: `Still used by ${refs.length} item(s). Remove it from them first.`, referencedBy: refs }, 409);
  }
  await c.env.DB.prepare('DELETE FROM entities WHERE type = ? AND id = ?').bind(type, id).run();
  return c.json({ ok: true });
});

admin.put('/settings', async (c) => {
  const body = (await c.req.json()) as Partial<SiteSettings>;
  const current = await getSettings(c.env.DB);
  const stmts = [];
  if (body.media) {
    const media = { ...current.media };
    for (const m of MEDIA) if (typeof body.media[m] === 'boolean') media[m] = body.media[m];
    stmts.push(putSetting(c.env.DB, 'media', media));
  }
  if (typeof body.keepCopies === 'boolean') stmts.push(putSetting(c.env.DB, 'keepCopies', body.keepCopies));
  if (body.text) {
    const text = { ...current.text };
    for (const k of Object.keys(text) as (keyof SiteSettings['text'])[]) {
      const v = body.text[k] as I18n | undefined;
      if (v?.en) text[k] = Object.fromEntries(LANGS.filter((l) => v[l]).map((l) => [l, String(v[l]).trim()])) as unknown as I18n;
    }
    stmts.push(putSetting(c.env.DB, 'text', text));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json(await getSettings(c.env.DB));
});

// ── Batch ingest ──

admin.post('/ingest/preview', async (c) => {
  const { file, decisions } = (await c.req.json()) as { file: IngestFile; decisions?: Record<string, Decision> };
  return c.json(analyze(file, await loadAll(c.env.DB), decisions ?? {}));
});

admin.post('/ingest/apply', async (c) => {
  const { file, decisions, filename } = (await c.req.json()) as { file: IngestFile; decisions?: Record<string, Decision>; filename?: string };
  const plan = analyze(file, await loadAll(c.env.DB), decisions ?? {});
  if (plan.fileErrors.length) return c.json({ error: plan.fileErrors.join(' ') }, 400);
  if (plan.undecided) return c.json({ error: `${plan.undecided} changed record(s) still need a decision.` }, 400);

  const summary = summarize(plan, filename);
  const writes = writesFor(plan);
  // One batch = one transaction: either everything is saved or nothing is.
  const results = await c.env.DB.batch([
    ...writes.map((w) => upsert(c.env.DB, w.type, w.doc)),
    c.env.DB.prepare('INSERT INTO ingests (filename, summary) VALUES (?, ?) RETURNING id').bind(filename ?? null, JSON.stringify(summary)),
  ]);
  const ingestId = (results.at(-1)!.results[0] as { id: number }).id;
  return c.json({ ingestId, summary });
});

admin.get('/ingests', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, created_at, filename, summary FROM ingests ORDER BY id DESC LIMIT 50').all<{ id: number; created_at: string; filename: string | null; summary: string }>();
  return c.json(results.map((r) => ({ id: r.id, created_at: r.created_at, filename: r.filename, counts: JSON.parse(r.summary).counts })));
});

admin.get('/ingests/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT id, created_at, filename, summary FROM ingests WHERE id = ?').bind(Number(c.req.param('id'))).first<{ id: number; created_at: string; filename: string | null; summary: string }>();
  if (!row) return c.json({ error: 'Not found.' }, 404);
  return c.json({ ...row, summary: JSON.parse(row.summary) });
});

/** Download everything in the same format the ingest accepts (a backup, and a template). */
admin.get('/export', async (c) => {
  const all = await loadAll(c.env.DB);
  const file: Record<string, unknown> = { version: 1 };
  for (const type of ENTITY_TYPES) {
    file[SECTION[type]] = [...all[type].values()].map((d) => {
      if (type === 'item') { const { medium: _m, ...rest } = d as ItemDoc; return rest; }
      if (type === 'genre') { const { id: _id, ...rest } = d as AnyDoc & { id: string }; return rest; }
      return d;
    });
  }
  c.header('Content-Disposition', `attachment; filename="fyc-export-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(file);
});

// ── Images ──

const mediaError = (e: unknown) => {
  if (e instanceof MediaError || e instanceof ArtError || e instanceof TranslateError) return { error: e.message };
  throw e;
};

/** Upload: the request body is the image file itself. */
admin.post('/media', async (c) => {
  try {
    const url = await storeImage(c.env, new Uint8Array(await c.req.arrayBuffer()));
    return c.json({ url });
  } catch (e) { return c.json(mediaError(e), 400); }
});

/** Copy an image from another site into storage. */
admin.post('/media/import', async (c) => {
  const { url } = (await c.req.json()) as { url?: string };
  try {
    return c.json({ url: await importImage(c.env, String(url ?? '')) });
  } catch (e) { return c.json(mediaError(e), 400); }
});

/**
 * Copy a few externally-linked images into storage and point the records at the copies.
 * Called repeatedly by the admin (small batches keep each request well inside Worker limits).
 */
admin.post('/media/mirror', async (c) => {
  const { limit = 6, skip = [] } = (await c.req.json().catch(() => ({}))) as { limit?: number; skip?: string[] };
  const all = await loadAll(c.env.DB);
  const jobs: { type: EntityType; doc: AnyDoc; field: string; url: string }[] = [];
  for (const type of ['item', 'person', 'company'] as const)
    for (const doc of all[type].values())
      for (const field of IMAGE_FIELDS) {
        const url = (doc as unknown as Record<string, string | undefined>)[field];
        if (url && !isStoredImage(url) && !skip.includes(url)) jobs.push({ type, doc, field, url });
      }

  const batch = jobs.slice(0, Math.min(Math.max(1, limit), 10));
  const updated = new Map<string, { type: EntityType; doc: Record<string, unknown> }>();
  const failed: { label: string; field: string; url: string; error: string }[] = [];
  for (const job of batch) {
    try {
      const stored = await importImage(c.env, job.url);
      const key = `${job.type}:${job.doc.id}`;
      const entry = updated.get(key) ?? { type: job.type, doc: { ...job.doc } as Record<string, unknown> };
      entry.doc[job.field] = stored;
      updated.set(key, entry);
    } catch (e) {
      const label = (job.doc as { title?: I18n; name?: I18n }).title?.en ?? (job.doc as { name?: I18n }).name?.en ?? job.doc.id;
      failed.push({ label, field: job.field, url: job.url, error: e instanceof Error ? e.message : 'failed' });
    }
  }
  if (updated.size) await c.env.DB.batch([...updated.values()].map((u) => upsert(c.env.DB, u.type, u.doc as unknown as AnyDoc)));
  return c.json({ copied: batch.length - failed.length, failed, remaining: jobs.length - batch.length });
});

admin.get('/art/status', (c) => c.json(artStatus(c.env)));

/** What each person is credited on here, used to confirm which TMDB person they are. */
function creditsByPerson(all: Awaited<ReturnType<typeof loadAll>>) {
  const credits = new Map<string, Credit[]>();
  for (const item of all.item.values() as Iterable<ItemDoc>) {
    for (const field of ['directors', 'cast', 'artists', 'creators'] as const) {
      for (const id of (item[field] as string[] | undefined) ?? []) {
        const list = credits.get(id) ?? [];
        list.push({ title: item.title?.en ?? '', tmdb_id: item.tmdb_id, kind: item.kind });
        credits.set(id, list);
      }
    }
  }
  return credits;
}

/** Someone needs filling when they have no photo or no bio (in either language). */
const needsFill = (p: PersonDoc) => !p.photo || !hasText(p.bio);

/**
 * Fill in missing headshots and bios from TMDB for a few people at a time (called repeatedly by the
 * Dashboard). Only empty fields are filled, and only when TMDB's credits confirm it's the same person.
 */
admin.post('/people/fill', async (c) => {
  const { limit = 4, skip = [] } = (await c.req.json().catch(() => ({}))) as { limit?: number; skip?: string[] };
  const [all, settings] = await Promise.all([loadAll(c.env.DB), getSettings(c.env.DB)]);
  const credits = creditsByPerson(all);
  const jobs = ([...all.person.values()] as PersonDoc[]).filter((p) => needsFill(p) && !skip.includes(p.id));
  // Each person takes up to seven TMDB calls (search, up to three candidates, three translated bios) plus an image
  // copy: eight outside requests. Four people per request is 32, under the free plan's limit of 50.
  const batch = jobs.slice(0, Math.min(Math.max(1, limit), 4));
  const filled: { id: string; label: string; got: string[] }[] = [];
  const failed: { id: string; label: string; error: string }[] = [];
  const updated: PersonDoc[] = [];
  for (const p of batch) {
    const label = p.name?.en ?? p.id;
    try {
      const found = await fillPerson(c.env, p, credits.get(p.id) ?? []);
      if (typeof found.photo === 'string' && settings.keepCopies) {
        try { found.photo = await importImage(c.env, found.photo); } catch { /* keep the TMDB link */ }
      }
      updated.push({ ...p, ...found, sources: { ...p.sources, ...found.sources } } as PersonDoc);
      filled.push({ id: p.id, label, got: ['photo', 'bio'].filter((k) => k in found) });
    } catch (e) {
      if (!(e instanceof ArtError) && !(e instanceof MediaError)) throw e;
      failed.push({ id: p.id, label, error: e.message });
    }
  }
  if (updated.length) await c.env.DB.batch(updated.map((p) => upsert(c.env.DB, 'person', p)));
  return c.json({ filled, failed, remaining: jobs.length - batch.length });
});

// ── Translations: TMDB first, then Cloudflare AI ──

/**
 * "Fill in missing" on an edit page: fill the chosen empty fields (`only`: keys from the record's fill plan) for
 * the form. Nothing is saved; the editor reviews and saves.
 */
admin.post('/fill', async (c) => {
  const { type, doc, only } = (await c.req.json()) as { type: EntityType; doc: AnyDoc; only?: string[] };
  const [all, settings] = await Promise.all([loadAll(c.env.DB), getSettings(c.env.DB)]);
  try {
    return c.json(await fillDoc(c.env, type, doc, {
      only,
      credits: type === 'person' ? creditsByPerson(all).get(doc.id) ?? [] : [],
      copyImage: settings.keepCopies ? (url) => importImage(c.env, url) : undefined,
    }));
  } catch (e) { return c.json(mediaError(e), 400); }
});

/** How many records still have empty translations the fill could cover (Dashboard count). */
admin.get('/translate/status', async (c) => {
  const all = await loadAll(c.env.DB);
  let records = 0, fields = 0;
  for (const type of ['genre', 'person', 'item'] as const) for (const doc of all[type].values()) {
    const gaps = gapsOf(type, doc).length;
    if (gaps) { records++; fields += gaps; }
  }
  return c.json({ records, fields, ai: !!c.env.AI, tmdb: !!c.env.TMDB_API_KEY });
});

/**
 * Fill empty translations everywhere, a few records per request (called repeatedly by the Dashboard), saving as
 * it goes. The Dashboard passes back every record it has already done, so each runs once per pass.
 */
admin.post('/translate/fill', async (c) => {
  const { limit = 3, skip = [] } = (await c.req.json().catch(() => ({}))) as { limit?: number; skip?: string[] };
  const all = await loadAll(c.env.DB);
  const credits = creditsByPerson(all);
  const jobs: { type: EntityType; doc: AnyDoc; key: string }[] = [];
  for (const type of ['genre', 'person', 'item'] as const) for (const doc of all[type].values()) {
    const key = `${type}:${doc.id}`;
    if (!skip.includes(key) && gapsOf(type, doc).length) jobs.push({ type, doc, key });
  }
  // A person can take seven TMDB calls; three records per request stays well under Workers' limits.
  const batch = jobs.slice(0, Math.min(Math.max(1, limit), 3));
  const filled: { key: string; label: string; got: Record<string, 'tmdb' | 'ai'> }[] = [];
  const notes: { key: string; label: string; note: string }[] = [];
  const writes = [];
  const done: string[] = [];
  let stopped: string | undefined;
  for (const job of batch) {
    done.push(job.key);
    const label = labelOf(job.type, job.doc);
    // Translations only here; the Dashboard's headshots-and-bios step fills photos and English bios.
    const only = planKeys(fillPlan(job.type, job.doc, !!c.env.TMDB_API_KEY).filter((r) => r.via === 'translate'));
    const r = await fillDoc(c.env, job.type, job.doc, { only, credits: job.type === 'person' ? credits.get(job.doc.id) ?? [] : [] });
    if (Object.keys(r.filled).length) {
      writes.push(upsert(c.env.DB, job.type, { ...job.doc, ...r.patch } as AnyDoc));
      filled.push({ key: job.key, label, got: r.filled });
    }
    for (const note of r.notes) notes.push({ key: job.key, label, note });
    if (r.aiStopped) { stopped = r.aiStopped; break; }
  }
  if (writes.length) await c.env.DB.batch(writes);
  return c.json({ filled, notes, done, remaining: stopped ? 0 : jobs.length - batch.length, ...(stopped ? { stopped } : {}) });
});

/** Look up official artwork for a record (TMDB for films/TV/people, Wikipedia for games, Spotify for music). */
admin.post('/art/search', async (c) => {
  const { type, doc } = (await c.req.json()) as { type: EntityType; doc: AnyDoc };
  try {
    return c.json({ candidates: await findArt(c.env, type, doc) });
  } catch (e) { return c.json(mediaError(e), 400); }
});

app.route('/admin', admin);
app.all('*', (c) => c.json({ error: 'Not found.' }, 404));

/** The Worker: stored images at /media/*, everything else under /api. */
const site = new Hono<AppEnv>();
site.get('/media/:key', (c) => serveImage(c.env, c.req.param('key'), c.req.raw));
site.route('/', app);

export default site satisfies ExportedHandler<AppEnv['Bindings']>;

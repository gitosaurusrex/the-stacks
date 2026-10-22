import { DEFAULT_SETTINGS, ENTITY_TYPES, type AnyDoc, type EntityType, type SiteSettings } from '../src/shared/schema';
import type { Existing } from '../src/shared/ingest';

export async function loadAll(db: D1Database): Promise<Existing> {
  const { results } = await db.prepare('SELECT type, id, data FROM entities').all<{ type: EntityType; id: string; data: string }>();
  const out = Object.fromEntries(ENTITY_TYPES.map((t) => [t, new Map<string, AnyDoc>()])) as Existing;
  for (const r of results) out[r.type]?.set(r.id, JSON.parse(r.data));
  return out;
}

export async function getEntity(db: D1Database, type: EntityType, id: string): Promise<AnyDoc | null> {
  const row = await db.prepare('SELECT data FROM entities WHERE type = ? AND id = ?').bind(type, id).first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}

export const upsert = (db: D1Database, type: EntityType, doc: AnyDoc) =>
  db.prepare(
    `INSERT INTO entities (type, id, data) VALUES (?, ?, ?)
     ON CONFLICT (type, id) DO UPDATE SET data = excluded.data, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(type, doc.id, JSON.stringify(doc));

export async function getSettings(db: D1Database): Promise<SiteSettings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const r of results) {
    if (r.key === 'media') Object.assign(s.media, JSON.parse(r.value));
    if (r.key === 'text') {
      // Only known keys, so text saved by older versions (e.g. a single `greeting`) is ignored.
      const saved = JSON.parse(r.value) as Partial<SiteSettings['text']>;
      for (const k of Object.keys(s.text) as (keyof SiteSettings['text'])[]) {
        const v = saved[k];
        if (!v?.en) continue;
        // Untouched default text picks up translations added later (e.g. new languages); edited text is kept as written.
        s.text[k] = v.en === DEFAULT_SETTINGS.text[k].en ? { ...DEFAULT_SETTINGS.text[k], ...v } : v;
      }
    }
    if (r.key === 'keepCopies') s.keepCopies = JSON.parse(r.value) === true;
  }
  return s;
}

/**
 * Changes whenever the stored records could have: every insert and update moves the latest updated_at, and every
 * delete changes the count. Two cheap aggregates instead of reading every record.
 */
export async function entitiesVersion(db: D1Database): Promise<string> {
  const row = await db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS at FROM entities').first<{ n: number; at: string | null }>();
  return `${row?.n ?? 0}@${row?.at ?? ''}`;
}

export const putSetting = (db: D1Database, key: string, value: unknown) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value));

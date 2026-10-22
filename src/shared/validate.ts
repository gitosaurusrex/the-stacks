import {
  fieldsFor, isDate, isHttpUrl, isLang, LANG_INFO, LANGS, MEDIA_PREFIX, KIND_MEDIUM, PLATFORMS, slugify, genreKey, TRANSLATIONS,
  type AnyDoc, type EntityType, type FieldSpec, type I18n, type ItemKind, type Medium, type Sources,
} from './schema';

export interface Normalized<T = AnyDoc> {
  doc: T | null;
  errors: string[];
  warnings: string[];
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isEmpty = (v: unknown) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(isEmpty));

/** Remove empty values so stored documents stay tidy and comparisons are stable. */
export function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isEmpty(v)) continue;
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? compact(v as object) : v;
  }
  return out as T;
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s || undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === 0 || v === '0' || v === 'no' || v === '') return false;
  return undefined;
}

function asList(v: unknown): string[] | undefined {
  if (v == null || v === '') return undefined;
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [v];
  const out = arr.map(asString).filter((x): x is string => !!x);
  return out.length ? [...new Set(out)] : undefined;
}

/**
 * Validate and clean one record. Accepts friendly input: a plain string for a translated
 * field means English; a comma-separated string works for lists; "true"/"false" for flags.
 */
export function normalize(type: EntityType, raw: unknown): Normalized {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { doc: null, errors: ['not an object'], warnings };
  const input = raw as Record<string, unknown>;

  let kind: ItemKind | undefined;
  if (type === 'item') {
    kind = asString(input.kind) as ItemKind | undefined;
    if (!kind || !(kind in KIND_MEDIUM)) {
      return { doc: null, errors: [`"kind" must be one of: ${Object.keys(KIND_MEDIUM).join(', ')}`], warnings };
    }
  }
  const fields = fieldsFor(type, kind);
  // Fields the site fills in itself: an item's medium (from its kind) and a game's year (from its release dates).
  // Saved records and exports include them, so they're accepted here rather than reported as unknown.
  const derived = type === 'item' ? ['medium', ...(KIND_MEDIUM[kind!] === 'play' ? ['year'] : [])] : [];
  // Fields the site no longer has. Older exports and files still contain them, so they're dropped without a warning.
  const retired = type === 'item' ? ['note'] : [];
  const known = new Set(fields.map((s) => s.key).concat(derived, retired, ['sources']));
  for (const k of Object.keys(input)) if (!known.has(k)) warnings.push(`unknown field "${k}" was ignored`);

  const doc: Record<string, unknown> = {};
  for (const spec of fields) {
    const value = readField(spec, input[spec.key], errors, warnings);
    if (value !== undefined) doc[spec.key] = value;
    const missing = spec.i18n ? !(value as I18n | undefined)?.en : value === undefined;
    if (spec.required && missing) errors.push(`missing required field "${spec.key}${spec.i18n ? '.en' : ''}"`);
  }

  const sources = readSources(input.sources, fields, doc, warnings);
  if (sources) doc.sources = sources;

  if (type === 'item') {
    doc.medium = KIND_MEDIUM[kind!];
    if (doc.medium === 'play') {
      const dates = [doc.release_us, doc.release_jp, doc.release_th, doc.release_sa].filter(Boolean) as string[];
      if (!dates.length) errors.push('a game needs a release date (US, Japan, Thailand or South America)');
      else doc.year = Number(dates.sort()[0].slice(0, 4));
      if (input.year != null && doc.year != null && Number(input.year) !== doc.year) {
        warnings.push(`"year" is set automatically from the release dates (${doc.year})`);
      }
    }
    if (input.medium != null && input.medium !== doc.medium) warnings.push(`"medium" is set automatically from "kind" (${doc.medium})`);
  }

  // Ids: generate from the English title/name when not given.
  if (type === 'genre') {
    const name = (doc.name as I18n | undefined)?.en;
    const slug = (doc.slug as string | undefined) ?? (name ? slugify(name) : '');
    if (!slug) errors.push('genre needs a "slug"');
    doc.slug = slug;
    doc.id = genreKey(doc.medium as Medium, slug);
  } else {
    const basis = type === 'item' ? (doc.title as I18n | undefined)?.en : (doc.name as I18n | undefined)?.en;
    if (!doc.id) {
      const gen = basis ? slugify(basis) : '';
      if (gen) doc.id = gen;
      else errors.push('needs an "id" (could not generate one from the English title/name)');
    }
  }

  return { doc: errors.length ? null : (compact(doc) as unknown as AnyDoc), errors, warnings };
}

/**
 * Source flags ("summary.th": "ai") for this record's translated fields. A flag for text that isn't there is
 * dropped silently (the text was cleared); a malformed one is reported.
 */
function readSources(v: unknown, fields: FieldSpec[], doc: Record<string, unknown>, warnings: string[]): Sources | undefined {
  if (v == null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) { warnings.push('"sources" should be an object like { "summary.th": "ai" }; it was ignored'); return undefined; }
  const translated = new Set(fields.filter((f) => f.i18n).map((f) => f.key));
  const out: Sources = {};
  for (const [k, src] of Object.entries(v as Record<string, unknown>)) {
    const dot = k.lastIndexOf('.');
    const field = k.slice(0, dot), lang = k.slice(dot + 1);
    if (dot < 1 || !translated.has(field) || !isLang(lang) || (src !== 'tmdb' && src !== 'ai')) {
      warnings.push(`source flag "${k}": ${JSON.stringify(src)} was ignored (expected "field.lang": "tmdb" or "ai")`);
      continue;
    }
    if ((doc[field] as I18n | undefined)?.[lang]) out[k] = src;
  }
  return Object.keys(out).length ? out : undefined;
}

function readField(spec: FieldSpec, v: unknown, errors: string[], warnings: string[]): unknown {
  const where = `"${spec.key}"`;
  if (spec.i18n) {
    if (v == null || v === '') return undefined;
    if (typeof v === 'string') return { en: v.trim() } satisfies I18n;
    if (typeof v !== 'object' || Array.isArray(v)) { errors.push(`${where} should be text or { "en": …, "ja": …, "th": …, "es": … }`); return undefined; }
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!isLang(k)) warnings.push(`unknown language "${spec.key}.${k}" was ignored (use ${LANGS.join(', ')})`);
    const out = compact(Object.fromEntries(LANGS.map((l) => [l, asString(o[l]) ?? (l === 'en' ? '' : undefined)]))) as I18n;
    const others = TRANSLATIONS.filter((l) => out[l]);
    if (!out.en && others.length) { errors.push(`${where} has ${others.map((l) => LANG_INFO[l].english).join(' and ')} but no English`); return undefined; }
    // Japanese is the main translation, so a missing one is worth a nudge; Thai and Spanish are optional.
    if (out.en && !out.ja && spec.type !== 'id') warnings.push(`${where} has no Japanese yet (English will be shown)`);
    return out.en ? out : undefined;
  }

  switch (spec.type) {
    case 'id': {
      const s = asString(v);
      if (s === undefined) return undefined;
      if (!SLUG_RE.test(s)) { errors.push(`${where} "${s}" should be lowercase letters, numbers and dashes (try "${slugify(s)}")`); return undefined; }
      return s;
    }
    case 'text':
    case 'textarea':
      return asString(v);
    case 'number': {
      if (v == null || v === '') return undefined;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) { errors.push(`${where} should be a number`); return undefined; }
      if ((spec.min != null && n < spec.min) || (spec.max != null && n > spec.max)) {
        errors.push(`${where} ${n} is outside ${spec.min}–${spec.max}`);
        return undefined;
      }
      return Math.round(n);
    }
    case 'date': {
      const s = asString(v);
      if (s === undefined) return undefined;
      if (!isDate(s)) { errors.push(`${where} "${s}" should be a date like 2024-03-01`); return undefined; }
      return s;
    }
    case 'url': {
      const s = asString(v);
      if (s === undefined) return undefined;
      if (!isHttpUrl(s)) { errors.push(`${where} "${s}" is not a full https:// link`); return undefined; }
      return s;
    }
    case 'image': {
      const s = asString(v);
      if (s === undefined) return undefined;
      if (s.startsWith(MEDIA_PREFIX)) {
        if (!/^\/media\/[a-z0-9]+\.(jpg|png|webp|gif|avif)$/.test(s)) { errors.push(`${where} "${s}" is not a valid stored image`); return undefined; }
        return s;
      }
      if (!isHttpUrl(s)) { errors.push(`${where} "${s}" should be a full https:// image link (or upload one in the admin)`); return undefined; }
      return s;
    }
    case 'bool': {
      if (v == null) return undefined;
      const b = asBool(v);
      if (b === undefined) errors.push(`${where} should be true or false`);
      return b || undefined;
    }
    case 'select': {
      const s = asString(v);
      if (s === undefined) return undefined;
      if (spec.options && !spec.options.some((o) => o.value === s)) {
        errors.push(`${where} "${s}" should be one of: ${spec.options.map((o) => o.value).join(', ')}`);
        return undefined;
      }
      return s;
    }
    case 'country': {
      const s = asString(v)?.toUpperCase();
      if (s === undefined) return undefined;
      if (!/^[A-Z]{2}$/.test(s)) { errors.push(`${where} "${s}" should be a 2-letter country code like US or JP`); return undefined; }
      return s;
    }
    case 'countries': {
      const list = asList(v)?.map((c) => c.toUpperCase());
      const bad = list?.filter((c) => !/^[A-Z]{2}$/.test(c)) ?? [];
      if (bad.length) errors.push(`${where}: ${bad.join(', ')} should be 2-letter country codes like US or JP`);
      return list;
    }
    case 'platforms': {
      const list = asList(v)?.map((p) => slugify(p));
      const bad = list?.filter((p) => !(p in PLATFORMS)) ?? [];
      if (bad.length) errors.push(`${where}: unknown platform ${bad.map((b) => `"${b}"`).join(', ')} (known: ${Object.keys(PLATFORMS).join(', ')})`);
      return list;
    }
    case 'refs': {
      const list = asList(v);
      const bad = list?.filter((x) => !SLUG_RE.test(x)) ?? [];
      if (bad.length) errors.push(`${where}: ${bad.map((b) => `"${b}"`).join(', ')} should be ids like "hideo-kojima"`);
      return list;
    }
    case 'availability': {
      if (v == null || v === '' || v === false) return undefined;
      if (v === true) return { free: true };
      if (typeof v !== 'object' || Array.isArray(v)) { errors.push(`${where} should be { "free": true, "limited_time": true, "until": "2026-12-31" }`); return undefined; }
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) if (!['free', 'limited_time', 'until'].includes(k)) warnings.push(`unknown field "availability.${k}" was ignored`);
      const until = asString(o.until);
      if (until && !isDate(until)) errors.push(`"availability.until" "${until}" should be a date like 2026-12-31`);
      const out = compact({ free: asBool(o.free) || undefined, limited_time: asBool(o.limited_time) || undefined, until: until && isDate(until) ? until : undefined });
      if (out.until && !out.free && !out.limited_time) out.limited_time = true;
      return Object.keys(out).length ? out : undefined;
    }
  }
}

/** Which other records does this one point to? Returns `type:id` keys (genres as `genre:medium:slug`). */
export function referencesOf(type: EntityType, doc: AnyDoc): { field: string; key: string; id: string }[] {
  if (type !== 'item') return [];
  const item = doc as import('./schema').ItemDoc;
  const out: { field: string; key: string; id: string }[] = [];
  for (const spec of fieldsFor('item', item.kind)) {
    if (spec.type !== 'refs') continue;
    for (const id of ((item as unknown as Record<string, string[] | undefined>)[spec.key] ?? [])) {
      const full = spec.to === 'genre' ? genreKey(item.medium, id) : id;
      out.push({ field: spec.key, key: `${spec.to}:${full}`, id: full });
    }
  }
  return out;
}

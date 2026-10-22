import type { CSSProperties } from 'react';
import { useParams } from 'react-router';
import { getCompany, getGenre, getPerson, hueOf, isAiTranslated, itemsFromCountry, itemsInGenre, studioWorks, worksOf } from '../data';
import { countryName, flag, useLang } from '../i18n';
import { Avatar } from '../components/Chips';
import { Grid } from '../components/Grid';
import { usePageHue, usePageTitle } from '../components/Layout';
import { MEDIA, type Medium } from '../shared/schema';
import type { Item } from '../types';
import { NotFound } from './NotFound';

const reveal = (i: number) => ({ '--i': i }) as CSSProperties;
const ICON: Record<Medium, string> = { watch: '🎬', listen: '🎧', play: '🎮' };

function Section({ title, items, instance, index }: { title: string; items: Item[]; instance: string; index: number }) {
  if (!items.length) return null;
  return (
    <section className="section">
      <header className="section__head reveal" style={reveal(index)}><h2>{title}</h2></header>
      <Grid items={items} instance={instance} />
    </section>
  );
}

export function GenrePage() {
  const { medium = '', slug = '' } = useParams();
  const { lang, t } = useLang();
  const m = medium as Medium;
  const g = (MEDIA as string[]).includes(medium) ? getGenre(m, slug) : undefined;
  const hue = g?.doc.hue ?? hueOf(slug);
  usePageHue(hue);
  usePageTitle(g?.[lang].name);
  if (!g) return <NotFound />;
  const items = itemsInGenre(m, slug);
  const altName = lang === 'en' ? undefined : g.en.name;
  return (
    <div className="page collection" style={{ '--h': hue } as CSSProperties}>
      <header className="page-head page-head--banner">
        <p className="eyebrow reveal" style={reveal(0)}>{ICON[m]} {t.sectionName[m]} · {t.genre} · {t.itemsCount(items.length)}</p>
        <h1 className="page-title page-title--huge reveal" style={reveal(1)}><span className="hash">#</span>{g[lang].name}</h1>
        {altName && altName !== g[lang].name && <p className="page-alt reveal" style={reveal(2)}>{altName}</p>}
      </header>
      <Grid items={items} instance={`genre-${m}-${slug}`} />
    </div>
  );
}

export function PersonPage() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const p = getPerson(slug);
  const { directed, starred, recorded, created } = worksOf(slug);
  const total = new Set([...directed, ...starred, ...recorded, ...created]).size;
  usePageHue(hueOf(slug));
  usePageTitle(p && total ? p[lang].name : undefined);
  if (!p || !total) return <NotFound />;
  const altName = lang === 'en' ? undefined : p.en.name;
  return (
    <div className="page collection" style={{ '--h': hueOf(slug) } as CSSProperties}>
      <header className={`page-head page-head--person ${p.doc.photo ? 'has-photo' : ''}`}>
        <div className="person-photo reveal" style={reveal(0)}>
          <Avatar slug={slug} width={p.doc.photo ? 168 : 112} />
          {p.doc.photo_credit && <small className="photo-credit">{p.doc.photo_credit}</small>}
        </div>
        <div className="person-info">
          <p className="eyebrow reveal" style={reveal(1)}>{t.person} · {t.itemsCount(total)}</p>
          <h1 className="page-title reveal" style={reveal(2)}>{p[lang].name}</h1>
          {altName && altName !== p[lang].name && <p className="page-alt reveal" style={reveal(3)}>{altName}</p>}
          {p[lang].bio && <p className="bio reveal" style={reveal(4)}>{p[lang].bio}</p>}
          {p[lang].bio && isAiTranslated(p.doc, 'bio', lang) && <small className="auto-translated reveal" style={reveal(4)}>{t.autoTranslated}</small>}
          {p[lang].bio && p.doc.bio_credit && <small className="bio-credit reveal" style={reveal(4)}>{p.doc.bio_credit}</small>}
        </div>
      </header>
      <Section title={`🎬 ${t.directed}`} items={directed} instance={`person-${slug}-dir`} index={5} />
      <Section title={`⭐ ${t.actedIn}`} items={starred} instance={`person-${slug}-cast`} index={6} />
      <Section title={`🎧 ${t.music}`} items={recorded} instance={`person-${slug}-music`} index={7} />
      <Section title={`🎮 ${t.madeGames}`} items={created} instance={`person-${slug}-games`} index={8} />
    </div>
  );
}

export function StudioPage() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const c = getCompany(slug);
  usePageHue(hueOf(slug));
  usePageTitle(c?.[lang].name);
  if (!c) return <NotFound />;
  const { developed, published } = studioWorks(slug);
  const altName = lang === 'en' ? undefined : c.en.name;
  return (
    <div className="page collection" style={{ '--h': hueOf(slug) } as CSSProperties}>
      <header className="page-head page-head--banner">
        <p className="eyebrow reveal" style={reveal(0)}>
          {t.studio}{c.doc.country && <> · {flag(c.doc.country)} {countryName(c.doc.country, lang)}</>} · {t.itemsCount(developed.length + published.length)}
        </p>
        <h1 className="page-title page-title--huge reveal" style={reveal(1)}>{c[lang].name}</h1>
        {altName && altName !== c[lang].name && <p className="page-alt reveal" style={reveal(2)}>{altName}</p>}
      </header>
      <Section title={`🛠 ${t.developed}`} items={developed} instance={`studio-${slug}-dev`} index={3} />
      <Section title={`📦 ${t.published}`} items={published} instance={`studio-${slug}-pub`} index={4} />
    </div>
  );
}

export function CountryPage() {
  const { code = '' } = useParams();
  const { lang, t } = useLang();
  const upper = code.toUpperCase();
  usePageHue(hueOf(upper));
  const items = itemsFromCountry(upper);
  const found = /^[A-Z]{2}$/.test(upper) && items.length > 0;
  usePageTitle(found ? countryName(upper, lang) : undefined);
  if (!found) return <NotFound />;
  return (
    <div className="page collection">
      <header className="page-head page-head--banner">
        <p className="eyebrow reveal" style={reveal(0)}>{t.madeIn} · {t.itemsCount(items.length)}</p>
        <h1 className="page-title page-title--huge reveal" style={reveal(1)}>
          <span className="flag-big" aria-hidden>{flag(upper)}</span> {countryName(upper, lang)}
        </h1>
      </header>
      <Grid items={items} instance={`country-${upper}`} />
    </div>
  );
}

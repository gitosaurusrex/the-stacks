import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { enabledMedia } from '../data';
import { useLang } from '../i18n';
import { usePeriod } from '../timeOfDay';
import { LANG_INFO } from '../shared/schema';
import { LANGS, type Lang } from '../types';
import { VLink, VNavLink } from './VLink';


/**
 * Pages call this to name the browser tab and history entry ("Past Lives · The Stacks"); '' gives just the site name.
 * undefined leaves the title alone, so a page that renders <NotFound /> doesn't overwrite its title.
 */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    if (title !== undefined) document.title = title ? `${title} · The Stacks` : 'The Stacks';
  }, [title]);
}

/** Pages call this to tint the ambient background. */
export function usePageHue(hue: number | undefined) {
  useEffect(() => {
    document.documentElement.style.setProperty('--page-h', String(hue ?? 268));
  }, [hue]);
}

/**
 * Language picker: one compact button showing the current language, opening a menu that lists every
 * language in its own name (so a visitor can find theirs whatever language the page is in).
 */
function LangMenu() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    // Focus the current language when the menu opens.
    items.current[LANGS.indexOf(lang)]?.focus();
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open, lang]);

  const choose = (l: Lang) => {
    setOpen(false);
    button.current?.focus();
    if (l !== lang) setLang(l);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    const i = items.current.findIndex((el) => el === document.activeElement);
    const move = (to: number) => { e.preventDefault(); items.current[(to + LANGS.length) % LANGS.length]?.focus(); };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(LANGS.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); if (e.key === 'Escape') button.current?.focus(); }
  };

  return (
    <div className="lang-menu" ref={wrap} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        className="lang-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t.language}: ${LANG_INFO[lang].name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        <span lang={lang}>{LANG_INFO[lang].short}</span>
        <svg className="lang-menu__chevron" viewBox="0 0 24 24" width="12" height="12" aria-hidden><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            aria-label={t.language}
            className="lang-menu__list"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
          >
            {LANGS.map((l, i) => (
              <li key={l} role="none">
                <button
                  ref={(el) => { items.current[i] = el; }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={lang === l}
                  lang={l}
                  className={`lang-menu__item ${lang === l ? 'is-active' : ''}`}
                  onClick={() => choose(l)}
                >
                  {LANG_INFO[l].name}
                  {lang === l && <span className="lang-menu__check" aria-hidden>✓</span>}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Nav() {
  const { t } = useLang();
  const { pathname } = useLocation();
  const sections = {
    watch: { to: '/watch', label: t.navWatch, match: (p: string) => /^\/(watch|title|genre\/watch)/.test(p) },
    listen: { to: '/listen', label: t.navListen, match: (p: string) => /^\/(listen|music|genre\/listen)/.test(p) },
    play: { to: '/play', label: t.navPlay, match: (p: string) => /^\/(play|game|studio|genre\/play)/.test(p) },
  };
  const links = [{ to: '/', label: t.navHome, match: (p: string) => p === '/' }, ...enabledMedia.map((m) => sections[m])];
  return (
    <nav className="nav" aria-label="Main">
      {links.map((l) => {
        const active = l.match(pathname);
        return (
          <VNavLink key={l.to} to={l.to} className={active ? 'nav__link is-active' : 'nav__link'} end>
            {active && <motion.span layoutId="nav-pill" className="nav__pill" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
            <span className="nav__label">{l.label}</span>
          </VNavLink>
        );
      })}
    </nav>
  );
}

/** True once the page has scrolled, so the header only frosts over when there's content under it. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return scrolled;
}

/** Publishes the header's height as --header-h, so page backdrops can reach up behind it. */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`));
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return ref;
}

export function Layout() {
  const { t } = useLang();
  const { pathname } = useLocation();
  usePeriod(); // keeps the time-of-day palette current
  const scrolled = useScrolled();
  const headerRef = useHeaderHeight();
  return (
    // For visitors who ask for reduced motion, Motion skips movement (layout shifts, sliding pills, scaling) and keeps
    // fades; styles.css does the same for CSS animations and page transitions.
    <MotionConfig reducedMotion="user">
      <a href="#main" className="skip-link">{t.skip}</a>
      <div className="ambient" aria-hidden>
        <span className="ambient__blob ambient__blob--a" />
        <span className="ambient__blob ambient__blob--b" />
        <span className="ambient__blob ambient__blob--c" />
      </div>
      <div className="grain" aria-hidden />
      <header ref={headerRef} className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <VLink to="/" className="logo" aria-label={t.siteName}>
          <span className="logo__mark" aria-hidden>
            <span>T</span><span>S</span>
          </span>
          <span className="logo__text">
            <span className="logo__name">{t.siteName}</span>
            <span className="logo__tag">{t.tagline}</span>
          </span>
        </VLink>
        <Nav />
        <VNavLink to="/search" className="search-link" aria-label={t.advancedSearch} title={t.advancedSearch}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </VNavLink>
        <LangMenu />
      </header>
      <main id="main" className="main" key={pathname}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>{t.siteName}</span>
        <small className="site-footer__version" title={__APP_COMMIT__ ? `Build ${__APP_COMMIT__}` : undefined}>
          v{__APP_VERSION__}{__APP_COMMIT__ && ` · ${__APP_COMMIT__}`}
        </small>
        <small className="site-footer__credit">Some artwork via TMDB and Wikipedia. This site uses the TMDB API but is not endorsed or certified by TMDB.</small>
      </footer>
      <ScrollRestoration />
    </MotionConfig>
  );
}

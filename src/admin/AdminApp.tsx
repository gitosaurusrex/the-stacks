import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { loadJapaneseFonts } from '../fonts';
import { api } from './api';
import { AdminProvider, useAdmin } from './context';
import { Dashboard } from './Dashboard';
import { IngestPage } from './Ingest';
import { IngestSummaryPage } from './IngestSummary';
import { EntityList } from './EntityList';
import { EditPage } from './Edit';
import './admin.css';

function Shell() {
  const { email } = useAdmin();
  const links = [
    ['/admin', 'Dashboard', true],
    ['/admin/ingest', 'Batch ingest', false],
    ['/admin/items', 'Items', false],
    ['/admin/people', 'People', false],
    ['/admin/studios', 'Studios', false],
    ['/admin/genres', 'Genres', false],
  ] as const;
  return (
    <div className="admin">
      <header className="admin-bar">
        <a href="/" className="admin-bar__brand" target="_blank" rel="noreferrer">
          <span className="logo__mark"><span>T</span><span>S</span></span>
          <span>Admin</span>
        </a>
        <nav className="admin-nav">
          {links.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <span className="admin-bar__who">{email}</span>
        <button className="btn btn--small" onClick={async () => { await api.logout().catch(() => {}); location.reload(); }}>Sign out</button>
      </header>
      <main className="admin-main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="ingest" element={<IngestPage />} />
          <Route path="ingests/:id" element={<IngestSummaryPage />} />
          <Route path="items" element={<EntityList type="item" />} />
          <Route path="people" element={<EntityList type="person" />} />
          <Route path="studios" element={<EntityList type="company" />} />
          <Route path="genres" element={<EntityList type="genre" />} />
          <Route path="new/:type" element={<EditPage />} />
          <Route path="edit/:type/:id" element={<EditPage />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}

export function AdminApp() {
  useEffect(() => {
    document.title = 'Admin · The Stacks';
    document.documentElement.lang = 'en';
    // The admin keeps the default palette, not the public site's time-of-day one.
    delete document.documentElement.dataset.period;
    document.documentElement.style.setProperty('--page-h', '230');
    // The edit forms show Japanese text.
    loadJapaneseFonts();
  }, []);
  return (
    <AdminProvider>
      <Shell />
    </AdminProvider>
  );
}

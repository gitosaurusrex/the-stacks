import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { loadCatalog } from './data';
import { ITEM_PATH } from './shared/schema';
import { LangProvider } from './i18n';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Browse } from './pages/Browse';
import { Detail } from './pages/Detail';
import { CountryPage, GenrePage, PersonPage, StudioPage } from './pages/Collections';
import { Search } from './pages/Search';
import { NotFound } from './pages/NotFound';
import './styles.css';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'watch', element: <Browse section="watch" /> },
      { path: 'listen', element: <Browse section="listen" /> },
      { path: 'play', element: <Browse section="play" /> },
      { path: `${ITEM_PATH.watch}/:slug`, element: <Detail medium="watch" /> },
      { path: `${ITEM_PATH.listen}/:slug`, element: <Detail medium="listen" /> },
      { path: `${ITEM_PATH.play}/:slug`, element: <Detail medium="play" /> },
      { path: 'genre/:medium/:slug', element: <GenrePage /> },
      { path: 'person/:slug', element: <PersonPage /> },
      { path: 'studio/:slug', element: <StudioPage /> },
      { path: 'country/:code', element: <CountryPage /> },
      { path: 'search', element: <Search /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  // The admin is a separate chunk, so visitors never download it.
  { path: 'admin/*', lazy: async () => ({ Component: (await import('./admin/AdminApp')).AdminApp }) },
]);

const root = createRoot(document.getElementById('root')!);
const isAdmin = location.pathname.startsWith('/admin');

// The public site needs the catalog before it renders; the admin loads its own data.
(isAdmin ? Promise.resolve() : loadCatalog())
  .then(() =>
    root.render(
      <StrictMode>
        <LangProvider>
          <RouterProvider router={router} />
        </LangProvider>
      </StrictMode>,
    ),
  )
  .catch((err) => {
    console.error(err);
    const msg = document.querySelector('.boot__msg');
    if (msg) msg.textContent = 'Could not load The Stacks — please refresh.';
    document.querySelector('.boot')?.classList.add('boot--error');
  });

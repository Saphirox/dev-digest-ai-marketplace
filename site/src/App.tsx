import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './components/ui';
import { href, navigate, safeDecode, useRoute, useStored } from './lib';
import { InstallPage } from './pages/InstallPage';
import { PluginPage } from './pages/PluginPage';
import { SearchPage } from './pages/SearchPage';
import { buildKeywordIndex } from './search/keyword';
import { useSemantic } from './search/semantic';
import type { Catalog } from './types';

export interface Cart {
  items: string[];
  has: (plugin: string) => boolean;
  toggle: (plugin: string) => void;
  add: (plugins: string[]) => void;
  remove: (plugin: string) => void;
}

function useCart(known: Set<string>): Cart {
  const [stored, setStored] = useStored<string[]>('dd.cart', [], (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'));
  const items = useMemo(() => stored.filter((p) => known.has(p)), [stored, known]);
  return {
    items,
    has: (p) => items.includes(p),
    toggle: (p) => setStored((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])),
    add: (ps) => setStored((prev) => [...prev, ...ps.filter((p) => !prev.includes(p))]),
    remove: (p) => setStored((prev) => prev.filter((x) => x !== p)),
  };
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/catalog.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setCatalog)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="page-message">
        <h1>Catalog unavailable</h1>
        <p>Could not load api/catalog.json ({error}). Run <code>npm run data</code> in site/ for local development.</p>
      </div>
    );
  }
  if (!catalog) return <div className="page-message" aria-busy="true">Loading catalog…</div>;
  return <Loaded catalog={catalog} />;
}

function Loaded({ catalog }: { catalog: Catalog }) {
  const route = useRoute();
  const index = useMemo(() => buildKeywordIndex(catalog), [catalog]);
  const known = useMemo(() => new Set(catalog.plugins.map((p) => p.name)), [catalog]);
  const cart = useCart(known);
  const [semanticOn, setSemanticOn] = useStored('dd.semantic', false, (v) => typeof v === 'boolean');
  const semantic = useSemantic(semanticOn);

  // ⌘K from another page: focus the search box once the search page has rendered (see the route effect below).
  const focusSearchPending = useRef(false);
  const focusSearch = useCallback(() => {
    if (route.path === '/') document.getElementById('q')?.focus();
    else {
      focusSearchPending.current = true;
      navigate(href('/'));
    }
  }, [route.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusSearch]);

  // On a page change, start at the top and move focus into the new page so keyboard and screen reader users are not left on <body>.
  const firstRoute = useRef(true);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    if (focusSearchPending.current) {
      focusSearchPending.current = false;
      document.getElementById('q')?.focus();
    } else {
      document.getElementById('main')?.focus({ preventScroll: true });
    }
  }, [route.path]);

  const pluginMatch = route.path.match(/^\/plugin\/([^/]+)$/);
  let page;
  if (pluginMatch) page = <PluginPage catalog={catalog} name={safeDecode(pluginMatch[1])} cart={cart} />;
  else if (route.path === '/install') page = <InstallPage catalog={catalog} cart={cart} params={route.params} />;
  else
    page = (
      <SearchPage
        catalog={catalog}
        index={index}
        params={route.params}
        cart={cart}
        semantic={{ ...semantic, enabled: semanticOn, setEnabled: setSemanticOn }}
      />
    );

  const repoUrl = `https://github.com/${catalog.marketplace.repo}`;
  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-row">
          <a className="logo" href={href('/')}>
            <Icon.logo />
            {catalog.marketplace.name}
          </a>
          <nav aria-label="Main" className="main-nav">
            <a href={href('/')} aria-current={route.path === '/' || pluginMatch ? 'page' : undefined}>Catalog</a>
            <a href="./api/catalog.json">API</a>
            <a href="./llms.txt">llms.txt</a>
            <a href={repoUrl}>GitHub</a>
          </nav>
          <a className="btn btn-primary cart-link" href={href('/install')} aria-current={route.path === '/install' ? 'page' : undefined}>
            <Icon.download />
            Install builder
            <span className="count" aria-label={`${cart.items.length} selected`}>{cart.items.length}</span>
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{page}</main>
      <footer className="container site-footer">
        <span>Generated from marketplace.json on {new Date(catalog.generatedAt).toLocaleDateString('en', { dateStyle: 'medium' })}</span>
        <a href={repoUrl}>Source on GitHub</a>
        <a href={`${repoUrl}/issues/new`}>Request a plugin</a>
      </footer>
    </>
  );
}

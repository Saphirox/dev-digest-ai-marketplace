import type MiniSearch from 'minisearch';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cart } from '../App';
import { CodeLine, Icon, TypeBadge, typeLabel } from '../components/ui';
import { href, navigate } from '../lib';
import model from '../search/model.json';
import { runSearch, type Result, type SortKey, type TypeFilter } from '../search/search';
import { similarities, type SemanticIndex, type SemanticStatus } from '../search/semantic';
import type { Artifact, Catalog } from '../types';

interface SemanticProps {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  status: SemanticStatus;
  index: SemanticIndex | null;
  embed: (text: string) => Promise<Float32Array | null>;
}

const FILTERS: TypeFilter[] = ['all', 'skill', 'agent', 'command', 'hook', 'mcp', 'plugin'];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Best match' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'name', label: 'Name' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchPage({ catalog, index, params, cart, semantic }: {
  catalog: Catalog;
  index: MiniSearch<Artifact>;
  params: URLSearchParams;
  cart: Cart;
  semantic: SemanticProps;
}) {
  const [query, setQuery] = useState(params.get('q') ?? '');
  const type = (FILTERS.includes(params.get('type') as TypeFilter) ? params.get('type') : 'all') as TypeFilter;
  const sort = (SORTS.some((s) => s.key === params.get('sort')) ? params.get('sort') : 'relevance') as SortKey;
  const debouncedQuery = useDebounced(query.trim(), 250);
  const [similarity, setSimilarity] = useState<{ query: string; scores: Map<string, number> } | null>(null);

  const setParams = (next: { q?: string; type?: TypeFilter; sort?: SortKey }, replace = true) => {
    const q = next.q ?? debouncedQuery;
    const t = next.type ?? type;
    const s = next.sort ?? sort;
    navigate(href('/', { q: q || undefined, type: t === 'all' ? undefined : t, sort: s === 'relevance' ? undefined : s }), replace);
  };

  // Follow the URL when it changes from outside (back button, a pasted link, a tag link).
  const urlQuery = params.get('q') ?? '';
  useEffect(() => {
    if (urlQuery !== debouncedQuery) setQuery(urlQuery);
  }, [urlQuery]);

  // Keep the URL shareable as the user types.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setParams({ q: debouncedQuery });
  }, [debouncedQuery]);

  // Embed the query once the model is ready.
  const { embed, index: semanticIndex } = semantic;
  const ready = semantic.enabled && semantic.status.state === 'ready' && semanticIndex !== null;
  useEffect(() => {
    if (!ready || !debouncedQuery || !semanticIndex) return;
    let stale = false;
    embed(debouncedQuery).then((v) => {
      if (!stale && v) setSimilarity({ query: debouncedQuery, scores: similarities(semanticIndex, v) });
    });
    return () => {
      stale = true;
    };
  }, [ready, debouncedQuery, embed, semanticIndex]);

  const activeSimilarity = ready && similarity?.query === debouncedQuery ? similarity.scores : null;
  const { results, counts, terms } = useMemo(
    () => runSearch(catalog, index, debouncedQuery, { type, sort, similarity: activeSimilarity }),
    [catalog, index, debouncedQuery, type, sort, activeSimilarity],
  );
  const versions = useMemo(() => new Map(catalog.plugins.map((p) => [p.name, p.version])), [catalog]);
  const hasQuery = debouncedQuery.length > 0;

  return (
    <>
      <section className="container hero">
        <p className="eyebrow">Claude Code plugin marketplace</p>
        <h1>Find a skill, agent or hook for the task in front of you.</h1>
        <p className="lede">Describe what you need in plain words, in English or Ukrainian. Search runs entirely in your browser over every plugin in this repo.</p>

        <form role="search" className="search-form" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="q">What do you need?</label>
          <div className="search-row">
            <div className="search-box">
              <Icon.search />
              <input
                id="q"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. I need a skill that writes release notes"
              />
              <kbd>⌘K</kbd>
            </div>
            <SemanticToggle semantic={semantic} />
          </div>
          <p className="hint">{semanticHint(semantic)}</p>
        </form>
      </section>

      <section className="container" aria-label="Filters">
        <div className="filter-row">
          {FILTERS.filter((f) => f === 'all' || counts[f] > 0 || f === type).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={type === f} onClick={() => setParams({ type: f }, false)}>
              {f === 'all' ? 'All' : typeLabel(f, true)} <span className="chip-count">{counts[f]}</span>
            </button>
          ))}
          <span className="spacer" />
          <label htmlFor="sort">Sort</label>
          <select id="sort" value={sort} onChange={(e) => setParams({ sort: e.target.value as SortKey }, false)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <p className="result-summary" aria-live="polite">
          {results.length} {results.length === 1 ? 'result' : 'results'}
          {hasQuery && terms.length > 0 && <> for “{terms.join(' ')}”</>}
        </p>
      </section>

      <section className="container results" aria-label="Results">
        {results.length > 0 ? (
          <div className="card-grid">
            {results.map((r, i) => (
              <ResultCard
                key={r.artifact.id}
                result={r}
                best={hasQuery && sort === 'relevance' && i === 0 && results.length > 1 && r.score > 0}
                version={versions.get(r.artifact.plugin) ?? null}
                cart={cart}
              />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h2>No matches</h2>
            {!semantic.enabled ? (
              <>
                <p>Keyword search found nothing. Semantic search matches by meaning, also across languages.</p>
                <button type="button" className="btn btn-primary" onClick={() => semantic.setEnabled(true)}>
                  <Icon.sparkle /> Turn on semantic search
                </button>
              </>
            ) : (
              <p>Nothing in the catalog looks related.</p>
            )}
            <p>
              <a href={`https://github.com/${catalog.marketplace.repo}/issues/new?title=${encodeURIComponent(`Plugin request: ${debouncedQuery}`)}`}>
                Request a plugin for this
              </a>
            </p>
          </div>
        )}
      </section>

      <section className="band" id="get-started">
        <div className="container band-grid">
          <div className="stack">
            <h2>Add the marketplace</h2>
            <CodeLine text={`/plugin marketplace add ${catalog.marketplace.repo}`} dark />
          </div>
          <div className="stack">
            <h2>For agents</h2>
            <p>
              The whole catalog as static files: <a href="./api/catalog.json"><code>api/catalog.json</code></a> and{' '}
              <a href="./llms.txt"><code>llms.txt</code></a>. Rebuilt on every push to main.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function SemanticToggle({ semantic }: { semantic: SemanticProps }) {
  const s = semantic.status;
  // The worker keeps reporting progress after the toggle is turned off, so `enabled` decides first.
  const label = !semantic.enabled
    ? 'Semantic: off'
    : s.state === 'loading'
      ? `Loading model ${s.total ? Math.round((s.loaded / s.total) * 100) : 0}%`
      : `Semantic: ${s.state === 'ready' ? 'on' : s.state === 'unavailable' || s.state === 'error' ? 'unavailable' : '…'}`;
  return (
    <button
      type="button"
      className="btn semantic-toggle"
      aria-pressed={semantic.enabled}
      onClick={() => semantic.setEnabled(!semantic.enabled)}
    >
      <Icon.sparkle />
      {label}
    </button>
  );
}

function semanticHint(semantic: SemanticProps): string {
  const s = semantic.status;
  if (!semantic.enabled)
    return `Keyword search. Turn on Semantic to match by meaning in any language (one-time ~${model.downloadMB} MB download, runs on your device).`;
  switch (s.state) {
    case 'loading':
      return s.total
        ? `Downloading the model: ${Math.round(s.loaded / 1e6)} of ${Math.round(s.total / 1e6)} MB. Keyword results show meanwhile.`
        : 'Preparing the model. Keyword results show meanwhile.';
    case 'ready':
      return 'Matching by meaning across languages. The model runs on this device.';
    case 'unavailable':
      return s.reason;
    case 'error':
      return `Semantic search failed to load (${s.message}). Keyword search still works.`;
    default:
      return '';
  }
}

function ResultCard({ result, best, version, cart }: { result: Result; best: boolean; version: string | null; cart: Cart }) {
  const a = result.artifact;
  const inCart = cart.has(a.plugin);
  const pluginHref = href(`/plugin/${encodeURIComponent(a.plugin)}`);
  return (
    <article className={`card ${best ? 'card-best' : ''}`}>
      <div className="card-top">
        <TypeBadge type={a.type} />
        {best && <span className="badge badge-best">Best match</span>}
        <span className="spacer" />
        {version && <span className="mono muted small">v{version}</span>}
      </div>
      <div>
        <h2 className="card-title">{a.name}</h2>
        {a.type !== 'plugin' && (
          <p className="muted small">
            in plugin <a href={pluginHref}>{a.plugin}</a>
          </p>
        )}
      </div>
      <p className="card-desc">{a.description}</p>
      {a.trigger && <p className="card-trigger"><strong>Use when</strong> {a.trigger}</p>}
      {(result.matched.length > 0 || result.byMeaning) && (
        <div className="match-row">
          <span className="muted small">{result.matched.length ? 'Matched' : 'Related by meaning'}</span>
          {result.matched.map((m) => (
            <mark key={m}>{m}</mark>
          ))}
        </div>
      )}
      {a.invoke && <CodeLine text={a.invoke} />}
      <div className="card-actions">
        <a className="btn btn-outline" href={pluginHref}>Details</a>
        <button type="button" className={`btn ${inCart ? 'btn-dark' : 'btn-outline'}`} aria-pressed={inCart} onClick={() => cart.toggle(a.plugin)}>
          {inCart ? 'Added ✓' : 'Add to install'}
        </button>
      </div>
    </article>
  );
}

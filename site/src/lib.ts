import { useCallback, useEffect, useState } from 'react';

// ---- Hash routing: #/  #/plugin/<name>  #/install   (query string after "?") ----

export interface Route {
  path: string;
  params: URLSearchParams;
}

function readRoute(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

export function href(path: string, params?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const s = qs.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export function navigate(target: string, replace = false) {
  if (replace) window.history.replaceState(null, '', target);
  else window.location.hash = target.replace(/^#/, '');
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

// ---- localStorage that never throws (private windows, blocked storage) ----

// localStorage is shared by every site on <owner>.github.io, so stored values are validated, not trusted.
export function load<T>(key: string, fallback: T, valid: (v: unknown) => boolean = () => true): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the value lives for this page view only.
  }
}

export function useStored<T>(key: string, fallback: T, valid?: (v: unknown) => boolean): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, fallback, valid));
  const set = useCallback(
    (v: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        save(key, next);
        return next;
      }),
    [key],
  );
  return [value, set];
}

/** decodeURIComponent that returns the input instead of throwing on a malformed %-sequence. */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Only http(s) links from catalog data are rendered as links. */
export function safeUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

// ---- Install snippets ----

export type SnippetKind = 'slash' | 'shell' | 'team';

export function installSnippet(kind: SnippetKind, marketplace: string, repo: string, plugins: string[]): string {
  if (kind === 'team') {
    return JSON.stringify(
      {
        extraKnownMarketplaces: { [marketplace]: { source: { source: 'github', repo } } },
        enabledPlugins: Object.fromEntries(plugins.map((p) => [`${p}@${marketplace}`, true])),
      },
      null,
      2,
    );
  }
  const prefix = kind === 'slash' ? '/plugin' : 'claude plugin';
  return [`${prefix} marketplace add ${repo}`, ...plugins.map((p) => `${prefix} install ${p}@${marketplace}`)].join('\n');
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}

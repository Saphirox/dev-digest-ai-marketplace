import { useEffect } from 'react';
import type { Cart } from '../App';
import { CopyButton, Icon } from '../components/ui';
import { href, installSnippet, navigate, useStored, type SnippetKind } from '../lib';
import type { Catalog } from '../types';

const TABS: { key: SnippetKind; label: string; hint: string }[] = [
  { key: 'slash', label: 'In Claude Code', hint: 'Paste into a Claude Code session, one line at a time.' },
  { key: 'shell', label: 'Shell', hint: 'Run in a terminal, or add to a setup script.' },
  {
    key: 'team',
    label: 'Team settings.json',
    hint: 'Commit to .claude/settings.json in your project. Teammates are prompted to install when they trust the folder.',
  },
];

export function InstallPage({ catalog, cart, params }: { catalog: Catalog; cart: Cart; params: URLSearchParams }) {
  const [tab, setTab] = useStored<SnippetKind>('dd.installTab', 'slash', (v) => TABS.some((t) => t.key === v));
  const shared = params.get('p');

  // A shared link (#/install?p=a,b) adds its plugins to this browser's selection.
  useEffect(() => {
    if (!shared) return;
    cart.add(shared.split(',').filter(Boolean));
    navigate(href('/install'), true);
  }, [shared]);

  const plugins = catalog.plugins.filter((p) => cart.items.includes(p.name));
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const snippet = installSnippet(current.key, catalog.marketplace.name, catalog.marketplace.repo, plugins.map((p) => p.name));
  const shareUrl = `${window.location.origin}${window.location.pathname}${href('/install', { p: plugins.map((p) => p.name).join(',') })}`;

  return (
    <>
      <section className="container hero hero-compact">
        <h1>Install builder</h1>
        <p className="lede">Pick plugins in the catalog, then copy one snippet for yourself or commit one for your whole team. Your selection stays in this browser.</p>
      </section>

      <div className="container two-col">
        <section className="panel col-side stack" aria-label="Selected plugins">
          <h2>Selected · {plugins.length}</h2>
          {plugins.map((p) => {
            const parts = Object.entries(p.counts).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`);
            return (
              <div key={p.name} className="selected-row">
                <div className="selected-text">
                  <a className="mono strong" href={href(`/plugin/${encodeURIComponent(p.name)}`)}>{p.name}</a>
                  <p className="muted small">{[p.version && `v${p.version}`, ...parts].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => cart.remove(p.name)}>
                  <Icon.close />
                </button>
              </div>
            );
          })}
          {plugins.length === 0 && <p className="muted">Nothing selected yet.</p>}
          <a className="btn btn-dashed" href={href('/')}>+ Add from catalog</a>
        </section>

        <section className="panel col-main stack" aria-label="Generated snippet">
          <div className="filter-row">
            {TABS.map((t) => (
              <button key={t.key} type="button" className="chip" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted">{current.hint}</p>
          <div className="snippet">
            <pre>{snippet}</pre>
            <CopyButton text={snippet} showText className="snippet-copy" />
          </div>
          <div className="meta">
            <span>Third-party marketplaces don’t auto-update by default: run <code>/plugin marketplace update {catalog.marketplace.name}</code>.</span>
            {plugins.length > 0 && <CopyButton text={shareUrl} label="Copy share link" showText className="link-btn" />}
          </div>
        </section>
      </div>
    </>
  );
}

import { useState } from 'react';
import type { Cart } from '../App';
import { Markdown } from '../components/Markdown';
import { CodeLine, TypeBadge } from '../components/ui';
import { formatDate, href, safeUrl } from '../lib';
import type { Catalog } from '../types';

export function PluginPage({ catalog, name, cart }: { catalog: Catalog; name: string; cart: Cart }) {
  const [tab, setTab] = useState<'readme' | 'changelog'>('readme');
  const plugin = catalog.plugins.find((p) => p.name === name);
  const repoUrl = `https://github.com/${catalog.marketplace.repo}`;

  if (!plugin) {
    return (
      <div className="container page-message">
        <h1>Plugin not found</h1>
        <p>
          No plugin named <code>{name}</code> in this marketplace. <a href={href('/')}>Back to the catalog</a>
        </p>
      </div>
    );
  }

  const components = catalog.artifacts.filter((a) => a.plugin === plugin.name && a.type !== 'plugin');
  const inCart = cart.has(plugin.name);
  const base = plugin.path ? `${repoUrl}/blob/main/${plugin.path}` : repoUrl;
  const t = plugin.touches;
  const updated = formatDate(plugin.updatedAt);
  const authorUrl = safeUrl(plugin.author?.url);

  return (
    <>
      <div className="container breadcrumb">
        <nav aria-label="Breadcrumb">
          <a href={href('/')}>Catalog</a> / <span aria-current="page">{plugin.name}</span>
        </nav>
      </div>

      <section className="container plugin-head">
        <div className="plugin-title">
          <div className="tag-row">
            {plugin.category && <span className="badge badge-command">{plugin.category}</span>}
            {plugin.tags.map((tag) => (
              <a key={tag} className="tag" href={href('/', { q: tag })}>{tag}</a>
            ))}
          </div>
          <h1 className="mono">{plugin.displayName ?? plugin.name}</h1>
          <p className="lede">{plugin.description}</p>
          <p className="meta">
            {plugin.version && <span>v{plugin.version}</span>}
            {plugin.author && (
              <span>by {authorUrl ? <a href={authorUrl}>{plugin.author.name}</a> : plugin.author.name}</span>
            )}
            {plugin.license && <span>{plugin.license}</span>}
            {updated && <span>Updated {updated}</span>}
          </p>
        </div>
        <div className="plugin-install">
          <button type="button" className={`btn btn-lg ${inCart ? 'btn-dark' : 'btn-primary'}`} aria-pressed={inCart} onClick={() => cart.toggle(plugin.name)}>
            {inCart ? 'Added to install ✓' : 'Add to install'}
          </button>
          <CodeLine text={`/plugin install ${plugin.name}@${catalog.marketplace.name}`} label="Copy install command" />
        </div>
      </section>

      <div className="container two-col">
        <div className="col-main">
          {components.length > 0 && (
            <section className="panel">
              <h2>Components</h2>
              <div className="stack">
                {components.map((a) => (
                  <div key={a.id} className="component">
                    <div className="component-head">
                      <TypeBadge type={a.type} />
                      <h3 className="mono">{a.name}</h3>
                      <span className="spacer" />
                      {a.url && <a className="small" href={a.url}>Source</a>}
                    </div>
                    {a.description && <p>{a.description}</p>}
                    {a.trigger && (
                      <div className="when">
                        <p className="when-label">When Claude uses it</p>
                        <p>{a.trigger}</p>
                      </div>
                    )}
                    {a.invoke && <CodeLine text={a.invoke} />}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="tabs" role="group" aria-label="Document">
              <button type="button" aria-pressed={tab === 'readme'} onClick={() => setTab('readme')}>README</button>
              <button type="button" aria-pressed={tab === 'changelog'} onClick={() => setTab('changelog')}>Changelog</button>
            </div>
            {tab === 'readme' ? (
              plugin.readme ? <Markdown source={plugin.readme} base={base} /> : <p className="muted">No README.</p>
            ) : plugin.changelog.length ? (
              <div className="stack">
                {plugin.changelog.map((c) => (
                  <div key={c.version}>
                    <h3 className="mono">{c.version}{c.date && <span className="muted small"> · {c.date}</span>}</h3>
                    <Markdown source={c.body} base={base} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No changelog entries.</p>
            )}
            {plugin.path && (
              <p><a href={`${repoUrl}/tree/main/${plugin.path}`}>View source on GitHub</a></p>
            )}
          </section>
        </div>

        <aside className="col-side">
          {!plugin.external && (
            <section className="panel">
              <h2>What it touches</h2>
              <p className="muted small">Read from the plugin files at build time.</p>
              <dl className="touches">
                <dt>Hooks</dt>
                <dd>{t.hooks.length ? t.hooks.map((h, i) => <div key={i}><code>{h.event}</code> {h.matcher !== '*' && <>on <code>{h.matcher}</code></>} → <code>{h.command}</code></div>) : <strong>None</strong>}</dd>
                <dt>MCP servers</dt>
                <dd>{t.mcpServers.length ? t.mcpServers.map((m) => <div key={m.name}><code>{m.name}</code>: <code>{m.launch}</code></div>) : <strong>None</strong>}</dd>
                <dt>Scripts</dt>
                <dd>{t.scripts.length ? t.scripts.map((s) => <div key={s}><code>{s}</code></div>) : <strong>None</strong>}</dd>
                <dt>Allowed tools</dt>
                <dd>{t.allowedTools.length ? t.allowedTools.map((s) => <code key={s} className="tool">{s}</code>) : <strong>Not restricted</strong>}</dd>
              </dl>
            </section>
          )}
          {plugin.changelog[0] && (
            <section className="panel">
              <h2>Latest release</h2>
              <p className="mono"><strong>{plugin.changelog[0].version}</strong>{plugin.changelog[0].date && <span className="muted"> · {plugin.changelog[0].date}</span>}</p>
              <Markdown source={plugin.changelog[0].body} base={base} />
            </section>
          )}
          <section className="panel stack">
            <h2>Feedback</h2>
            <a className="btn btn-outline" href={`${repoUrl}/issues/new?title=${encodeURIComponent(`[${plugin.name}] `)}`}>Report an issue</a>
          </section>
        </aside>
      </div>
    </>
  );
}

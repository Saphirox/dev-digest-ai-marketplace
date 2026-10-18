import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';

// Plugin docs are third-party content: no page-wide CSS, inline styles or form controls.
const PURIFY = {
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'select', 'textarea'],
  FORBID_ATTR: ['style'],
};

/**
 * Renders repo Markdown; relative links and images resolve against the file's directory on GitHub.
 * In-page `#anchor` links also go to GitHub: the site's hash router owns the URL fragment.
 */
export function Markdown({ source, base }: { source: string; base: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false, gfm: true });
    const isAbsolute = (url: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
    const resolve = (url: string) => (isAbsolute(url) ? url : new URL(url, `${base}/`).href);
    // DOMPurify hooks are global. sanitize() is synchronous, so the hook is only active for this call;
    // finally keeps an exception from leaving it installed with a stale `base`.
    const hook = (node: Element) => {
      const href = node instanceof HTMLAnchorElement ? node.getAttribute('href') : null;
      if (href) {
        node.setAttribute('href', resolve(href));
        node.setAttribute('rel', 'noopener noreferrer');
      }
      const src = node instanceof HTMLImageElement ? node.getAttribute('src') : null;
      if (src) node.setAttribute('src', isAbsolute(src) ? src : resolve(src).replace('/blob/', '/raw/'));
    };
    DOMPurify.addHook('afterSanitizeAttributes', hook);
    try {
      return DOMPurify.sanitize(raw, PURIFY);
    } finally {
      DOMPurify.removeHook('afterSanitizeAttributes', hook);
    }
  }, [source, base]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

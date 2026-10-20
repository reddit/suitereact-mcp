/**
 * Security model for rendering doc-spaces document HTML.
 *
 * Document HTML is **untrusted** — any space editor can author it, and a
 * published doc is shown to every viewer who can read the space. To allow rich,
 * interactive documents (scripts, theme toggles, search, diagrams) without
 * exposing viewers to stored XSS, documents are rendered in an iframe whose
 * sandbox grants `allow-scripts` but deliberately **omits** `allow-same-origin`.
 *
 * That combination forces the framed document into an *opaque* origin: its
 * scripts execute, but they cannot read the parent NetSuite session, send
 * authenticated requests to the action-handler RESTlet, reach `document.cookie`,
 * or touch the host DOM. We also withhold `allow-popups`, `allow-forms`, and
 * `allow-top-navigation`, so a hostile doc cannot redirect the tab or phish.
 *
 * NEVER add `allow-same-origin` alongside `allow-scripts`: the HTML5 sandbox
 * spec notes that the pair lets framed content remove its own sandboxing, which
 * would re-open the stored-XSS hole on the NetSuite origin.
 */
export const DOC_IFRAME_SANDBOX = 'allow-scripts';

/**
 * Injected at render time (never stored). Dropping the same-origin `blob:` URL
 * means documents render via `srcDoc`, whose base URL is `about:srcdoc`; a bare
 * `<a href="#section">` click would otherwise navigate the sandboxed frame to
 * `about:srcdoc#section` and white it out. This handler intercepts in-page
 * anchor clicks and scrolls to the target instead.
 */
const ANCHOR_SCROLL_SCRIPT =
  '<script>(function(){function h(e){var t=e.target;' +
  "while(t&&t.nodeName!=='A')t=t.parentNode;" +
  "if(!t||!t.getAttribute)return;var u=t.getAttribute('href')||'';" +
  "if(u.charAt(0)!=='#'||u.length<2)return;" +
  'var el=document.getElementById(decodeURIComponent(u.slice(1)));' +
  "if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth',block:'start'});}}" +
  "document.addEventListener('click',h,false);})();</script>";

/**
 * Returns the document HTML with the in-page anchor-scroll helper appended.
 * Inserted just before `</body>` when present, otherwise at the end.
 */
export function augmentDocHtml(html: string | null): string {
  const s = String(html ?? '');
  if (!s) return s;
  const idx = s.toLowerCase().lastIndexOf('</body>');
  if (idx !== -1) {
    return s.slice(0, idx) + ANCHOR_SCROLL_SCRIPT + s.slice(idx);
  }
  return s + ANCHOR_SCROLL_SCRIPT;
}

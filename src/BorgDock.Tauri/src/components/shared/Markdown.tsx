import { type ComponentProps, type MouseEvent, useCallback } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

/**
 * Anchor renderer for markdown content. A bare `<a href>` inside the Tauri
 * webview navigates the window itself (the embedded SPA) instead of opening a
 * browser — so clicking a link in a PR comment would replace the whole detail
 * view with github.com. Intercept the click: hand real web/mail links to the OS
 * opener, and swallow in-page / relative hrefs so they can never blow away the
 * window either.
 */
function MarkdownLink({
  href,
  children,
  node: _node,
  ...rest
}: ComponentProps<'a'> & { node?: unknown }) {
  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (href && /^(https?:|mailto:)/i.test(href)) {
        import('@tauri-apps/plugin-opener')
          .then(({ openUrl }) => openUrl(href))
          .catch((err) => console.error('openUrl failed', err));
      }
    },
    [href],
  );

  return (
    <a {...rest} href={href} onClick={onClick} rel="noopener noreferrer">
      {children}
    </a>
  );
}

const MARKDOWN_COMPONENTS: Components = { a: MarkdownLink };

interface MarkdownProps {
  children: string;
  /** Allow raw HTML embedded in the markdown (rehype-raw). Defaults to true. */
  allowRawHtml?: boolean;
}

/**
 * Shared markdown renderer. Wraps react-markdown with the project's standard
 * GFM + sanitize pipeline and routes link clicks through the OS browser instead
 * of navigating the Tauri webview. Render inside a `.markdown-body` wrapper for
 * styling, exactly like the raw `<ReactMarkdown>` it replaces.
 */
export function Markdown({ children, allowRawHtml = true }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={allowRawHtml ? [rehypeRaw, rehypeSanitize] : [rehypeSanitize]}
      components={MARKDOWN_COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  );
}

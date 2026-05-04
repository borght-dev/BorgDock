import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface AssistantMarkdownProps {
  text: string;
}

/**
 * Render a Claude assistant message inside the hover popover. Uses GFM
 * (tables, fenced code) and rehype-sanitize for safety. No raw HTML — assistant
 * text is markdown-only, never trusted as HTML.
 */
export function AssistantMarkdown({ text }: AssistantMarkdownProps) {
  return (
    <div className="ag-assistant-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

import { Markdown } from '@/components/shared/Markdown';

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
      <Markdown allowRawHtml={false}>{text}</Markdown>
    </div>
  );
}

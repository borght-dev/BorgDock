import { useId, useState } from 'react';
import { Markdown } from './Markdown';
import './pr-description.css';

function descriptionPreview(body: string) {
  let boundary = 0;
  let paragraphs = 0;
  for (const match of body.matchAll(/\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|$)/g)) {
    const block = match[0];
    if (paragraphs >= 2 || (paragraphs > 0 && boundary + block.length > 650)) break;
    if (block.includes('```') || block.includes('~~~')) {
      if (paragraphs > 0) break;
      boundary = body.length;
      break;
    }
    boundary = match.index + block.length;
    if (block.trim() && !/^#{1,6}\s/.test(block)) paragraphs++;
  }
  return body.slice(0, boundary).trimEnd();
}

export function PrDescription({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const preview = descriptionPreview(body);
  const long = preview.length < body.trimEnd().length;
  return (
    <div className="bd-pr-description qr-card__desc">
      <div id={id} className="markdown-body">
        <Markdown>{open ? body : preview}</Markdown>
      </div>
      {long && (
        <button
          type="button"
          className="bd-pr-description__more qr-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Read full description'}
        </button>
      )}
    </div>
  );
}

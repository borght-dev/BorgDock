import { Markdown } from './Markdown';
import './pr-description.css';

export function PrDescription({ body }: { body: string }) {
  return (
    <div className="bd-pr-description qr-card__desc">
      <div className="markdown-body">
        <Markdown previewImages>{body}</Markdown>
      </div>
    </div>
  );
}

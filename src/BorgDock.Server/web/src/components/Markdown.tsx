import type { ReactNode } from 'react';

/** The subset of Markdown agents write: headings, lists, tables, code, bold, links. Builds elements, never HTML strings. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={`md ${className ?? ''}`}>{blocks(text.replace(/\r\n/g, '\n').split('\n'))}</div>;
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

function blocks(lines: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  const take = (test: (line: string) => boolean) => {
    const taken: string[] = [];
    while (i < lines.length && test(lines[i])) taken.push(lines[i++]);
    return taken;
  };
  while (i < lines.length) {
    const line = lines[i];
    const key = out.length;
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      i++;
      const code = take((l) => !l.startsWith('```'));
      i++;
      out.push(<pre key={key}><code>{code.join('\n')}</code></pre>);
    } else if (/^#{1,6}\s/.test(line)) {
      out.push(<h5 key={key}>{inline(line.replace(/^#+\s*/, ''))}</h5>);
      i++;
    } else if (isTableRow(line)) {
      const rows = take(isTableRow).filter((r) => !isTableRule(r)).map(cells);
      const [head, ...body] = rows;
      out.push(
        <div className="md-table" key={key}>
          <table>
            <thead><tr>{head.map((c, n) => <th key={n}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, n) => <tr key={n}>{r.map((c, m) => <td key={m}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (BULLET.test(line)) {
      out.push(<ul key={key}>{take((l) => BULLET.test(l)).map((l, n) => <li key={n}>{inline(l.replace(BULLET, ''))}</li>)}</ul>);
    } else if (NUMBERED.test(line)) {
      out.push(<ol key={key}>{take((l) => NUMBERED.test(l)).map((l, n) => <li key={n}>{inline(l.replace(NUMBERED, ''))}</li>)}</ol>);
    } else {
      const paragraph = take((l) => Boolean(l.trim()) && !/^(#{1,6}\s|```)/.test(l) && !isTableRow(l) && !BULLET.test(l) && !NUMBERED.test(l));
      out.push(<p key={key}>{inline(paragraph.join(' '))}</p>);
    }
  }
  return out;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)|]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, n) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return <code key={n}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={n}>{part.slice(2, -2)}</b>;
    const link = /^\[([^\]]+)\]\((.+)\)$/.exec(part);
    if (link) return <a key={n} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={n} href={part} target="_blank" rel="noopener noreferrer">{part.replace(/^https?:\/\//, '')}</a>;
    return part;
  });
}

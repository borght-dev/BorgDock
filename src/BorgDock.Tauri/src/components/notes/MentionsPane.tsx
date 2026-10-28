import { isRefToken, type RefToken, titleOf } from '@/services/notes/parse';
import { keyOfToken } from '@/services/notes/vault-index';
import { useNotesStore } from '@/stores/notes-store';
import { LocalGraphView } from './LocalGraphView';
import { RefChip } from './RefChip';

/** The line a mention sits on, without list and task markers, clipped. */
export function excerpt(text: string | undefined, line: number): string {
  const raw = text?.split(/\r?\n/)[line] ?? '';
  const clean = raw
    .replace(/^\s*(?:[-*+] (?:\[[ xX]\] )?|#{1,6} |\d+\. )/, '')
    .replace(
      /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
      (_m, target: string, label?: string) => (label ?? target).trim(),
    )
    .replace(/\[([^\]]*)\]\((?:t3code|borgdock|https?):\/\/[^)]+\)/g, '$1')
    .trim();
  return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
}

/**
 * MentionsPane — the Notes section's right column for the open note: the
 * notes that link to it, the references it makes, its tags and its local
 * graph.
 */
export function MentionsPane({ path }: { path: string }) {
  const index = useNotesStore((s) => s.index);
  const texts = useNotesStore((s) => s.texts);
  const context = useNotesStore((s) => s.context);
  const note = index.notes.get(path);
  const backlinks = index.backlinks.get(path) ?? [];

  const refs: RefToken[] = [];
  const seen = new Set<string>();
  for (const token of note?.tokens ?? []) {
    if (!isRefToken(token)) continue;
    const key = keyOfToken(token, context) ?? `${token.kind}:${token.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(token);
  }

  return (
    <aside className="bd-notes-side" aria-label="About this note">
      <section aria-labelledby="bd-notes-backlinks">
        <h2 id="bd-notes-backlinks" className="bd-notes-side__title">
          Linked mentions <span>{backlinks.length}</span>
        </h2>
        {backlinks.length === 0 ? (
          <p className="bd-notes-side__empty">No note links here yet.</p>
        ) : (
          <ul className="bd-notes-side__list">
            {backlinks.map((mention) => (
              <li key={mention.path}>
                <button
                  type="button"
                  className="bd-notes-mention"
                  onClick={() => useNotesStore.getState().open(mention.path)}
                >
                  <span className="bd-notes-mention__title">{titleOf(mention.path)}</span>
                  <span className="bd-notes-mention__line">
                    {excerpt(texts[mention.path], mention.line)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {refs.length > 0 && (
        <section aria-labelledby="bd-notes-refs">
          <h2 id="bd-notes-refs" className="bd-notes-side__title">
            In this note <span>{refs.length}</span>
          </h2>
          <div className="bd-notes-side__chips">
            {refs.map((token) => (
              <RefChip
                key={keyOfToken(token, context) ?? `${token.kind}:${token.from}`}
                token={token}
              />
            ))}
          </div>
        </section>
      )}
      {note && note.tags.length > 0 && (
        <section aria-labelledby="bd-notes-tags">
          <h2 id="bd-notes-tags" className="bd-notes-side__title">
            Tags
          </h2>
          <div className="bd-notes-side__chips">
            {note.tags.map((tag) => (
              <span key={tag} className="bd-note-tag">
                #{tag}
              </span>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="bd-notes-graph">
        <h2 id="bd-notes-graph" className="bd-notes-side__title">
          Local graph
        </h2>
        <LocalGraphView path={path} />
      </section>
    </aside>
  );
}

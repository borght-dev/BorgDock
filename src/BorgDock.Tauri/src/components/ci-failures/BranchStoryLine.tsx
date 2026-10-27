import { useState } from 'react';
import {
  askAuthor,
  askAuthorMessage,
  type BranchStory,
  openRevert,
  soleSuspectOf,
  storyLine,
} from '@/services/ci-failures/culprit';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { parseError } from '@/utils/parse-error';

interface BranchStoryLineProps {
  group: CiGroupSummary;
  story: BranchStory;
  /** Open PRs the failure still fails, for the comment to the author. */
  blockedPrs: readonly number[];
}

type Confirm = 'ask' | 'revert' | null;

async function openExternal(url: string) {
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

/**
 * BranchStoryLine — where a failure on the default branch came from ("Broke
 * after #123 by alice: …") and, with one suspect PR, what to do about it:
 * ask its author in a comment, or open a draft revert. Both write to GitHub
 * only after you confirm the text or the step.
 */
export function BranchStoryLine({ group, story, blockedPrs }: BranchStoryLineProps) {
  const suspect = soleSuspectOf(story) ?? undefined;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    void work()
      .then((note) => {
        setDone(note);
        setConfirm(null);
      })
      .catch((err) => setError(parseError(err).message))
      .finally(() => setBusy(false));
  };

  const startAsk = () => {
    if (!suspect) return;
    setMessage(askAuthorMessage({ suspect, story, failure: group.title, blockedPrs }));
    setConfirm('ask');
  };

  return (
    <div className="bd-ci-story" data-ci-story="">
      <div className="bd-ci-story__line">
        <span className="bd-ci-story__text" title={storyLine(story)}>
          {storyLine(story)}
        </span>
        {suspect && !confirm && (
          <span className="bd-ci-story__actions">
            <button
              type="button"
              className="bd-ci-link"
              disabled={busy}
              onClick={() => void openExternal(suspect.url)}
            >
              #{suspect.number}
            </button>
            <button type="button" className="bd-ci-link" disabled={busy} onClick={startAsk}>
              Ask {suspect.authorLogin ?? 'the author'}…
            </button>
            <button
              type="button"
              className="bd-ci-link"
              disabled={busy}
              onClick={() => setConfirm('revert')}
            >
              Revert…
            </button>
          </span>
        )}
      </div>
      {story.suspects.length > 1 && (
        <div className="bd-ci-story__suspects">
          {story.suspects.map((pr) => (
            <button
              key={pr.number}
              type="button"
              className="bd-ci-link bd-ci-link--quiet"
              title={pr.title}
              onClick={() => void openExternal(pr.url)}
            >
              #{pr.number}
              {pr.authorLogin ? ` ${pr.authorLogin}` : ''}
            </button>
          ))}
        </div>
      )}
      {suspect && confirm === 'ask' && (
        <div className="bd-ci-story__confirm">
          <label className="bd-ci-story__label" htmlFor={`bd-ci-ask-${group.id}`}>
            Comment on #{suspect.number}
          </label>
          <textarea
            id={`bd-ci-ask-${group.id}`}
            className="bd-ci-story__message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="bd-ci-story__buttons">
            <button
              type="button"
              className="bd-ci-link"
              disabled={busy || message.trim() === ''}
              onClick={() =>
                run(async () => {
                  await askAuthor(group, suspect, message.trim());
                  return `Asked on #${suspect.number}.`;
                })
              }
            >
              {busy ? 'Posting…' : 'Post comment'}
            </button>
            <button
              type="button"
              className="bd-ci-link bd-ci-link--quiet"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {suspect && confirm === 'revert' && (
        <div className="bd-ci-story__confirm">
          <p className="bd-ci-story__label">
            Open a draft pull request that reverts #{suspect.number}? It merges only when someone
            approves and merges it.
          </p>
          <div className="bd-ci-story__buttons">
            <button
              type="button"
              className="bd-ci-link"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const url = await openRevert(group, suspect, story);
                  await openExternal(url).catch(() => undefined);
                  return `Opened ${url.replace(/^.*\/pull\//, 'revert #')}.`;
                })
              }
            >
              {busy ? 'Opening…' : 'Open draft revert'}
            </button>
            <button
              type="button"
              className="bd-ci-link bd-ci-link--quiet"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {done && <div className="bd-ci-story__done">{done}</div>}
      {error && <div className="bd-ci-group__error">{error}</div>}
    </div>
  );
}

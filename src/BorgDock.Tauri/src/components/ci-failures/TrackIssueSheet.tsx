import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { parseScope } from '@/services/ci-failures/identity';
import * as store from '@/services/ci-failures/store-api';
import { createTrackingIssue, issueDraft, TRACKING_LABEL } from '@/services/ci-failures/tracking';
import type { CiGroupDetail } from '@/services/ci-failures/types';
import { getClientForRepo } from '@/services/github/singleton';
import { useCiBranch } from '@/stores/ci-failures-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast } from '@/stores/toast-store';
import { parseError } from '@/utils/parse-error';

interface TrackIssueSheetProps {
  groupId: string;
  onClose: () => void;
}

/**
 * TrackIssueSheet — opens a GitHub issue for a group so other machines and
 * teammates see who owns it. Everything that will be posted is shown and
 * editable first; nothing goes out until you press Create.
 */
export function TrackIssueSheet({ groupId, onClose }: TrackIssueSheetProps) {
  const username = useSettingsStore((s) => s.settings.gitHub.username);
  const [detail, setDetail] = useState<CiGroupDetail | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState(username);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const branch = useCiBranch(detail?.summary.scope ?? null);

  useEffect(() => {
    let cancelled = false;
    store
      .loadGroup(groupId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
      })
      .catch((err) => !cancelled && setError(parseError(err).message));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    if (!detail) return;
    const draft = issueDraft(detail, branch);
    setTitle(draft.title);
    setBody(draft.body);
  }, [detail, branch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const parts = detail ? parseScope(detail.summary.scope) : null;
  const create = () => {
    if (!detail || !parts) return;
    const client = getClientForRepo(parts.owner, parts.repo);
    if (!client) {
      setError('No GitHub client for this repository');
      return;
    }
    setCreating(true);
    setError(null);
    void createTrackingIssue(client, detail.summary, { title, body }, assignee.trim())
      .then((url) => {
        showToast({ tone: 'success', title: 'Tracking issue created', message: url });
        onClose();
      })
      .catch((err) => setError(parseError(err).message))
      .finally(() => setCreating(false));
  };

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bd-modal bd-dp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-ci-track-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-ci-track-title">Track on GitHub</h2>
          <p className="bd-dp-sheet__lede">
            Opens an issue in {parts ? `${parts.owner}/${parts.repo}` : 'the repository'} with the
            label <code>{TRACKING_LABEL}</code>. Its assignee is the owner every BorgDock sees. The
            body only carries hashes of the evidence, never the evidence itself.
          </p>
        </header>
        <div className="bd-dp-sheet__body">
          <div className="bd-dp-sheet__side">
            <section aria-label="Title" className="bd-dp-sheet__instructions">
              <h3 className="bd-dp-sheet__label">
                <span>Title</span>
              </h3>
              <input
                className="bd-dp-sheet__prompt"
                aria-label="Issue title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </section>
            <section aria-label="Assignee" className="bd-dp-sheet__instructions">
              <h3 className="bd-dp-sheet__label">
                <span>Assignee</span>
              </h3>
              <input
                className="bd-dp-sheet__prompt"
                aria-label="Assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              />
            </section>
            <section aria-label="Body" className="bd-dp-sheet__instructions">
              <h3 className="bd-dp-sheet__label">
                <span>Body</span>
              </h3>
              <textarea
                className="bd-dp-sheet__prompt"
                aria-label="Issue body"
                rows={14}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </section>
          </div>
        </div>
        <footer className="bd-dp-sheet__foot">
          {error && <span className="bd-ci-dialog__error">{error}</span>}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!detail || !title.trim() || creating}
            onClick={create}
          >
            {creating ? 'Creating…' : 'Create issue'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

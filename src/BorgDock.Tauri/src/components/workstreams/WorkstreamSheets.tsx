import { useState } from 'react';
import { Button, Input } from '@/components/shared/primitives';
import { isMainWindow, showWorkstream } from '@/services/navigation';
import { addMembers, setGoal } from '@/services/workstreams/edits';
import { WORKSTREAMS_ENABLED } from '@/services/workstreams/feature';
import { shortIdentity } from '@/services/workstreams/identity';
import { LIMITS } from '@/services/workstreams/types';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { type PendingAdd, useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { LinkPicker } from './LinkPicker';
import { AddToWorkstreamSheet } from './Membership';
import { Sheet } from './Sheet';
import { wsEdit } from './ws-ui';

function NewWorkstreamSheet({ preset, onClose }: { preset: PendingAdd; onClose: () => void }) {
  const [title, setTitle] = useState(preset.refs.length === 1 ? preset.refs[0]!.label : '');
  const [goal, setGoalText] = useState('');

  const create = () => {
    if (!title.trim()) return;
    const id = useWorkstreamsStore.getState().create(title);
    if (goal.trim()) wsEdit(id, (d, c) => setGoal(d, goal.trim(), c));
    if (preset.refs.length > 0) {
      wsEdit(id, (d, c) =>
        addMembers(
          d,
          preset.refs.map((r) => ({ ref: r.ref, label: r.label, role: 'primary' as const })),
          c,
        ),
      );
    }
    onClose();
    if (isMainWindow()) void showWorkstream(id);
  };

  return (
    <Sheet
      title="New workstream"
      subtitle="A goal, the records that serve it and the outcomes that prove it's reached."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="primary" size="md" disabled={!title.trim()} onClick={create}>
            Create
          </Button>
        </>
      }
    >
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">Title</span>
        <Input
          autoFocus
          aria-label="Title"
          value={title}
          maxLength={LIMITS.title}
          placeholder="Checkout in one step"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
        />
      </label>
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">Goal (optional, Markdown)</span>
        <textarea
          className="bd-dp-sheet__prompt bd-ws-goal__input"
          aria-label="Goal"
          rows={4}
          value={goal}
          maxLength={LIMITS.goal}
          placeholder="What is true once this is done?"
          onChange={(e) => setGoalText(e.target.value)}
        />
      </label>
      {preset.refs.length > 0 && (
        <section aria-label="Starts with">
          <h3 className="bd-dp-sheet__label">Starts with</h3>
          <ul className="bd-ws-picker__chosen">
            {preset.refs.map((r) => (
              <li key={shortIdentity(r.ref)}>
                <span className="bd-ws-picker__identity">{shortIdentity(r.ref)}</span>
                <span className="bd-ws-picker__label">{r.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}

/**
 * WorkstreamSheets — the New workstream sheet and the record picker, for the
 * whole main window: Dispatch rows, pull requests and the workstreams
 * themselves all open them through `workstreams-ui-store`.
 */
export function WorkstreamSheets() {
  const creating = useWorkstreamsUiStore((s) => s.creating);
  const picking = useWorkstreamsUiStore((s) => s.picking);
  const closeCreate = useWorkstreamsUiStore((s) => s.closeCreate);
  const closePicker = useWorkstreamsUiStore((s) => s.closePicker);
  const adding = useWorkstreamsUiStore((s) => s.adding);
  const closeAdd = useWorkstreamsUiStore((s) => s.closeAdd);
  if (!WORKSTREAMS_ENABLED) return null;
  return (
    <>
      {adding && <AddToWorkstreamSheet records={adding} onClose={closeAdd} />}
      {creating && <NewWorkstreamSheet preset={creating} onClose={closeCreate} />}
      {picking && (
        <LinkPicker
          workstreamId={picking.workstreamId}
          preset={picking.preset}
          onClose={closePicker}
        />
      )}
    </>
  );
}

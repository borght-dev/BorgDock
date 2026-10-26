import { useState } from 'react';
import { Button, Input, Select } from '@/components/shared/primitives';
import type { Assessment } from '@/services/workstreams/attention';
import { addRelation } from '@/services/workstreams/edits';
import { wouldCycle } from '@/services/workstreams/graph';
import {
  LIMITS,
  type NodeKey,
  type RelationKind,
  type WorkstreamDocument,
} from '@/services/workstreams/types';
import { nodeLabel, nodeOptions } from './labels';
import { Sheet } from './Sheet';
import { wsEdit } from './ws-ui';

interface RelationSheetProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  preset: { kind?: RelationKind; from?: NodeKey; to?: NodeKey };
  onClose: () => void;
}

const KINDS: readonly { value: RelationKind; label: string }[] = [
  { value: 'blocks', label: 'blocks' },
  { value: 'supersedes', label: 'supersedes' },
];

/**
 * RelationSheet — "A blocks B" or "A supersedes B". A relation that would
 * close a circle is refused before it is added, with the circle it makes.
 */
export function RelationSheet({ document, assessment, preset, onClose }: RelationSheetProps) {
  const options = nodeOptions(document, assessment);
  const [kind, setKind] = useState<RelationKind>(preset.kind ?? 'blocks');
  const [from, setFrom] = useState<NodeKey>(
    preset.from ?? options.find((o) => o.value !== preset.to)?.value ?? '',
  );
  const [to, setTo] = useState<NodeKey>(
    preset.to ?? options.find((o) => o.value !== from)?.value ?? '',
  );
  const [note, setNote] = useState('');
  const cycle = from && to ? wouldCycle(document.relations, kind, from, to) : null;
  const circle = cycle?.map((key) => nodeLabel(document, assessment, key)).join(' → ');

  const add = () => {
    if (wsEdit(document.id, (d, c) => addRelation(d, kind, from, to, note, c))) onClose();
  };

  return (
    <Sheet
      title="Add a relation"
      subtitle="A blocker keeps what it blocks from counting until it resolves."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button variant="primary" size="md" disabled={!from || !to || !!cycle} onClick={add}>
            Add relation
          </Button>
        </>
      }
    >
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">This</span>
        <Select ariaLabel="From" value={from} options={options} onChange={setFrom} />
      </label>
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">Relation</span>
        <Select
          ariaLabel="Relation"
          value={kind}
          options={KINDS}
          onChange={(next) => setKind(next as RelationKind)}
        />
      </label>
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">That</span>
        <Select
          ariaLabel="To"
          value={to}
          options={options.filter((o) => o.value !== from)}
          onChange={setTo}
        />
      </label>
      {cycle && (
        <p className="bd-ws-picker__error" role="alert">
          That makes a circle: {circle}.
        </p>
      )}
      <label className="bd-ws-field">
        <span className="bd-dp-sheet__label">Why (optional)</span>
        <Input
          aria-label="Why"
          value={note}
          maxLength={LIMITS.note}
          placeholder="The migration has to land first"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Sheet>
  );
}

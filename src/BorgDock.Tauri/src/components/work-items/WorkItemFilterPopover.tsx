import { Field, Select } from '@/components/shared/primitives';

export type TrackingFilter = 'all' | 'tracked' | 'workingOn';

interface Props {
  states: string[];
  assignees: string[];
  selectedState: string;
  selectedAssignee: string;
  trackingFilter: TrackingFilter;
  onStateChange: (s: string) => void;
  onAssigneeChange: (a: string) => void;
  onTrackingChange: (t: TrackingFilter) => void;
}

export function WorkItemFilterPopover(p: Props) {
  return (
    <div className="bd-wi-filter-popover">
      <Field label="State">
        <Select
          ariaLabel="State"
          value={p.selectedState}
          onChange={p.onStateChange}
          options={['All', ...p.states].map((s) => ({ value: s, label: s }))}
        />
      </Field>
      <Field label="Assignee">
        <Select
          ariaLabel="Assignee"
          value={p.selectedAssignee}
          onChange={p.onAssigneeChange}
          options={['Anyone', '@Me', ...p.assignees].map((s) => ({ value: s, label: s }))}
        />
      </Field>
      <Field label="Tracking">
        <Select
          ariaLabel="Tracking"
          value={p.trackingFilter}
          onChange={(v) => p.onTrackingChange(v as TrackingFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'tracked', label: 'Tracked' },
            { value: 'workingOn', label: 'Working on' },
          ]}
        />
      </Field>
    </div>
  );
}

import type { ProcessTab } from '@/services/ado/layout';
import type { DynamicFieldItem } from '@/types';

export interface PartitionedFields {
  richText: DynamicFieldItem[];
  standard: DynamicFieldItem[];
  custom: DynamicFieldItem[];
}

export interface DetailTabSlice {
  /** Stable key — `'overview'` for the implicit Details tab, page id otherwise. */
  id: string;
  label: string;
  fields: PartitionedFields;
}

interface AllFields extends PartitionedFields {}

function pick(items: DynamicFieldItem[], keys: Set<string>): DynamicFieldItem[] {
  return items.filter((f) => keys.has(f.fieldKey));
}

/**
 * Build the tab slices for the detail panel given the classified fields
 * for the current work item plus the layout-derived tabs (if any).
 *
 * - Without a layout: a single Overview tab containing every field
 *   (matches pre-Phase-2 behavior).
 * - With a layout: an Overview tab carrying detailsFieldKeys and any
 *   field that wasn't claimed by a custom page; one extra tab per
 *   ProcessTab carrying only that page's fields.
 */
export function buildDetailTabs(
  all: AllFields,
  detailsFieldKeys: string[] | undefined,
  extraTabs: ProcessTab[] | undefined,
  overviewLabel = 'Overview',
): DetailTabSlice[] {
  if (!extraTabs || extraTabs.length === 0) {
    return [{ id: 'overview', label: overviewLabel, fields: all }];
  }

  const claimed = new Set<string>();
  for (const tab of extraTabs) for (const k of tab.fieldKeys) claimed.add(k);

  const detailsSet = new Set<string>(detailsFieldKeys ?? []);

  const overviewKeys = new Set<string>();
  for (const f of [...all.richText, ...all.standard, ...all.custom]) {
    if (detailsSet.has(f.fieldKey) || !claimed.has(f.fieldKey)) {
      overviewKeys.add(f.fieldKey);
    }
  }

  const slices: DetailTabSlice[] = [
    {
      id: 'overview',
      label: overviewLabel,
      fields: {
        richText: pick(all.richText, overviewKeys),
        standard: pick(all.standard, overviewKeys),
        custom: pick(all.custom, overviewKeys),
      },
    },
  ];

  for (const tab of extraTabs) {
    const keys = new Set(tab.fieldKeys);
    const slice: DetailTabSlice = {
      id: tab.id,
      label: tab.label,
      fields: {
        richText: pick(all.richText, keys),
        standard: pick(all.standard, keys),
        custom: pick(all.custom, keys),
      },
    };
    const hasContent =
      slice.fields.richText.length > 0 ||
      slice.fields.standard.length > 0 ||
      slice.fields.custom.length > 0;
    if (hasContent) slices.push(slice);
  }

  return slices;
}

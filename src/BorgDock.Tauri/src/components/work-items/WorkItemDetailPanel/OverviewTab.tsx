// src/components/work-items/WorkItemDetailPanel/OverviewTab.tsx
import { useRef } from 'react';
import { useAdoImageAuth } from '@/hooks/useAdoImageAuth';
import { sanitizeHtml } from '@/utils/sanitize-html';
import type { DynamicFieldItem } from '@/types';

interface Props {
  richTextFields: DynamicFieldItem[];
  standardFields: DynamicFieldItem[];
  customFields: DynamicFieldItem[];
}

export function OverviewTab({ richTextFields, standardFields, customFields }: Props) {
  return (
    <div>
      {richTextFields.map((f) => (
        <BlockSection key={f.fieldKey} label={f.label}>
          {f.isHtml && f.htmlContent ? (
            <RichTextField html={f.htmlContent} />
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.65,
                color: 'var(--color-text-secondary)',
              }}
            >
              {f.value}
            </p>
          )}
        </BlockSection>
      ))}
      {standardFields.length > 0 && (
        <BlockSection label="Fields">
          <FieldGrid items={standardFields} />
        </BlockSection>
      )}
      {customFields.length > 0 && (
        <BlockSection label="Custom Fields">
          <FieldGrid items={customFields} />
        </BlockSection>
      )}
    </div>
  );
}

function BlockSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RichTextField({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useAdoImageAuth(ref, html);
  return (
    <div
      ref={ref}
      className="prose-sm rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] p-2 text-[13px] text-[var(--color-text-secondary)] [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via sanitizeHtml
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

function FieldGrid({ items }: { items: DynamicFieldItem[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 6, columnGap: 12 }}>
      {items.map((f) => (
        <FieldRow key={f.fieldKey} field={f} />
      ))}
    </div>
  );
}

function FieldRow({ field }: { field: DynamicFieldItem }) {
  if (!field.value && !field.htmlContent) return null;
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{field.label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{field.value}</span>
    </>
  );
}

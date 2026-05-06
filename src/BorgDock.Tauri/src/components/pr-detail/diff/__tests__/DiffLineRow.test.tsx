import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiffLineRow } from '../DiffLineRow';
import type { DiffLine } from '@/types';

const line = (over: Partial<DiffLine>): DiffLine =>
  ({
    type: 'add',
    content: 'console.log("x")',
    oldLineNumber: undefined,
    newLineNumber: 12,
    ...over,
  } as DiffLine);

describe('DiffLineRow', () => {
  it('renders the new line number for an add row', () => {
    render(
      <table><tbody>
        <DiffLineRow line={line({ type: 'add', newLineNumber: 12 })} />
      </tbody></table>,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders the old line number for a delete row', () => {
    render(
      <table><tbody>
        <DiffLineRow
          line={line({ type: 'delete', oldLineNumber: 7, newLineNumber: undefined })}
        />
      </tbody></table>,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('attaches data-line-kind based on line type', () => {
    const { container } = render(
      <table><tbody>
        <DiffLineRow line={line({ type: 'context' })} />
      </tbody></table>,
    );
    expect(container.querySelector('[data-line-kind="context"]')).not.toBeNull();
  });

  it('renders a thread chip when hasThread is true', () => {
    render(
      <table><tbody>
        <DiffLineRow
          line={line({ type: 'add', newLineNumber: 12 })}
          hasThread
          threadCount={2}
          onToggleThread={() => {}}
        />
      </tbody></table>,
    );
    expect(screen.getByRole('button', { name: /2 comments/i })).toBeInTheDocument();
  });

  it('chip toggles to "hide" when threadOpen is true', () => {
    render(
      <table><tbody>
        <DiffLineRow
          line={line({ type: 'add', newLineNumber: 12 })}
          hasThread
          threadCount={2}
          threadOpen
          onToggleThread={() => {}}
        />
      </tbody></table>,
    );
    expect(screen.getByRole('button', { name: /hide/i })).toBeInTheDocument();
  });

  it('applies highlight styling when highlight is true', () => {
    const { container } = render(
      <table><tbody>
        <DiffLineRow
          line={line({ type: 'add', newLineNumber: 12 })}
          highlight
        />
      </tbody></table>,
    );
    const tr = container.querySelector('tr');
    expect(tr?.getAttribute('style')).toContain('inset 3px 0 0');
  });
});

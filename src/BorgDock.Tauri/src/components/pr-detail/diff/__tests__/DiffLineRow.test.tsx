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
});

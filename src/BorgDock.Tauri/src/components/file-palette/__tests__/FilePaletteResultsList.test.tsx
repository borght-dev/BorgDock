import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FilePaletteResultsList } from '../FilePaletteResultsList';

const results = [
  { rel_path: 'src/footer.tsx', mode: 'filename' as const },
  { rel_path: 'src/header.tsx', mode: 'filename' as const },
];

describe('FilePaletteResultsList data-* contract', () => {
  it('renders [data-file-result] on each row', () => {
    const { container } = render(
      <FilePaletteResultsList results={results} selectedIndex={0} onHover={vi.fn()} onOpen={vi.fn()} rowRef={vi.fn()} />,
    );
    expect(container.querySelectorAll('[data-file-result]').length).toBe(2);
  });
  it('marks the selected row with [data-selected="true"]', () => {
    const { container } = render(
      <FilePaletteResultsList results={results} selectedIndex={0} onHover={vi.fn()} onOpen={vi.fn()} rowRef={vi.fn()} />,
    );
    expect(container.querySelector('[data-file-result][data-selected="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-file-result][data-selected="true"]').length).toBe(1);
  });
});

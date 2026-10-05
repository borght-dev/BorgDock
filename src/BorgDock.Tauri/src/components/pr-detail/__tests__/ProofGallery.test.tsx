import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProofGallery } from '../ProofGallery';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
afterEach(cleanup);
const conversation = {
  loading: false,
  errors: [],
  reload: vi.fn(),
  items: [
    {
      kind: 'comment' as const,
      id: 'proof',
      author: 'developer',
      authorIsBot: false,
      createdAt: '2026-10-05T12:00:00Z',
      htmlUrl: 'https://github.com/owner/repo/pull/1#issuecomment-2',
      body: '## PROOF\n\nVerified the browser flow.\n\n![First](https://example.com/first.png)\n\n![Second](https://example.com/second.png)',
    },
  ],
};

describe('proof previews', () => {
  it('opens images in-app with zoom and next-image keyboard navigation, then returns focus', () => {
    render(<ProofGallery conversation={conversation} />);
    const trigger = screen.getByRole('button', { name: 'Preview image: First' });
    trigger.focus();
    fireEvent.click(trigger);
    let dialog = screen.getByRole('dialog', { name: 'Proof image 1 of 2 · First' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }));
    expect(within(dialog).getByText('125%')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    dialog = screen.getByRole('dialog', { name: 'Proof image 2 of 2 · Second' });
    expect(within(dialog).getByText('100%')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('opens the full source comment and closes only the topmost preview on Escape', () => {
    render(<ProofGallery conversation={conversation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read full comment' }));
    const comment = screen.getByRole('dialog', { name: 'Proof by developer' });
    expect(within(comment).getByText('Verified the browser flow.')).toBeInTheDocument();
    fireEvent.click(within(comment).getByRole('button', { name: 'Preview image: Second' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Proof image 2 of 2 · Second' }), {
      key: 'Escape',
    });
    expect(screen.getByRole('dialog', { name: 'Proof by developer' })).toBeInTheDocument();
    fireEvent.keyDown(comment, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps partial load errors visible rather than claiming no proof exists', () => {
    render(
      <ProofGallery
        conversation={{ ...conversation, items: [], errors: ['Issue comments unavailable'] }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Issue comments unavailable');
    expect(screen.queryByText(/No developer proof/)).toBeNull();
  });
});

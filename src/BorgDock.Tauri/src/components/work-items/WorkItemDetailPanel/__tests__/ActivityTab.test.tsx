import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdoClient } from '@/services/ado/client';
import { activityComments, activityUpdates } from '../../__fixtures__/activity-data';
import { ActivityTab } from '../ActivityTab';

const getWorkItemUpdates = vi.hoisted(() => vi.fn());
vi.mock('@/services/ado/workitems', () => ({ getWorkItemUpdates }));

const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const client = {} as AdoClient;
const getClient = () => client;

function renderTab(props: Partial<Parameters<typeof ActivityTab>[0]> = {}) {
  return render(
    <ActivityTab
      itemId={4127}
      comments={activityComments(NOW)}
      isLoadingComments={false}
      getClient={getClient}
      now={NOW}
      {...props}
    />,
  );
}

describe('ActivityTab', () => {
  beforeEach(() => {
    getWorkItemUpdates.mockReset();
    getWorkItemUpdates.mockResolvedValue(activityUpdates(NOW));
  });

  it('shows revisions and comments by day, with counts per filter', async () => {
    renderTab();
    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Thu 5 Nov')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All\s?15$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Vera\s?7$/ })).toBeInTheDocument();
    expect(getWorkItemUpdates).toHaveBeenCalledWith(client, 4127);
  });

  it('filters to comments only', async () => {
    const { container } = renderTab();
    await screen.findByText('Today');
    fireEvent.click(screen.getByRole('button', { name: /^Comments\s?1$/ }));
    const kinds = [...container.querySelectorAll('[data-event]')].map((el) =>
      el.getAttribute('data-event'),
    );
    expect(kinds).toEqual(['comment']);
    expect(screen.getByText(/Customer confirmed/)).toBeInTheDocument();
  });

  it("folds the agent's steps into one run and unfolds them on the switch", async () => {
    const { container } = renderTab();
    await screen.findByText('Today');
    expect(container.querySelectorAll('[data-event="agent-run"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /3 more steps/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /Fold agent runs/ }));
    expect(container.querySelectorAll('[data-event="agent-run"]')).toHaveLength(7);
  });

  it('opens a step to show its full text and proof', async () => {
    renderTab();
    await screen.findByText('Today');
    fireEvent.click(screen.getByRole('button', { name: /3 more steps/ }));
    const step = screen.getByRole('button', { name: /GATE-REPAIR/ });
    expect(step).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(step);
    expect(step).toHaveAttribute('aria-expanded', 'true');
    const open = step.parentElement as HTMLElement;
    expect(within(open).getByText(/cites GetWeeklyOverview\.cs:304/)).toBeInTheDocument();
    expect(within(open).getByText('481c5a2a…172bbbb')).toBeInTheDocument();
  });

  it('posts a comment with Ctrl+Enter', async () => {
    const onAddComment = vi.fn(async () => {});
    renderTab({ onAddComment });
    await screen.findByText('Today');
    const input = screen.getByRole('textbox', { name: 'Comment' });
    fireEvent.change(input, { target: { value: 'Looks good on staging' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onAddComment).toHaveBeenCalledWith('Looks good on staging'));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('has no composer when read-only', async () => {
    renderTab({ onAddComment: vi.fn(async () => {}), readOnly: true });
    await screen.findByText('Today');
    expect(screen.queryByRole('textbox', { name: 'Comment' })).toBeNull();
  });

  it('still shows comments when the history cannot be read', async () => {
    getWorkItemUpdates.mockRejectedValue(new Error('403'));
    renderTab();
    expect(await screen.findByText(/History is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Customer confirmed/)).toBeInTheDocument();
  });
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Markdown } from '@/components/shared/Markdown';
import { useLinkStore } from '@/stores/link-store';
import type { WorkItem } from '@/types';
import { WorkItemCardView } from '../WorkItemHoverCard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const BUG: WorkItem = {
  id: 61021,
  rev: 4,
  url: '',
  relations: [],
  htmlUrl: 'https://dev.azure.com/org/FSP/_workitems/edit/61021',
  fields: {
    'System.WorkItemType': 'Bug',
    'System.State': 'Code Review',
    'System.Title': 'Planboard drag preview lands one resource lane too low',
    'System.AssignedTo': { displayName: 'Koen van der Borght' },
    'System.IterationPath': 'FSP\\Sprint 2026-22',
    'Microsoft.VSTS.Common.Priority': 2,
    'Microsoft.VSTS.TCM.ReproSteps': '<p>Scroll down, drag an order onto the last lane.</p>',
  },
};

describe('WorkItemCardView', () => {
  it('shows type, state, title, owner, sprint, priority, description and links', () => {
    render(
      <WorkItemCardView
        id={61021}
        peek={{ status: 'ready', item: BUG }}
        links={[{ key: 'pr:4812', lead: '#4812', label: 'checks passing', tone: 'ok' }]}
        canOpenWeb
      />,
    );
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Code Review')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Planboard drag preview lands one resource lane too low',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Koen van der Borght')).toBeInTheDocument();
    expect(screen.getByText('Sprint 2026-22')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('Scroll down, drag an order onto the last lane.')).toBeInTheDocument();
    expect(screen.getByText('#4812')).toBeInTheDocument();
    expect(screen.getByText('ADO', { exact: false })).toBeInTheDocument();
  });

  it('asks to connect Azure DevOps when it is not set up', () => {
    render(
      <WorkItemCardView id={7} peek={{ status: 'unconfigured' }} links={[]} canOpenWeb={false} />,
    );
    expect(screen.getByText('Connect Azure DevOps to see this work item.')).toBeInTheDocument();
  });
});

describe('AB# references in markdown', () => {
  it('turns AB#123 text and ADO links into work item references, not code', () => {
    const { container } = render(
      <Markdown>
        {'Fixes AB#61021, see [the bug](https://dev.azure.com/org/FSP/_workitems/edit/5). `AB#9`'}
      </Markdown>,
    );
    const refs = [...container.querySelectorAll('[data-work-item-ref]')].map((el) =>
      el.getAttribute('data-work-item-ref'),
    );
    expect(refs).toEqual(['61021', '5']);
    expect(screen.getByText('AB#9').tagName).toBe('CODE');
  });

  it('links AB# text inside raw HTML too', () => {
    const { container } = render(
      <Markdown>
        {'<details><summary>Linked</summary><table><tr><td>AB#42</td></tr></table></details>'}
      </Markdown>,
    );
    expect(container.querySelector('[data-work-item-ref="42"]')).toHaveTextContent('AB#42');
  });

  it('shows the card after resting on a reference', async () => {
    vi.useFakeTimers();
    useLinkStore.getState().setWorkItem(61021, BUG);
    render(<Markdown>{'Fixes AB#61021'}</Markdown>);
    fireEvent.mouseEnter(screen.getByText('AB#61021').parentElement!);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    // The card's module loads on the first hover.
    vi.useRealTimers();
    expect(
      await screen.findByRole('heading', {
        name: 'Planboard drag preview lands one resource lane too low',
      }),
    ).toBeInTheDocument();
  });
});

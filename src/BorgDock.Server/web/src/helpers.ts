import type { ItemOverview, WorkItemSummary } from '../../shared/src/api.ts';

export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const minutes = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function due(item: WorkItemSummary): { label: string; overdue: boolean } | null {
  if (!item.dueDate) return null;
  const date = new Date(item.dueDate);
  return { label: `Due ${date.getDate()} ${MONTHS[date.getMonth()]}`, overdue: date.getTime() < Date.now() };
}

export const shortState = (state: string) => ({ 'Development In Progress': 'In Progress', 'Ready For QA': 'Ready for QA' })[state] ?? state;

export function inProgressState(item: WorkItemSummary): string {
  return ['Development In Progress', 'In Progress', 'Active'].find((s) => item.workflow.includes(s)) ?? item.workflow[1] ?? item.state;
}

const STOP = new Set(['the', 'and', 'a', 'an', 'for', 'of', 'to', 'before', 'in', 'on', 'every', 'com', 'is', 'but', 'with']);

export function branchFor(item: WorkItemSummary): string {
  const prefix = item.type === 'PBI' ? 'feat' : item.type === 'Task' ? 'chore' : 'fix';
  const words = item.title.replace(/^Horizon \| /, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d{4,}$/.test(w));
  return `${prefix}/${item.id}-${words.slice(0, 4).join('-')}`;
}

export const fillPrompt = (template: string, item: WorkItemSummary) =>
  template.replaceAll('{id}', String(item.id)).replaceAll('{title}', item.title).replaceAll('{branch}', branchFor(item));

const MAIN_PATH = ['New', 'To Do', 'Development In Progress', 'In Progress', 'Code Review', 'Ready For QA', 'Done'];

/** Real workflows can have 20 states; show the main path plus wherever the item is and the suggested target. */
export function trackStates(item: WorkItemSummary, target: string | null): string[] {
  const flow = item.workflow;
  const main = MAIN_PATH.filter((s) => flow.includes(s));
  if (main.length < 3 || flow.length <= 7) return flow;
  for (const extra of [item.state, target]) if (extra && flow.includes(extra) && !main.includes(extra)) main.push(extra);
  return main.sort((a, b) => flow.indexOf(a) - flow.indexOf(b));
}

export const shortTitle = (title: string) => title.replace(/^Horizon \| /, '');

export function needsYouLabel(o: ItemOverview): string | null {
  const t = o.threads[0];
  if (!t) return null;
  return ({ question: 'Agent asks', plan: 'Plan to review', approval: 'Needs approval', 'your-turn': 'Your turn', failed: 'Agent failed' } as Record<string, string>)[t.status] ?? null;
}

// Desktop protocol launches or focuses T3; only the mobile app supports thread routes.
const ON_MOBILE = /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function t3Href(thread: { link: string; appLink: string }): string {
  return ON_MOBILE ? thread.appLink : thread.link;
}

export function t3LinkProps(thread: { link: string; appLink: string }) {
  return {
    href: t3Href(thread),
    title: ON_MOBILE ? undefined : 'Open this thread on its T3 host.',
  };
}

export function openInT3(thread: { link: string; appLink: string }) {
  location.href = t3Href(thread);
}

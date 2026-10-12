import type {
  AgentProject,
  AgentThread,
  DispatchItem,
  KnownPullRequest,
  ThreadPullRequest,
  WorkflowState,
} from '../types';

const STORY_FLOW: WorkflowState[] = [
  { name: 'New', category: 'Proposed' },
  { name: 'Development In Progress', category: 'InProgress' },
  { name: 'On Hold', category: 'InProgress' },
  { name: 'Code Review', category: 'Resolved' },
  { name: 'Ready For QA', category: 'Resolved' },
  { name: 'Done', category: 'Completed' },
];

export function makeItem(overrides: Partial<DispatchItem> & { id: number }): DispatchItem {
  const states = overrides.states ?? STORY_FLOW;
  const state = overrides.state ?? 'New';
  return {
    typeName: 'Product Backlog Item',
    title: `Item ${overrides.id}`,
    state,
    stateCategory: states.find((s) => s.name === state)?.category ?? 'Proposed',
    states,
    sprint: 'Sprint 12',
    dueDate: null,
    priority: 2,
    tags: [],
    assignedTo: 'Ada Lovelace',
    assignedToMe: true,
    url: `https://dev.azure.com/acme/Shop/_workitems/edit/${overrides.id}`,
    linkedPullRequests: [],
    changedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

export function makeThread(overrides: Partial<AgentThread> & { id: string }): AgentThread {
  return {
    hostId: 'local',
    hostLabel: 'This machine',
    available: true,
    projectId: 'p-w1',
    slot: 'W1',
    title: 'Some thread',
    branch: null,
    createdAt: '2026-10-01T08:00:00Z',
    lastActivityAt: '2026-10-02T08:00:00Z',
    open: true,
    status: 'your-turn',
    interactionMode: 'default',
    model: 'default',
    modelInstance: 'codex',
    effort: 'high',
    pullRequests: [],
    firstUserMessage: '',
    questionRequestId: null,
    questions: [],
    lastAgentMessage: null,
    ...overrides,
  };
}

export function makeThreadPr(
  overrides: Partial<ThreadPullRequest> & { number: number },
): ThreadPullRequest {
  return {
    url: `https://github.com/acme/shop/pull/${overrides.number}`,
    state: 'open',
    title: '',
    headBranch: null,
    isDraft: false,
    ...overrides,
  };
}

export function makeKnownPr(
  overrides: Partial<KnownPullRequest> & { number: number },
): KnownPullRequest {
  return {
    url: `https://github.com/acme/shop/pull/${overrides.number}`,
    state: 'open',
    title: '',
    isDraft: false,
    branch: null,
    workItemIds: [],
    checks: null,
    ...overrides,
  };
}

export const PROJECTS: AgentProject[] = ['W0', 'W1', 'W2'].map((title) => ({
  id: `p-${title.toLowerCase()}`,
  hostId: 'local',
  hostLabel: 'This machine',
  available: true,
  title,
  workspaceRoot: `/work/${title}`,
}));

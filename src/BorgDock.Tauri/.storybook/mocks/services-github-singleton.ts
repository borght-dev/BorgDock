// .storybook/mocks/services-github-singleton.ts
//
// Drop-in replacement for @/services/github/singleton. FilesTab (and other
// tab components) guard their fetch calls with `if (!client) return;` or
// `if (!client) throw`. Because the mock functions for getPRFiles etc. ignore
// the client argument entirely, we just need getClient() to return a non-null
// sentinel so those guards pass.

import { getControl } from './control';

/** Sentinel object — methods are never called since all service mocks ignore _client. */
const DUMMY_CLIENT = {
  get: async <T>(): Promise<T> => {
    throw new Error('services-github-singleton mock: direct client.get() not supported');
  },
  graphql: async <T>(): Promise<T> => {
    throw new Error('services-github-singleton mock: direct client.graphql() not supported');
  },
};

let _client: typeof DUMMY_CLIENT | null = null;

export function getClient(): typeof DUMMY_CLIENT | null {
  // Always return a non-null client so FilesTab / CommitsTab / DiscussionTab
  // guards pass and delegate to the mocked service functions.
  return _client ?? DUMMY_CLIENT;
}

export function initClient(tokenGetter: () => Promise<string>): typeof DUMMY_CLIENT {
  getControl().invocations.push({ command: 'github.initClient' });
  void tokenGetter; // consumed by PRDetailApp; ignored by mock
  _client = DUMMY_CLIENT;
  return _client;
}

export function resetClient(): void {
  _client = null;
}

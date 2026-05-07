// .storybook/mocks/services-windows.ts
//
// Mocks the subset of @/services/windows used by story modules.

import { getControl } from './control';

export interface OpenPrDetailArgs {
  owner: string;
  repo: string;
  number: number;
}

export async function openPrDetail(args: OpenPrDetailArgs): Promise<void> {
  getControl().invocations.push({ command: 'windows.openPrDetail', args });
}

export async function openWorkItemDetail(args: { workItemId: number }): Promise<void> {
  getControl().invocations.push({ command: 'windows.openWorkItemDetail', args });
}

export async function openWhatsNew(_version: string | null = null): Promise<void> {
  getControl().invocations.push({ command: 'windows.openWhatsNew' });
}

// .storybook/mocks/services-windows.ts
//
// Mocks the subset of @/services/windows used by FlyoutApp.

import { getControl } from './control';

export interface OpenPrDetailArgs {
  owner: string;
  repo: string;
  number: number;
}

export async function openPrDetail(args: OpenPrDetailArgs): Promise<void> {
  getControl().invocations.push({ command: 'windows.openPrDetail', args });
}

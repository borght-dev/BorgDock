// .storybook/mocks/services-pr-actions.ts
//
// Drop-in replacement for @/services/pr-actions. Each mutation records the
// call into getControl().invocations and returns true (success) by default.
//
// Override behaviour per-action via getControl().prActionResponses[name]:
//   '__throw__' → reject with an Error
//   '__fail__'  → resolve to false (production calls onError)
//   function    → call it; the function's return value is the result
//
// The 'name' key is the function name (e.g. 'mergePr', 'closePr').

import type {
  PrRef,
  MergePrOpts,
  ActionOpts,
  CheckoutOpts,
  ClosePrInput,
  ToggleDraftInput,
  RerunChecksInput,
  CheckoutInput,
} from '../../src/services/pr-actions';
import { getControl } from './control';

type Behavior = '__throw__' | '__fail__' | ((args: unknown) => unknown);

async function record<T>(name: string, args: unknown, defaultResult: T): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: `prAction.${name}`, args });
  const override = ctrl.prActionResponses[name] as Behavior | undefined;
  if (override === '__throw__') throw new Error(`mock prAction.${name} threw`);
  if (override === '__fail__') return false as unknown as T;
  if (typeof override === 'function') return (await override(args)) as T;
  return defaultResult;
}

export async function mergePr(pr: PrRef, opts?: MergePrOpts): Promise<boolean> {
  return record('mergePr', { pr, opts }, true);
}

export async function bypassMergePr(pr: PrRef, opts?: ActionOpts): Promise<boolean> {
  return record('bypassMergePr', { pr, opts }, true);
}

export async function closePr(pr: ClosePrInput, opts?: ActionOpts): Promise<boolean> {
  return record('closePr', { pr, opts }, true);
}

export async function toggleDraftPr(
  pr: ToggleDraftInput,
  opts?: ActionOpts,
): Promise<boolean> {
  return record('toggleDraftPr', { pr, opts }, true);
}

export async function rerunChecks(
  input: RerunChecksInput,
  opts?: ActionOpts,
): Promise<boolean> {
  return record('rerunChecks', { input, opts }, true);
}

export async function checkoutPrBranch(
  input: CheckoutInput,
  opts?: CheckoutOpts,
): Promise<boolean> {
  return record('checkoutPrBranch', { input, opts }, true);
}

export async function openPrInBrowser(
  htmlUrl: string,
  opts?: ActionOpts,
): Promise<boolean> {
  return record('openPrInBrowser', { htmlUrl, opts }, true);
}

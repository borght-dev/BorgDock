import type { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';

/**
 * Runs axe-core against the current page with WCAG 2.1 AA rule set.
 * Any violation fails the test with a readable message listing the
 * offending rule IDs, node counts, and link to the rule's help page.
 *
 * Use once at the end of each surface's describe block — one check
 * per surface is enough to catch regressions without inflating the
 * suite.
 *
 * Rules known to be violated today can be passed via `disableRules`
 * with a code comment pointing at the streamline PR that will fix
 * them. The test itself must still RUN — don't `test.skip` a11y
 * checks.
 */
export async function expectNoA11yViolations(
  page: Page,
  opts: { selector?: string; disableRules?: string[] } = {},
) {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);
  if (opts.selector) builder.include(opts.selector);
  if (opts.disableRules?.length) builder.disableRules(opts.disableRules);
  const { violations } = await builder.analyze();
  if (violations.length) {
    const report = violations
      .map((v) => `- [${v.id}] ${v.help} (${v.nodes.length} nodes)\n  ${v.helpUrl}`)
      .join('\n');
    expect.soft(violations, `Accessibility violations:\n${report}`).toHaveLength(0);
    // Hard-fail at end so the full report is attached
    expect(violations).toHaveLength(0);
  }
}

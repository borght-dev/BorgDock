import { describe, expect, it } from 'vitest';
import {
  DESIGN_PRS,
  DESIGN_WORK_ITEMS,
  DESIGN_DIFF,
} from '../design-fixtures';

describe('design-fixtures', () => {
  it('includes all PRs from the design canvas', () => {
    expect(DESIGN_PRS).toHaveLength(9);
    // Numeric sort (not lexicographic) — `.sort()` alone would place 1362 before 708.
    const numbers = DESIGN_PRS.map((p) => p.pullRequest.number).sort((a, b) => a - b);
    expect(numbers).toEqual([708, 710, 713, 714, 715, 1362, 1384, 1394, 1398]);
  });

  it('each PR has the fields the mockups render', () => {
    for (const entry of DESIGN_PRS) {
      const pr = entry.pullRequest;
      expect(pr.number).toBeGreaterThan(0);
      expect(pr.title).toBeTruthy();
      expect(pr.headRef).toBeTruthy();
      expect(pr.baseRef).toBeTruthy();
      expect(pr.authorLogin).toBeTruthy();
      expect(['open', 'closed', 'merged']).toContain(pr.state);
      expect(entry.overallStatus).toMatch(/^(green|red|yellow|gray)$/);
    }
  });

  it('includes the design work items', () => {
    expect(DESIGN_WORK_ITEMS.length).toBeGreaterThanOrEqual(1);
    for (const wi of DESIGN_WORK_ITEMS) {
      expect(wi.id).toBeGreaterThan(0);
      expect(wi.title).toBeTruthy();
    }
  });

  it('includes the design diff sample', () => {
    expect(DESIGN_DIFF.files.length).toBeGreaterThan(0);
    for (const file of DESIGN_DIFF.files) {
      expect(file.path).toBeTruthy();
      expect(file.hunks.length).toBeGreaterThan(0);
    }
  });

  it('DesignWorkItem.title mirrors fields[System.Title]', () => {
    for (const wi of DESIGN_WORK_ITEMS) {
      expect(wi.title).toBe(wi.fields['System.Title']);
    }
  });
});

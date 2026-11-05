import { describe, expect, it } from 'vitest';
import { matchesAnyGlob } from '../glob';

describe('matchesAnyGlob', () => {
  it('matches a name pattern at any depth', () => {
    expect(matchesAnyGlob('plans/AB61129-quote-plan.html', ['*.html'])).toBe(true);
    expect(matchesAnyGlob('docs/deep/plan.HTML', ['*.html'])).toBe(true);
    expect(matchesAnyGlob('src/page.html.ts', ['*.html'])).toBe(false);
  });

  it('matches everything under a folder name', () => {
    expect(matchesAnyGlob('web/plans/AB1/plan.md', ['plans'])).toBe(true);
    expect(matchesAnyGlob('web/plans/AB1/plan.md', ['plans/'])).toBe(true);
    expect(matchesAnyGlob('web/explans/plan.md', ['plans'])).toBe(false);
  });

  it('anchors a pattern with a slash at the root, unless it starts with **/', () => {
    expect(matchesAnyGlob('plans/a/plan.html', ['plans/**/*.html'])).toBe(true);
    expect(matchesAnyGlob('plans/plan.html', ['plans/**/*.html'])).toBe(true);
    expect(matchesAnyGlob('web/plans/plan.html', ['plans/**/*.html'])).toBe(false);
    expect(matchesAnyGlob('web/plans/plan.html', ['**/plans/*.html'])).toBe(true);
    expect(matchesAnyGlob('plans/a/plan.html', ['plans/*.html'])).toBe(false);
  });

  it('treats blank lines and comments as nothing, and escapes regex characters', () => {
    expect(matchesAnyGlob('a.html', ['', '  ', '# *.html'])).toBe(false);
    expect(matchesAnyGlob('a+b(1).md', ['a+b(?).md'])).toBe(true);
  });
});

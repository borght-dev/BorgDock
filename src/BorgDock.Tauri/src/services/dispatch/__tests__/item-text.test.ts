import { describe, expect, it } from 'vitest';
import type { WorkItemComment } from '@/types';
import { clip, htmlToText, newestNote, toItemComment } from '../item-text';

function comment(text: string, displayName = 'Koen van der Borght'): WorkItemComment {
  return {
    id: 1,
    text,
    createdBy: { displayName },
    createdDate: '2026-10-12T16:11:00Z',
    modifiedDate: '2026-10-12T16:11:00Z',
  };
}

describe('htmlToText', () => {
  it('turns block ends into lines, drops tags and decodes entities', () => {
    expect(
      htmlToText('<div><b>Update</b><br>PR <a href="x">#4908</a>&nbsp;is &amp; was</div>'),
    ).toBe('Update\nPR #4908 is & was');
  });

  it('breaks before a block opens, so a heading and its text stay apart', () => {
    expect(htmlToText('<b>Awaits definition</b><p>Current evidence</p>')).toBe(
      'Awaits definition\nCurrent evidence',
    );
  });

  it('decodes numeric entities', () => {
    expect(htmlToText('it&#39;s &#x2192; done')).toBe("it's → done");
  });
});

describe('clip', () => {
  it('cuts at a word and adds an ellipsis', () => {
    expect(clip('one two three four', 10)).toBe('one two…');
  });

  it('leaves short text alone', () => {
    expect(clip('short', 12)).toBe('short');
  });
});

describe('newestNote', () => {
  it('keeps only the newest dated block and reads its date', () => {
    const html =
      '<div><b>Update (2026-10-13) - Owned imaging replacement merged into main:</b><br><br>' +
      'PR #4908 is merged.<br><br></div>' +
      '<div><b>Update (2026-10-12) - Review repairs:</b><br>Older text.</div>';
    expect(newestNote(html)).toEqual({
      text: 'Owned imaging replacement merged into main: PR #4908 is merged.',
      date: '2026-10-13',
    });
  });

  it('has no date when the block names none', () => {
    expect(newestNote('<p>Filed by the weekly sweep.</p>')).toEqual({
      text: 'Filed by the weekly sweep.',
      date: null,
    });
  });

  it('is null for an empty or missing field', () => {
    expect(newestNote(undefined)).toBeNull();
    expect(newestNote('<div><br></div>')).toBeNull();
  });
});

describe('toItemComment', () => {
  it('attributes a comment an agent signed to the agent, not the account', () => {
    const result = toItemComment(
      comment('<div>Vera · implement — 66 pre-existing E2E errors block step 6.</div>'),
      'Koen van der Borght',
    );
    expect(result).toEqual({
      author: 'Vera · implement',
      at: '2026-10-12T16:11:00Z',
      text: '66 pre-existing E2E errors block step 6.',
      byMe: false,
    });
  });

  it('knows a comment I wrote myself', () => {
    const result = toItemComment(
      comment('<div><a href="#">@Vera Gomocha</a>&nbsp;fix all of the 66 errors.</div>'),
      'Koen van der Borght',
    );
    expect(result.byMe).toBe(true);
    expect(result.author).toBe('Koen van der Borght');
    expect(result.text).toBe('@Vera Gomocha fix all of the 66 errors.');
  });

  it('is not mine when my name is unknown', () => {
    expect(toItemComment(comment('Looks good'), null).byMe).toBe(false);
  });
});

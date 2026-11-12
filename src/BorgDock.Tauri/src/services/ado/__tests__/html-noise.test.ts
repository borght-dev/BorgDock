import { describe, expect, it } from 'vitest';
import { datedLog } from '../dated-log';
import { cleanHtml, gistText, markFailures } from '../html-noise';
import { developmentLinks, relatedLinks } from '../relations';

const EMAIL =
  '<div>' +
  '<p><b>CAUTION:</b> This email originated from outside of the organization. Do not click links.</p>' +
  '<p>Hi Support Team,</p>' +
  '<p>I noticed that the Holiday Timeplan is not visible in the new portal.</p>' +
  '<p><img src="https://dev.azure.com/acme/_apis/wit/attachments/1?fileName=image.png"></p>' +
  '<p><img src="cid:image003.png@01DA"></p>' +
  '<p>&nbsp;</p><p>&nbsp;</p>' +
  '<p>Kind regards,</p>' +
  '<p>Sam Peeters</p><p>IT Support Coordinator</p><p>+32 00 000 00 00</p>' +
  '<p><img src="https://example.com/logo.png" width="40" height="40"></p>' +
  '</div>';

describe('cleanHtml', () => {
  const cleaned = cleanHtml(EMAIL);

  it('folds the external-sender banner', () => {
    expect(cleaned.banner).toContain('originated from outside');
    expect(cleaned.html).not.toContain('originated from outside');
  });

  it('folds the signature from the sign-off on, naming the sender and its images', () => {
    expect(cleaned.signature?.sender).toBe('Sam Peeters');
    expect(cleaned.signature?.images).toBe(1);
    expect(cleaned.html).not.toContain('IT Support Coordinator');
  });

  it('drops images that can never load and blank runs, keeps real screenshots', () => {
    expect(cleaned.hiddenImages).toBe(1);
    expect(cleaned.html).not.toContain('cid:');
    expect(cleaned.html).toContain('fileName=image.png');
    expect(cleaned.html).not.toContain('&nbsp;');
    expect(cleaned.html).toContain('Holiday Timeplan');
  });

  it('leaves a field without email clutter as written', () => {
    const plain = '<p>Thanks to the new endpoint the overview is fast.</p><p>Second line.</p>';
    const result = cleanHtml(plain);
    expect(result.banner).toBeNull();
    expect(result.signature).toBeNull();
    expect(result.html).toBe(plain);
  });
});

describe('gistText', () => {
  it('reads what the item is about: no banner, no greeting, no signature', () => {
    expect(gistText(EMAIL)).toBe(
      'I noticed that the Holiday Timeplan is not visible in the new portal.',
    );
  });
});

describe('markFailures', () => {
  it('turns [FAILED] into a badge', () => {
    expect(markFailures('<li>Only the schedule shows. [FAILED]</li>')).toBe(
      '<li>Only the schedule shows. <span class="bd-wi-fails">Fails</span></li>',
    );
  });
});

describe('datedLog', () => {
  it('splits Developer Notes into dated entries, newest first, with titled parts', () => {
    const log = datedLog(
      '<p>Update (2026-11-11) — Holidays now show in the weekly overview:</p>' +
        '<p>What was wrong: the day read No schedule.</p>' +
        '<p>What changed: holidays render as blocks.</p>' +
        '<p>Update (2026-11-08) — Plan approved</p><p>One response, no new endpoint.</p>',
    );
    expect(log?.map((e) => [e.date, e.heading])).toEqual([
      ['2026-11-11', 'Holidays now show in the weekly overview'],
      ['2026-11-08', 'Plan approved'],
    ]);
    expect(log?.[0]?.sections).toEqual([
      { title: 'What was wrong', text: 'the day read No schedule.' },
      { title: 'What changed', text: 'holidays render as blocks.' },
    ]);
    expect(log?.[1]?.lines).toEqual(['One response, no new endpoint.']);
  });

  it('is null for a field that is not a dated log', () => {
    expect(datedLog('<p>Just a description.</p>')).toBeNull();
    expect(datedLog(undefined)).toBeNull();
  });
});

describe('relations', () => {
  const relations = [
    { rel: 'ArtifactLink', url: 'vstfs:///GitHub/PullRequest/0F3C1E5A-1111%2f812', attributes: {} },
    {
      rel: 'ArtifactLink',
      url: 'vstfs:///Git/Ref/proj%2Frepo%2FGBfix%2F4127-holidays',
      attributes: {},
    },
    { rel: 'ArtifactLink', url: 'vstfs:///Git/Commit/proj%2Frepo%2Fabc1234def', attributes: {} },
    { rel: 'System.LinkTypes.Related', url: 'https://x/_apis/wit/workItems/4125', attributes: {} },
    {
      rel: 'System.LinkTypes.Hierarchy-Reverse',
      url: 'https://x/_apis/wit/workItems/3980',
      attributes: {},
    },
    { rel: 'AttachedFile', url: 'https://x/_apis/wit/attachments/1', attributes: {} },
  ];

  it('reads pull requests, branches and commits for Development', () => {
    expect(developmentLinks(relations)).toEqual({
      pullRequests: [812],
      branches: ['fix/4127-holidays'],
      commits: ['abc1234def'],
    });
  });

  it('reads linked work items for Related Work, parent first', () => {
    expect(relatedLinks(relations)).toEqual([
      { kind: 'parent', id: 3980 },
      { kind: 'related', id: 4125 },
    ]);
  });
});

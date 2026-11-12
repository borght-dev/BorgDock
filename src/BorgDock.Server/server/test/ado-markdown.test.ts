import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown } from '../src/ado/markdown.ts';

const md = (html: string) => htmlToMarkdown(html, (src) => (src.startsWith('https://') ? src : null));

test('divs and paragraphs become paragraphs; br is a hard break; empty lines go', () => {
  assert.equal(md('<div>Open the basket.</div><div><br></div><div>Pay with iDEAL.<br>Wait for the receipt.</div><p>&nbsp;</p>'), 'Open the basket.\n\nPay with iDEAL.  \nWait for the receipt.');
});

test('headings, bold, italic, underline, strike and inline code', () => {
  assert.equal(md('<h2>Steps</h2><div><b>Bold</b> <i>italic</i> <u>under</u> <s>gone</s> <code>orderTotal()</code></div>'), '## Steps\n\n**Bold** *italic* **under** ~~gone~~ `orderTotal()`');
  assert.equal(md('<div>a<b> b </b>c</div>'), 'a **b** c', 'spaces stay outside the markers');
  assert.equal(md('<div><b>outer <strong>inner</strong></b></div>'), '**outer inner**', 'bold inside bold is bold once');
});

test('links keep their target; unsafe or empty ones keep only their text', () => {
  assert.equal(md('<div>See <a href="https://example.com/runbook">the runbook</a>.</div>'), 'See [the runbook](https://example.com/runbook).');
  assert.equal(md('<a href="javascript:alert(1)">click</a>'), 'click');
  assert.equal(md('<a href="https://example.com/a b">space</a>'), '[space](<https://example.com/a b>)');
});

test('lists, ordered with their start, nested both ways ADO writes them', () => {
  assert.equal(md('<ul><li>Basket</li><li>Receipt<ul><li>PDF</li><li>Email</li></ul></li></ul>'), '- Basket\n- Receipt\n  - PDF\n  - Email');
  assert.equal(md('<ol><li>Add three lines</li><ol><li>each € 4,133</li></ol><li>Check out</li></ol>'), '1. Add three lines\n   1. each € 4,133\n2. Check out');
  assert.equal(md('<ol start="3"><li>Third</li><li>Fourth</li></ol>'), '3. Third\n4. Fourth');
  assert.equal(md('<ul><li>one<li>two</ul>'), '- one\n- two', 'an unclosed li closes at the next');
});

test('tables: the first row is the header, cells escape pipes and keep their lines', () => {
  const html = '<table><tbody><tr><td><b>Where</b></td><td>Expected</td><td>Actual</td></tr><tr><td>Basket</td><td>€ 12,40</td><td>€ 12,40</td></tr>'
    + '<tr><td>Invoice</td><td>€ 12,40</td><td><div>€ 12,39</div><div>a | b</div></td></tr></tbody></table>';
  assert.equal(md(html), [
    '| **Where** | Expected | Actual |',
    '| --- | --- | --- |',
    '| Basket | € 12,40 | € 12,40 |',
    '| Invoice | € 12,40 | € 12,39<br>a \\| b |',
  ].join('\n'));
  assert.equal(md('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>'), '| A | B |\n| --- | --- |\n| 1 |  |', 'short rows are padded');
});

test('quotes, code blocks and rules', () => {
  assert.equal(md('<blockquote><div>Line one</div><div>Line two</div></blockquote>'), '> Line one\n>\n> Line two');
  assert.equal(md('<pre>const a = 1;\n  return a;</pre>'), '```\nconst a = 1;\n  return a;\n```');
  assert.equal(md('<div>above</div><hr><div>below</div>'), 'above\n\n---\n\nbelow');
});

test('images go where the resolver says; the rest of the text stays', () => {
  const signed = htmlToMarkdown(
    '<div>Before:<br><img src="https://dev.azure.com/acme/0f1e/_apis/wit/attachments/1b4e28ba-2fa1-11d2-883f-0016d3cca427?fileName=invoice.png" alt="invoice"></div><img src="data:image/png;base64,AAAA">',
    (src) => (src.includes('/_apis/wit/attachments/') ? '/api/items/61021/attachments/1b4e28ba-2fa1-11d2-883f-0016d3cca427?name=invoice.png&exp=1&sig=x' : null),
  );
  assert.equal(signed, 'Before:  \n![invoice](/api/items/61021/attachments/1b4e28ba-2fa1-11d2-883f-0016d3cca427?name=invoice.png&exp=1&sig=x)');
});

test('entities decode, and text that would read as markdown stays text', () => {
  assert.equal(md('<div>Tom &amp; Jerry &lt;3 &quot;quotes&quot; &#8364; &#x20AC; &rsquo;</div>'), 'Tom & Jerry \\<3 "quotes" € € ’');
  assert.equal(md('<div># not a heading</div><div>1. not a list</div><div>- nor this</div><div>*stars* and [brackets] and `ticks`</div>'),
    '\\# not a heading\n\n1\\. not a list\n\n\\- nor this\n\n\\*stars\\* and \\[brackets\\] and \\`ticks\\`');
  assert.equal(md('<div>snake_case stays, _leading goes</div>'), 'snake_case stays, \\_leading goes');
});

test('comments, scripts and styles are dropped; a span around blocks keeps their lines', () => {
  assert.equal(md('<!-- note --><style>.a{}</style><script>x()</script><div>Kept</div>'), 'Kept');
  assert.equal(md('<span style="color:red"><div>first</div><div>second</div></span>'), 'first\n\nsecond');
  assert.equal(md(''), '');
  assert.equal(md('plain text only'), 'plain text only');
});

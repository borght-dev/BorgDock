import assert from 'node:assert/strict';
import test from 'node:test';

const thread = {
  link: 'http://100.64.0.10:3773/0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  appLink: 't3code://threads/0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
};

const devices = [
  { name: 'Windows Chrome', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0', platform: 'Win32', maxTouchPoints: 0, expected: thread.link },
  { name: 'Mac desktop', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0, expected: thread.link },
  { name: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5, expected: thread.appLink },
  { name: 'iPad desktop mode', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5, expected: thread.appLink },
  { name: 'Android', userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', maxTouchPoints: 5, expected: thread.appLink },
];

for (const [index, device] of devices.entries()) {
  test(`${device.name} opens the exact thread on its owning host`, async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: device });
    const { t3Href, t3LinkProps, openInT3 } = await import(`../src/helpers.ts?device=${index}`);
    assert.equal(t3Href(thread), device.expected);
    const props = t3LinkProps(thread);
    assert.equal(props.href, device.expected);
    assert.equal('target' in props, false);
    const location = { href: '' };
    Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
    openInT3(thread);
    assert.equal(location.href, device.expected);
  });
}

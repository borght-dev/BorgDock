import { describe, expect, it } from 'vitest';
import { describeKey, describeTarget } from '../responsiveness';

function keydown(key: string, target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('describeTarget', () => {
  it('names the clickable element around what was hit', () => {
    document.body.innerHTML =
      '<button aria-pressed="false"><span id="hit">Hide failing</span></button>';
    expect(describeTarget(document.getElementById('hit'))).toBe("button 'Hide failing'");
  });

  it('prefers an accessible name over the text', () => {
    document.body.innerHTML = '<button id="hit" aria-label="Next file">→</button>';
    expect(describeTarget(document.getElementById('hit'))).toBe("button 'Next file'");
  });

  it('never reads what a field contains', () => {
    document.body.innerHTML = '<input id="hit" value="ghp_secret" />';
    expect(describeTarget(document.getElementById('hit'))).toBe('input');
  });

  it('describes a click outside any element as the window', () => {
    expect(describeTarget(window)).toBe('the window');
  });
});

describe('describeKey', () => {
  it('names shortcuts pressed outside a field', () => {
    expect(describeKey(keydown('v', document.body))).toBe('key v');
    expect(describeKey(keydown('ArrowDown', document.body, { shiftKey: true }))).toBe(
      'key Shift+ArrowDown',
    );
  });

  it('keeps typed characters out of the log', () => {
    const input = document.createElement('input');
    expect(describeKey(keydown('p', input))).toBe('typing in a text field');
    expect(describeKey(keydown('P', input, { shiftKey: true }))).toBe('typing in a text field');
  });

  it('still names shortcuts and named keys pressed in a field', () => {
    const input = document.createElement('textarea');
    expect(describeKey(keydown('k', input, { ctrlKey: true }))).toBe('key Ctrl+k');
    expect(describeKey(keydown('Enter', input))).toBe('key Enter');
  });
});

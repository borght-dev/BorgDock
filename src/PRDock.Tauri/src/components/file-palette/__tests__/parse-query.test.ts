import { describe, expect, it } from 'vitest';
import { parseQuery } from '../parse-query';

describe('parseQuery', () => {
  it('returns filename mode for plain text', () => {
    expect(parseQuery('login')).toEqual({ mode: 'filename', query: 'login' });
  });

  it('returns content mode for > prefix', () => {
    expect(parseQuery('>handleLogin')).toEqual({ mode: 'content', query: 'handleLogin' });
  });

  it('returns symbol mode for @ prefix', () => {
    expect(parseQuery('@Foo')).toEqual({ mode: 'symbol', query: 'Foo' });
  });

  it('strips leading whitespace after prefix', () => {
    expect(parseQuery('> foo')).toEqual({ mode: 'content', query: 'foo' });
    expect(parseQuery('@ Foo')).toEqual({ mode: 'symbol', query: 'Foo' });
  });

  it('returns empty query in filename mode when input is empty', () => {
    expect(parseQuery('')).toEqual({ mode: 'filename', query: '' });
  });

  it('treats bare prefix as empty query in that mode', () => {
    expect(parseQuery('>')).toEqual({ mode: 'content', query: '' });
    expect(parseQuery('@')).toEqual({ mode: 'symbol', query: '' });
  });

  it('does not interpret prefix in the middle of the query', () => {
    expect(parseQuery('foo>bar')).toEqual({ mode: 'filename', query: 'foo>bar' });
  });
});

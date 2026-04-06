import { describe, expect, it } from 'vitest';
import { getAdoAuthHeader } from '../auth';

function decodeHeader(header: string): string {
  return atob(header.replace('Basic ', ''));
}

describe('getAdoAuthHeader', () => {
  it('returns a Basic auth header with base64-encoded PAT', () => {
    const result = getAdoAuthHeader('my-pat-token');

    expect(result).toMatch(/^Basic /);
    expect(decodeHeader(result)).toBe(':my-pat-token');
  });

  it('prepends a colon before the PAT', () => {
    const result = getAdoAuthHeader('abc123');
    expect(decodeHeader(result)).toMatch(/^:/);
    expect(decodeHeader(result)).toBe(':abc123');
  });

  it('handles empty PAT string', () => {
    const result = getAdoAuthHeader('');
    expect(decodeHeader(result)).toBe(':');
  });

  it('handles PAT with special characters', () => {
    const pat = 'abc+/=!@#$%^&*()';
    const result = getAdoAuthHeader(pat);

    expect(result).toMatch(/^Basic /);
    expect(decodeHeader(result)).toBe(`:${pat}`);
  });

  it('produces different output for different PATs', () => {
    const result1 = getAdoAuthHeader('token-a');
    const result2 = getAdoAuthHeader('token-b');
    expect(result1).not.toBe(result2);
  });

  it('returns consistent output for same PAT', () => {
    const result1 = getAdoAuthHeader('same-token');
    const result2 = getAdoAuthHeader('same-token');
    expect(result1).toBe(result2);
  });
});

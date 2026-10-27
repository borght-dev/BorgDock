import type { JobLogEvidence, Signal } from '@/services/ci-failures/types';

/** A signal with every optional field empty, for tests and stories. */
export function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    kind: 'compile',
    parser: 'typescript',
    testId: null,
    params: null,
    path: null,
    line: null,
    column: null,
    code: null,
    errorClass: null,
    expected: null,
    actual: null,
    message: '',
    excerpt: [],
    frames: [],
    repeats: 1,
    ...overrides,
  };
}

/** A whole log read with nothing found, for tests and stories. */
export function makeEvidence(overrides: Partial<JobLogEvidence> = {}): JobLogEvidence {
  return {
    state: 'ready',
    reason: null,
    signals: [],
    stepFound: false,
    bytesRead: 0,
    totalBytes: null,
    truncated: false,
    retryAfterSecs: null,
    ...overrides,
  };
}

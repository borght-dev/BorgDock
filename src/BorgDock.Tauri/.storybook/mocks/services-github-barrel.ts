// .storybook/mocks/services-github-barrel.ts
//
// Drop-in replacement for the @/services/github barrel. Re-exports from
// the per-module mocks so consumers that import via the barrel
// (e.g. `import { getPRFiles } from '@/services/github'`) still hit our
// mocks instead of the production sub-modules.
//
// Without this barrel alias, Vite would resolve '@/services/github' to
// the production index.ts, which re-exports via relative paths — and
// those relative paths bypass our sub-path aliases.

export * from './services-github-pulls';
export * from './services-github-checks';
export * from './services-github-auth';
export * from './services-github-reviewThreads';
export * from './services-github-reviews';
export * from './services-github-singleton';

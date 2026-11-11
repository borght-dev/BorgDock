# Regression risk proof

Synthetic `acme/shop` PRs, rendered from the implemented Quick Review stories in this checkout. All sample code, people and findings are invented.

- [Card, dark](overlay-card-dark.png) and [light](overlay-card-light.png)
- [File walk, dark](overlay-walk-dark.png) and [light](overlay-walk-light.png)
- [Dependency update with its guide skipped](overlay-dependency-dark.png)
- [Older assessment after new commits](overlay-stale-dark.png)
- [Constrained layout, light](overlay-card-constrained-light.png)
- [Unknown assessment](section-unknown-dark.png)

Story IDs: `focus-quick-review--risk-on-card`, `focus-quick-review--risk-walk`, plus the component stories under `Focus/Quick review/Regression risk`.

## Validation

Opus ran TypeScript, the production build, touched-file Biome checks, Rust library tests and generated bindings, React Doctor, 13 Quick Review Playwright tests, and the focus/settings/risk Vitest suites. The full Vitest run had 4,436 passing tests and one timeout in the unchanged component-colors scan; that scan and contrast tests subsequently passed in isolation. CI provides the full current-head check.

## Real agent smoke test

[Parsed real Claude response](real-cli-assessment.json) was produced by Claude Sonnet at low effort on the synthetic refund diff, using the same restricted CLI flags and prompt builder as the application. No checkout context was provided. The actual response passed the production parser, produced Medium risk with four raising reasons and one lowering reason, and retained all five primary citations with zero unmatched citations. Tests cited in the response are source evidence, not executed tests.

This smoke test verifies prompt/CLI/parser compatibility on one synthetic input. It does not establish rating calibration, test the native Tauri IPC path, or verify production assessments. Storybook and mocked browser tests provide the UI evidence; the native application was not exercised.

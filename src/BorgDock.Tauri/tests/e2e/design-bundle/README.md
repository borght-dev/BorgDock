# Design bundle (frozen copy)

Verbatim copy of the Claude Design handoff bundle dated 2026-04-23
(see `docs/superpowers/specs/2026-04-24-shared-components-design.md`
for origin and intent).

**Do not edit.** Treat this tree as read-only. When the design is
updated upstream, replace the whole `borgdock/` subtree in one commit
so the baseline regeneration shows a coherent diff.

- `borgdock/project/BorgDock - Streamlined.html` — the primary
  artboard canvas; every visual baseline is captured from this file
  by `tests/e2e/scripts/capture-design-baselines.ts`.
- `borgdock/project/components/data.jsx` — mock fixtures; ported
  into `tests/e2e/fixtures/design-fixtures.ts` (see Task 4).
- `borgdock/project/uploads/DESIGN-SYSTEM.md` — canonical token
  catalog; consumed by Task 1 of PR #1 when `@theme` is wired up.

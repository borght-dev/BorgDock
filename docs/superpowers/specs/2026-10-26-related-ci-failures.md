# Related CI failures: grouping rules

Issue [#90](https://github.com/borght-dev/BorgDock/issues/90). Plan: `docs/superpowers/plans/2026-10-26-related-ci-failures-plan.html`. Code: `src/BorgDock.Tauri/src/services/ci-failures/` (rules) and `src/BorgDock.Tauri/src-tauri/src/ci_failures/` (evidence, store). Change a rule here and in the code together.

## Evidence

| Check kind | Read | Evidence state |
|---|---|---|
| GitHub Actions job | job metadata (attempt, tested SHA, failed step, runner), workflow run (path), failure annotations, log tail (2 MiB, 15 s) | `ready`, or `limited` when only annotations survive, `unavailable` (404/410/403), `failed` (retried with backoff) |
| Another app's check run | `output.title/summary/text` (8 KiB each), failure annotations | `ready` or `unavailable` |
| Commit status | its description | `limited` |

Every text is sanitized in Rust before it is stored, rendered, copied or put in a prompt (tokens, auth headers, credential query parameters, SAS signatures, URL credentials, connection strings, AWS keys, PEM blocks, `.npmrc` tokens, user home directories).

## Normalization

Runner workspace roots become repository-relative; temp paths, durations, timestamps, GUIDs, long hex ids, PIDs and ephemeral ports (32768 and up) become placeholders. Expected and actual values, error codes and well-known ports stay. Stack frames lose line numbers. Test parameters are split off the test identity.

## Fingerprints and tiers

| Kind | Fingerprint | Tier |
|---|---|---|
| Test with an id | `test:{parser}:{testId}\|{errorClass}\|{hash(message, expected, actual)}` | high |
| Compile error with a code | `compile:{code}:{path}\|{hash(message)}` | high |
| Lint | `lint:{rule}:{path}` | high |
| Catalog match (annotation, tooling, check output, generic) | `infra:{catalogId}:{failedStep}:{workflowPath}` | high with a step, medium without |
| Only generic words | `generic:{step}\|{hash}` | low: never grouped or suggested |
| Tooling | `tooling:{parser}:{code}\|{hash}` | high |
| Other app's output | `check-output:{app}:{check}\|{hash}` | high |
| Annotation | `annotation:{path}\|{hash}` | high |
| Specific generic-fallback text | `text:{step}\|{hash}` | medium |

Equal high fingerprints share a group. Equal medium fingerprints share one too, shown as "Possibly the same failure" with medium confidence; PR rows and Focus leave those groups out, the launch guard asks about one only when someone owns it, and Split takes a wrong one apart. Candidates (shown as "Possibly related", never merged by themselves): same test with a different message, same code and file with a different message, same catalog entry in another step or workflow, any cross-repository match within one account.

## Infrastructure catalog

`runner-lost`, `not-acquired` (also any `startup_failure`), `disk-full`, `dns`, `network-reset`, `registry-limit`, `registry-5xx`, `oom-kill`, `actions-service`. Patterns live in `catalog.ts`; bump `CATALOG_VERSION` when one changes what it matches.

## Hypotheses

Shown as "suggested", strongest first; a classification is what the user picks.

| Hypothesis | Raised by |
|---|---|
| Base branch | the group has occurrences on the default branch |
| Infrastructure | a catalog match, or only setup steps failed |
| Flaky | a later attempt of the same run passed |
| Branch-specific | one PR only, and the signal is in a file it changes |

Many affected PRs alone never raise a hypothesis.

## Shown where

- A group is **shared** with 2+ PRs, or 1 PR plus the default branch; **repeated** with 2+ occurrences in one PR; otherwise **single** and hidden.
- PR rows and Focus show shared, high-tier, unresolved groups only.

## Ownership

One live claim (`active`, `stale`, `launch_failed`) per group, enforced by a unique partial index. Owners: you, a terminal session (both leased, 24 h by default), a T3 thread (status from Dispatch, then local sessions; settled or failed is stale, a host offline 30 min is stale), a GitHub tracking issue (closed or unassigned is stale). A claim taken for a launch that never finished turns stale after 10 minutes.

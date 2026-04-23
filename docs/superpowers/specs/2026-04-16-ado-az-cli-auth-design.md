# Azure DevOps auth via `az` CLI with PAT fallback — Design spec

Date: 2026-04-16
Status: Approved via brainstorming; implementation plan to follow

## Problem

Azure DevOps authentication in BorgDock currently requires the user to paste a Personal Access Token. PATs expire (30–365 days), have to be rotated manually, and require the user to navigate the ADO UI to mint one. Meanwhile BorgDock already supports `gh auth token` for GitHub — users have `az login` sessions on the same machine but cannot use them. This spec describes replacing the PAT-only flow with an `az`-CLI-first flow that falls back to PAT when `az` is unavailable.

## Goals

1. When `az` is installed and the user is logged in, BorgDock uses their `az login` session automatically — no PAT required.
2. When `az` is absent or not logged in, the existing PAT flow still works exactly as today.
3. Token expiry is handled gracefully: short-lived `az` bearer tokens don't break polling after one hour.
4. Users retain explicit control — they can force PAT mode even with `az` installed (e.g. different Entra identity).
5. Existing ADO users who already have a PAT configured continue to work without re-entering anything.

## Non-goals

- Changing the existing GitHub `gh auth` flow.
- Adding an ADO step to the first-run setup wizard.
- Device-code / interactive Entra login from inside BorgDock (users are expected to run `az login` in a terminal).
- Multi-tenant / multi-identity selection UI (users pick identity outside BorgDock via `az account set`).
- Proactive token refresh with timers — refresh is lazy, driven by 401 responses.

## Summary of decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Refresh strategy | **Lazy refresh on 401.** Cache the header, reuse until a request returns 401, then refetch and retry once. No expiry tracking. |
| Auth-method UX | **Mirror GitHub exactly.** Radio buttons in `AdoSection.tsx` — "Azure CLI" / "Personal Access Token" — matching the existing `GitHubSection.tsx` pattern. |
| Auto-detect timing | **Exactly once per install**, gated by a persisted `auth_auto_detected` flag. On first mount of `AdoSection`, detect `az` and set the radio accordingly, then flip the flag true. Never re-fires, even if the user later toggles the radio back to the default value. |
| Wizard integration | **None.** ADO stays opt-in-later via Settings; wizard remains GitHub + repos only. |
| Token-resolution boundary | **Rust composes the full `Authorization` header string**; TS treats it as opaque. Encoding knowledge (Basic base64 vs Bearer prefix) stays in Rust. |
| Migration | **One-shot rewrite at settings load.** Existing installs with a stored PAT get `auth_method = "pat"` and `auth_auto_detected = true`. |

## Architecture

Three pieces. All are small.

### A. Rust auth helpers (`src-tauri/src/auth/mod.rs`)

Two new functions alongside the existing `gh_cli_token` at `auth/mod.rs:4`:

- **`az_cli_token() -> Result<String, AdoAuthError>`**. Runs `hidden_command("az")` with args `["account", "get-access-token", "--resource", "499b84ac-1321-427f-aa17-267ca6975798", "--query", "accessToken", "-o", "tsv"]`. The resource GUID is Azure DevOps's well-known Entra app ID. Returns the raw access token on success. Classifies failures:
  - `std::io::ErrorKind::NotFound` on spawn → `AdoAuthError::AzNotInstalled`.
  - Non-zero exit with `"az login"` (case-insensitive) in stderr → `AdoAuthError::AzNotLoggedIn`.
  - Any other non-zero exit → `AdoAuthError::TokenFetchFailed(stderr)`.
- **`az_cli_available() -> bool`** (Tauri command). Runs `hidden_command("az") --version` and returns whether it exited zero. Used by the UI on first mount to pick the default radio state. Intentionally does not test login state — that's surfaced inline when the user actually tries to connect.

### B. Rust header resolver (`src-tauri/src/auth/mod.rs`)

Lives in the same file as `gh_cli_token` and the new `az_cli_token` — all auth resolution for both providers is co-located.

One new Tauri command:

**`ado_resolve_auth_header(settings: AzureDevOpsSettings) -> Result<String, AdoAuthError>`**

Dispatches on `settings.auth_method`:

- `"azCli"` → calls `az_cli_token()`, returns `format!("Bearer {token}")`.
- `"pat"` → reads `settings.personal_access_token`. If `None` or empty, returns `AdoAuthError::MissingPat`. Otherwise returns `"Basic " + base64_encode(":" + pat)`, using whichever base64 crate/API the project already pulls in for its other Rust code (implementation detail — pick at plan time).
- Anything else → `AdoAuthError::InvalidMethod(s)`.

The returned string is a ready-to-use `Authorization` header *value*. TS never needs to know whether it's Basic or Bearer.

All three commands (`az_cli_token` is internal; `az_cli_available` and `ado_resolve_auth_header` are Tauri commands) register in `src-tauri/src/lib.rs` around line 86 alongside the existing invoke handlers.

### C. Settings model (`src-tauri/src/settings/models.rs:303`)

Add two fields to `AzureDevOpsSettings`:

```rust
#[serde(default = "default_ado_auth_method")]
pub auth_method: String,  // "azCli" | "pat"

#[serde(default)]
pub auth_auto_detected: bool,
```

With `fn default_ado_auth_method() -> String { "azCli".to_string() }`. The `auth_method` field mirrors `GitHubSettings::auth_method` at `models.rs:36`. The `auth_auto_detected` flag is specific to ADO — it prevents the first-mount detection from re-running after the user has toggled the radio manually, even if they happen to toggle back to the default value.

**Migration.** In the settings load path, after deserialization: if `auth_auto_detected == false` AND `personal_access_token` is `Some(non-empty)`, rewrite `auth_method = "pat"` and `auth_auto_detected = true` before returning. This preserves behavior for anyone upgrading from a version that only had PAT. The rewrite is idempotent — once `auth_auto_detected` is `true`, this branch no longer fires.

### D. TS `AdoClient` (`src/services/ado/client.ts:14`)

Shape change:

- Constructor stores a reference to `AzureDevOpsSettings` instead of pre-computing the header.
- Adds `private cachedHeader: string | null = null`.
- Adds `private async getAuthHeader(forceRefresh = false): Promise<string>` — if cached and not forcing, returns the cache; otherwise `invoke<string>('ado_resolve_auth_header', { settings: this.settings })` and caches the result.
- `fetchViaTauri` at `client.ts:32` is reworked to: resolve header → attach → send request → on HTTP 401, call `getAuthHeader(true)` to refetch, attach new header, retry once. Any other status (including 401 on the retry) surfaces to callers unchanged.
- `testConnection()` at `client.ts:207` uses the same path and therefore works transparently for both modes.

The public signature of `AdoClient` does not change; existing call sites (CommandPalette, WorkItemDetailApp, useAdoPolling, usePaletteSearch, useWorkItemHandlers, useWorkItemLinks) work without edits.

### E. TS UI (`src/components/settings/AdoSection.tsx`)

Mirror `GitHubSection.tsx:18–38`:

- Two radio buttons above the existing fields: "Azure CLI (recommended)" and "Personal Access Token".
- When `azCli` is selected: hide the PAT field. Show a one-line status:
  - Green: "Using your `az login` session" — if the last header resolve succeeded or hasn't been attempted yet and `az` is available.
  - Red (with recovery hint): one of the `AdoAuthError` messages in §Error handling below.
- When `pat` is selected: show the PAT field exactly as today.
- The existing "Test connection" button at `AdoSection.tsx:96` keeps its current behavior — it just calls `client.testConnection()`, which now works for both modes.

**First-mount auto-detect.** On mount, if `settings.azureDevOps.auth_auto_detected == false`: call `invoke('az_cli_available')`. If it returns `true`, keep `auth_method = "azCli"` (the default); if `false`, set `auth_method = "pat"`. Either way, set `auth_auto_detected = true` and persist. This runs exactly once per install. Any subsequent radio toggle by the user is preserved — the flag guarantees detection never re-fires, even if the user toggles back to the default value.

## Data flow

**Happy path — Azure CLI mode.**

1. User opens ADO Settings. AdoSection mounts. `auth_method = "azCli"` (default or user choice). `az_cli_available()` returns `true` → radio shows Azure CLI, status line green.
2. User hits "Test connection" (or any polling cycle fires). `AdoClient.fetchViaTauri` calls `getAuthHeader()` → `invoke('ado_resolve_auth_header', { settings })` → Rust runs `az account get-access-token …` → returns `"Bearer eyJ0eXAiOiJKV1Q..."`.
3. TS attaches the header, `invoke('ado_fetch', { url, headers, … })` runs, response 200. Cached header reused for subsequent requests.

**Happy path — PAT mode.** Same as above but `ado_resolve_auth_header` returns `"Basic <base64(':'+pat)>"`.

**401 refresh path.**

1. Cached header → request → 401 response from `ado_fetch`.
2. `AdoClient` calls `getAuthHeader(true)` → Rust fetches a fresh token / re-encodes PAT → new header cached.
3. Original request replayed with the new header.
4. Success → done. 401 again → surface to caller, bubble up as a connection error, UI flips status line to red.

**Auth-method switch.**

1. User toggles radio from `azCli` to `pat` (or vice-versa). onChange handler updates settings and persists.
2. Next `AdoClient` construction picks up new settings. Any extant client: cache is invalidated by a watcher on the settings' `auth_method` field — on change, set `cachedHeader = null`.
3. Next request resolves a fresh header via the new method.

**First-mount auto-detect.**

1. AdoSection mounts on a fresh install. `auth_method = "azCli"` (default), `auth_auto_detected = false`, `personal_access_token = None`.
2. `az_cli_available()` returns `false` (az not installed).
3. Hook updates settings to `auth_method = "pat"`, `auth_auto_detected = true`, persists.
4. Radio now shows PAT. User pastes PAT, hits Test, all works. Future mounts skip the detection step because the flag is set.

## Error handling + UX copy

`AdoAuthError` is a serde-serializable Rust enum that crosses the Tauri boundary. TS discriminates on the tag:

| Variant | Tag | Status line (red) | Action hint |
|---|---|---|---|
| `AzNotInstalled` | `"az_not_installed"` | "Azure CLI not found on PATH" | Link to `https://aka.ms/azcli` + "Switch to PAT" button |
| `AzNotLoggedIn` | `"az_not_logged_in"` | "Not logged in to Azure" | "Run `az login` in a terminal, then click Retry" |
| `TokenFetchFailed(String)` | `"token_fetch_failed"` | "Couldn't fetch Azure token: {msg}" | Generic "Retry" button |
| `MissingPat` | `"missing_pat"` | "Personal Access Token required" | Focus the PAT input |
| `InvalidMethod(String)` | `"invalid_method"` | "Invalid auth method in settings" | Unreachable in practice; logs to devtools |

401 at request time that survives one refresh retry surfaces as a connection error through the existing `AdoClient` error path; the status line picks it up from the same place `testConnection()` does today.

## Security notes

- The `az` bearer token is returned from Rust → TS via `invoke`. This briefly exposes the token to the JS runtime. Acceptable because (a) the GitHub flow already does the same with `gh auth token`, (b) BorgDock runs locally as the user with the same trust boundary as `az` itself, (c) the alternative (Approach 3 from brainstorming) would require a much larger refactor of `ado_fetch`.
- PATs continue to be stored in the settings file the same way they are today (unencrypted on disk, per the existing model). This is unchanged by this spec.
- No new secrets are logged. `TokenFetchFailed(stderr)` passes through `az`'s stderr, which may contain hints but not tokens; a safety filter strips any `eyJ`-prefixed strings defensively before bubbling to the UI.

## Testing plan

**Rust unit tests.**

- `ado_resolve_auth_header` dispatch: `"azCli"` branch mocked via a trait-injected command runner to return a fixed token, verify `Bearer <token>` output.
- `"pat"` branch: verify `Basic <base64>` with a known PAT and known expected encoding.
- `MissingPat` when PAT is `None` or empty string.
- `InvalidMethod` when `auth_method` is an unknown value.
- `az_cli_token` stderr-parsing: given sample stderrs ("ERROR: Please run 'az login' …" / "command not found" via simulated `ErrorKind::NotFound` / generic failure), verify correct `AdoAuthError` variant.

**Rust integration test.** Settings-load migration: write a settings JSON with a PAT and no `auth_method`, load it, assert `auth_method == "pat"` after migration.

**Manual walkthroughs.**

1. Fresh install with `az` logged in → open ADO Settings → radio defaults to Azure CLI, status green, Test passes.
2. Fresh install with `az` not installed → radio defaults to PAT, existing flow unchanged.
3. Fresh install with `az` installed but not logged in → radio defaults to Azure CLI, status line shows NotLoggedIn, user runs `az login` in terminal, hits Retry, green.
4. Upgrade from PAT-only build with a stored PAT → first open shows PAT radio selected, no behavior change.
5. Mid-session token revocation: connect in azCli mode, `az account clear`, trigger a poll → 401 observed, refresh attempt fails, status line goes red with NotLoggedIn.
6. Method toggle: with az logged in and a PAT stored, flip radio azCli ↔ pat, verify both paths connect.

**Existing tests.** The AdoClient public surface is unchanged, so existing ADO test suite (if any) passes as-is. No test deletions.

## Rollout

Single release, no feature flag. The migration step (§C) handles upgraders deterministically. If anything regresses, reverting the release restores PAT-only behavior — nothing in the on-disk schema becomes unreadable because `auth_method` is additive and `#[serde(default)]`-guarded on the way in.

## Out of scope / future work

- Device-code login initiated from within BorgDock (would need an Entra app registration and a webview flow).
- Supporting GitHub-hosted Azure DevOps equivalents (not a thing, included for symmetry).
- Adding a Linux/macOS "az via keychain" path — `hidden_command("az")` already works on any platform where `az` is installed and on PATH.
- Pre-emptive token refresh based on `expiresOn`. Revisit only if the lazy-on-401 path causes visible latency during polling.

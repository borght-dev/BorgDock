# ADO auth via `az` CLI with PAT fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PAT-only Azure DevOps auth flow in BorgDock with an `az`-CLI-first flow that auto-detects `az login` on first use and falls back to PAT when `az` is unavailable, while preserving behavior for existing PAT users on upgrade.

**Architecture:** A new Rust command `ado_resolve_auth_header` composes the full `Authorization` header value — either `Basic base64(":"+pat)` for PAT mode or `Bearer <token>` obtained by spawning `az account get-access-token`. The TS `AdoClient` asks Rust for a header on first use, caches it, and on any 401 response re-requests a fresh header and retries once. An `auth_auto_detected` boolean in settings gates the one-time first-mount detection so the radio selector stays stable after the user has made an explicit choice.

**Tech Stack:** Rust (Tauri 2 commands, reqwest, keyring), TypeScript (React 19, Zustand, Vitest), `az` CLI on the user's PATH.

---

## Spec adjustments (read before starting)

Two deviations from the brainstormed spec at `docs/superpowers/specs/2026-04-16-ado-az-cli-auth-design.md` — kept here for continuity:

1. **Migration lives in TS, not Rust.** The spec described migration as a Rust settings-load rewrite that checks `settings.personal_access_token`. Reality: PATs are already stripped from `settings.json` into the OS keychain by `migrate_credentials_to_keychain` at `src-tauri/src/settings/mod.rs:11`, and re-hydrated into the in-memory settings object by the TS store at `src/stores/settings-store.ts:118-121`. The natural place for "if a PAT exists in keychain, force `authMethod = 'pat'`" is therefore **right after the keychain hydration in the TS store**, not in Rust. The Rust-side change stays limited to adding the two new fields to the settings model.

2. **"isConfigured" gates need updating.** The spec said the public AdoClient signature wouldn't change, but several call sites (`useAdoPolling.ts:28`, `WorkItemsSection.tsx:151`) gate on `!!personalAccessToken` as a proxy for "fully configured". In `azCli` mode the PAT is empty — these checks would falsely report "not configured". Plan adds Task 10 to update each gate to `authMethod === 'azCli' || !!personalAccessToken`.

Both adjustments preserve the spec's intent. The plan uses them as its source of truth.

---

## File structure

**New files:**

```
src/BorgDock.Tauri/src-tauri/src/auth/ado.rs         # AdoAuthError, az_cli_token, az_cli_available,
                                                   # format_pat_header, ado_resolve_auth_header
src/BorgDock.Tauri/src/services/ado/__tests__/client.test.ts  # Vitest tests for AdoClient
```

**Modified files:**

```
src/BorgDock.Tauri/src-tauri/Cargo.toml              # Add base64 dep
src/BorgDock.Tauri/src-tauri/src/auth/mod.rs         # pub mod ado;
src/BorgDock.Tauri/src-tauri/src/lib.rs              # Register 3 new Tauri commands
src/BorgDock.Tauri/src-tauri/src/settings/models.rs  # AzureDevOpsSettings: +auth_method, +auth_auto_detected
src/BorgDock.Tauri/src/types/settings.ts             # AdoAuthMethod type, new fields
src/BorgDock.Tauri/src/stores/settings-store.ts      # Migration + default values
src/BorgDock.Tauri/src/services/ado/client.ts        # Constructor, getAuthHeader, 401 retry
src/BorgDock.Tauri/src/components/settings/AdoSection.tsx  # Radio, auto-detect, status line
src/BorgDock.Tauri/src/hooks/useAdoPolling.ts        # isConfigured gate
src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx  # Same gate
src/BorgDock.Tauri/src/components/command-palette/CommandPalette.tsx  # Pass authMethod
src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.tsx  # Same
src/BorgDock.Tauri/src/hooks/usePaletteSearch.ts     # Same (2 places)
src/BorgDock.Tauri/src/hooks/useAdoImageAuth.ts      # Same
```

---

## Task 1: Add base64 crate and declare ado auth submodule

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/Cargo.toml` — add base64 dep
- Modify: `src/BorgDock.Tauri/src-tauri/src/auth/mod.rs:1` — declare submodule
- Create: `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs` — empty placeholder

- [ ] **Step 1: Add base64 to Cargo.toml**

In `src/BorgDock.Tauri/src-tauri/Cargo.toml` after the `chrono = "0.4"` line (currently line 48):

```toml
base64 = "0.22"
```

- [ ] **Step 2: Create the empty submodule file**

Create `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs` with a single line:

```rust
// ADO auth resolver — az CLI token fetching + PAT header formatting.
```

- [ ] **Step 3: Declare the submodule from `auth/mod.rs`**

Insert at the very top of `src/BorgDock.Tauri/src-tauri/src/auth/mod.rs` (above line 1 `use crate::git::hidden_command;`):

```rust
pub mod ado;

```

- [ ] **Step 4: Verify the build picks up the new dep and module**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: successful compile, new `base64` crate downloaded on first run.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/Cargo.toml src/BorgDock.Tauri/src-tauri/Cargo.lock src/BorgDock.Tauri/src-tauri/src/auth/mod.rs src/BorgDock.Tauri/src-tauri/src/auth/ado.rs
git commit -m "chore(ado-auth): scaffold ado auth submodule + base64 dep"
```

---

## Task 2: AdoAuthError enum and error classifier (TDD)

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs`

- [ ] **Step 1: Write failing unit tests for the classifier**

Append to `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs`:

```rust
use serde::Serialize;
use std::io;

/// Errors that `ado_resolve_auth_header` may surface to the UI.
/// Serialized as a tagged enum so TS can discriminate.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AdoAuthError {
    AzNotInstalled,
    AzNotLoggedIn,
    TokenFetchFailed(String),
    MissingPat,
    InvalidMethod(String),
}

/// Pure classifier for az-cli failures. Extracted for testability —
/// `az_cli_token` delegates to this after running the command.
pub(crate) fn classify_az_error(
    spawn_err: Option<io::ErrorKind>,
    exit_code: Option<i32>,
    stderr: &str,
) -> AdoAuthError {
    if spawn_err == Some(io::ErrorKind::NotFound) {
        return AdoAuthError::AzNotInstalled;
    }
    if spawn_err.is_some() {
        return AdoAuthError::TokenFetchFailed(format!(
            "failed to spawn az: {:?}",
            spawn_err.unwrap()
        ));
    }
    let lowered = stderr.to_ascii_lowercase();
    if lowered.contains("az login")
        || lowered.contains("please run 'az login'")
        || lowered.contains("not logged in")
    {
        return AdoAuthError::AzNotLoggedIn;
    }
    AdoAuthError::TokenFetchFailed(format!(
        "az exited {} — {}",
        exit_code.unwrap_or(-1),
        stderr.trim()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_spawn_not_found_is_not_installed() {
        let err = classify_az_error(Some(io::ErrorKind::NotFound), None, "");
        assert!(matches!(err, AdoAuthError::AzNotInstalled));
    }

    #[test]
    fn classify_spawn_permission_denied_is_token_fetch_failed() {
        let err = classify_az_error(Some(io::ErrorKind::PermissionDenied), None, "");
        assert!(matches!(err, AdoAuthError::TokenFetchFailed(_)));
    }

    #[test]
    fn classify_az_login_stderr_is_not_logged_in() {
        let err = classify_az_error(
            None,
            Some(1),
            "ERROR: Please run 'az login' to setup account.",
        );
        assert!(matches!(err, AdoAuthError::AzNotLoggedIn));
    }

    #[test]
    fn classify_generic_stderr_is_token_fetch_failed() {
        let err = classify_az_error(None, Some(2), "some other error");
        match err {
            AdoAuthError::TokenFetchFailed(msg) => {
                assert!(msg.contains("az exited 2"));
                assert!(msg.contains("some other error"));
            }
            _ => panic!("expected TokenFetchFailed"),
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib auth::ado::tests`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/auth/ado.rs
git commit -m "feat(ado-auth): AdoAuthError enum + az error classifier"
```

---

## Task 3: `az_cli_token()` and `az_cli_available()`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs`

- [ ] **Step 1: Implement `az_cli_token` using the classifier**

Append to `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs` (above the `#[cfg(test)] mod tests` block):

```rust
use crate::git::hidden_command;

const ADO_RESOURCE_ID: &str = "499b84ac-1321-427f-aa17-267ca6975798";

/// Fetch an Azure DevOps bearer token via `az account get-access-token`.
/// Returns the raw token on success, or a classified `AdoAuthError`.
pub fn az_cli_token() -> Result<String, AdoAuthError> {
    let result = hidden_command("az")
        .args([
            "account",
            "get-access-token",
            "--resource",
            ADO_RESOURCE_ID,
            "--query",
            "accessToken",
            "-o",
            "tsv",
        ])
        .output();

    let output = match result {
        Ok(o) => o,
        Err(e) => return Err(classify_az_error(Some(e.kind()), None, "")),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(classify_az_error(None, output.status.code(), &stderr));
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err(AdoAuthError::TokenFetchFailed(
            "az returned empty token".to_string(),
        ));
    }
    Ok(token)
}

/// Cheap "is az installed?" probe — runs `az --version` and returns
/// whether it exited successfully. Does not test login state; that
/// surfaces naturally when a token fetch is attempted.
#[tauri::command]
pub fn az_cli_available() -> bool {
    hidden_command("az")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
```

- [ ] **Step 2: Verify compile**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: successful compile. Existing tests still pass if you re-run `cargo test --lib auth::ado::tests`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/auth/ado.rs
git commit -m "feat(ado-auth): az_cli_token() and az_cli_available() helpers"
```

---

## Task 4: `ado_resolve_auth_header()` with PAT formatter (TDD)

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs` — register 3 commands

- [ ] **Step 1: Write failing tests for `format_pat_header` and the PAT branch of the resolver**

In `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs`, extend the existing `#[cfg(test)] mod tests` block with:

```rust
    #[test]
    fn format_pat_header_prepends_colon_and_base64_encodes() {
        // ":hello" → "OmhlbGxv" (standard base64)
        let header = format_pat_header("hello");
        assert_eq!(header, "Basic OmhlbGxv");
    }

    #[test]
    fn resolve_header_pat_mode_returns_basic() {
        let result = resolve_header_internal("pat", Some("abc123".to_string()));
        assert_eq!(result.unwrap(), "Basic OmFiYzEyMw==");
    }

    #[test]
    fn resolve_header_pat_mode_missing_pat_errors() {
        let result = resolve_header_internal("pat", None);
        assert!(matches!(result.unwrap_err(), AdoAuthError::MissingPat));
    }

    #[test]
    fn resolve_header_pat_mode_empty_pat_errors() {
        let result = resolve_header_internal("pat", Some("".to_string()));
        assert!(matches!(result.unwrap_err(), AdoAuthError::MissingPat));
    }

    #[test]
    fn resolve_header_invalid_method_errors() {
        let result = resolve_header_internal("xyz", None);
        match result.unwrap_err() {
            AdoAuthError::InvalidMethod(m) => assert_eq!(m, "xyz"),
            _ => panic!("expected InvalidMethod"),
        }
    }
```

- [ ] **Step 2: Run tests — should fail with "undefined function format_pat_header / resolve_header_internal"**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib auth::ado::tests`
Expected: compile error about undefined names.

- [ ] **Step 3: Implement `format_pat_header` and `resolve_header_internal`**

Append to `src/BorgDock.Tauri/src-tauri/src/auth/ado.rs` (above the `#[cfg(test)] mod tests` block):

```rust
use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Compose a `Basic` Authorization header value for an ADO PAT.
/// ADO accepts an empty username, so the encoded payload is `":<pat>"`.
pub(crate) fn format_pat_header(pat: &str) -> String {
    format!("Basic {}", STANDARD.encode(format!(":{pat}")))
}

/// Pure dispatch — extracted for testability. `az_cli_token` is only
/// called by the public Tauri command below, which wraps this.
pub(crate) fn resolve_header_internal(
    method: &str,
    pat: Option<String>,
) -> Result<String, AdoAuthError> {
    match method {
        "azCli" => {
            let token = az_cli_token()?;
            Ok(format!("Bearer {token}"))
        }
        "pat" => match pat.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => Ok(format_pat_header(p)),
            _ => Err(AdoAuthError::MissingPat),
        },
        other => Err(AdoAuthError::InvalidMethod(other.to_string())),
    }
}

/// Tauri command — returns a ready-to-use `Authorization` header value
/// based on the caller-supplied auth method and optional PAT.
#[tauri::command]
pub fn ado_resolve_auth_header(
    auth_method: String,
    pat: Option<String>,
) -> Result<String, AdoAuthError> {
    resolve_header_internal(&auth_method, pat)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib auth::ado::tests`
Expected: 9 tests pass (4 classifier + 5 resolver).

- [ ] **Step 5: Register the three Tauri commands in `lib.rs`**

In `src/BorgDock.Tauri/src-tauri/src/lib.rs`, inside the `invoke_handler` macro call, update the `// Auth` section (currently lines 90–93) to:

```rust
            // Auth
            auth::gh_cli_token,
            auth::validate_pat,
            auth::check_github_auth,
            auth::ado::az_cli_available,
            auth::ado::ado_resolve_auth_header,
```

(Note: `az_cli_token` is *not* registered — it's an internal helper called only by `ado_resolve_auth_header`.)

- [ ] **Step 6: Verify end-to-end compile**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: successful compile.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/auth/ado.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(ado-auth): ado_resolve_auth_header Tauri command"
```

---

## Task 5: Add `auth_method` and `auth_auto_detected` to `AzureDevOpsSettings`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/settings/models.rs:301-344`

- [ ] **Step 1: Add the two fields to the struct**

In `src/BorgDock.Tauri/src-tauri/src/settings/models.rs`, update the `AzureDevOpsSettings` struct (currently lines 301–323) by inserting two fields just after `project: String` (line 307):

```rust
    #[serde(default = "default_ado_auth_method")]
    pub auth_method: String,
    #[serde(default)]
    pub auth_auto_detected: bool,
```

- [ ] **Step 2: Add the default function**

Directly above the existing `fn default_ado_poll_interval()` (currently line 325), add:

```rust
fn default_ado_auth_method() -> String {
    "azCli".to_string()
}
```

- [ ] **Step 3: Update the `Default` impl**

In the `impl Default for AzureDevOpsSettings` block (currently lines 329–343), add two fields to the struct literal — insert after `project: String::new(),`:

```rust
            auth_method: default_ado_auth_method(),
            auth_auto_detected: false,
```

- [ ] **Step 4: Verify compile**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: successful compile.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/settings/models.rs
git commit -m "feat(ado-auth): AzureDevOpsSettings gains authMethod + authAutoDetected"
```

---

## Task 6: Add fields and type to TS side

**Files:**
- Modify: `src/BorgDock.Tauri/src/types/settings.ts:79-90`
- Modify: `src/BorgDock.Tauri/src/stores/settings-store.ts` — extend `defaultSettings`

- [ ] **Step 1: Add the `AdoAuthMethod` type and update `AzureDevOpsSettings`**

In `src/BorgDock.Tauri/src/types/settings.ts`, after line 1 (`export type AuthMethod = 'ghCli' | 'pat';`), add:

```typescript
export type AdoAuthMethod = 'azCli' | 'pat';
```

Then update the `AzureDevOpsSettings` interface (lines 79–90) by inserting two fields after `project: string;`:

```typescript
  authMethod: AdoAuthMethod;
  authAutoDetected: boolean;
```

- [ ] **Step 2: Update `defaultSettings` in settings-store.ts**

Open `src/BorgDock.Tauri/src/stores/settings-store.ts` and find the `defaultSettings` constant near the top (search for `azureDevOps:` inside it). Inside its `azureDevOps` object, add the two fields:

```typescript
    authMethod: 'azCli',
    authAutoDetected: false,
```

- [ ] **Step 3: Verify TS compile**

Run: `cd src/BorgDock.Tauri && npm run build`
Expected: successful type-check and bundle. If type errors appear in test fixtures that don't include the new fields, those will be fixed in Task 9.

If the build fails only due to missing fields in fixture/test files, that's expected — proceed; Task 9 handles call-site and fixture updates. Otherwise investigate.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/types/settings.ts src/BorgDock.Tauri/src/stores/settings-store.ts
git commit -m "feat(ado-auth): TS types + default for authMethod/authAutoDetected"
```

---

## Task 7: Migration for existing ADO PAT users in the TS settings store

**Files:**
- Modify: `src/BorgDock.Tauri/src/stores/settings-store.ts:108-144` (loadSettings)

- [ ] **Step 1: Write a failing Vitest test for the migration logic**

Check whether `src/BorgDock.Tauri/src/stores/__tests__/settings-store.test.ts` exists:

```bash
ls src/BorgDock.Tauri/src/stores/__tests__/ 2>/dev/null
```

If yes, append to it. If no, create `src/BorgDock.Tauri/src/stores/__tests__/settings-store.test.ts` with:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../settings-store';

describe('settings-store ADO auth migration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSettingsStore.setState({ isLoading: false, hasLoaded: false });
  });

  it('forces authMethod to pat when an ADO PAT exists in keychain and authAutoDetected is false', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === 'load_settings') {
        return {
          setupComplete: true,
          gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 30, username: '' },
          repos: [],
          ui: {},
          notifications: {},
          claudeCode: {},
          claudeApi: { model: '', maxTokens: 4096 },
          claudeReview: { botUsername: '' },
          updates: { autoCheckEnabled: true, autoDownload: true },
          azureDevOps: {
            organization: 'myorg',
            project: 'myproj',
            authMethod: 'azCli',
            authAutoDetected: false,
            pollIntervalSeconds: 120,
            favoriteQueryIds: [],
            trackedWorkItemIds: [],
            workingOnWorkItemIds: [],
            workItemWorktreePaths: {},
            recentWorkItemIds: [],
          },
          sql: { connections: [] },
          repoPriority: {},
        };
      }
      if (cmd === 'get_credential') {
        const service = (args as { service: string }).service;
        if (service === 'borgdock:azure_devops') return 'existing-pat-value';
        return null;
      }
      return null;
    });

    await useSettingsStore.getState().loadSettings();

    const settings = useSettingsStore.getState().settings;
    expect(settings.azureDevOps.personalAccessToken).toBe('existing-pat-value');
    expect(settings.azureDevOps.authMethod).toBe('pat');
    expect(settings.azureDevOps.authAutoDetected).toBe(true);
  });

  it('leaves authMethod as azCli when no ADO PAT in keychain and authAutoDetected is false', async () => {
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string) => {
      if (cmd === 'load_settings') {
        return {
          setupComplete: false,
          gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 30, username: '' },
          repos: [],
          ui: {},
          notifications: {},
          claudeCode: {},
          claudeApi: { model: '', maxTokens: 4096 },
          claudeReview: { botUsername: '' },
          updates: { autoCheckEnabled: true, autoDownload: true },
          azureDevOps: {
            organization: '',
            project: '',
            authMethod: 'azCli',
            authAutoDetected: false,
            pollIntervalSeconds: 120,
            favoriteQueryIds: [],
            trackedWorkItemIds: [],
            workingOnWorkItemIds: [],
            workItemWorktreePaths: {},
            recentWorkItemIds: [],
          },
          sql: { connections: [] },
          repoPriority: {},
        };
      }
      return null;
    });

    await useSettingsStore.getState().loadSettings();

    const settings = useSettingsStore.getState().settings;
    expect(settings.azureDevOps.authMethod).toBe('azCli');
    expect(settings.azureDevOps.authAutoDetected).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/BorgDock.Tauri && npm run test -- settings-store`
Expected: first test FAILS (authMethod is still 'azCli', authAutoDetected still false).

- [ ] **Step 3: Add migration logic in `loadSettings`**

In `src/BorgDock.Tauri/src/stores/settings-store.ts`, locate the block ending around line 121 (`if (adoPat) settings.azureDevOps.personalAccessToken = adoPat;`). Replace that one line with:

```typescript
      if (adoPat) {
        settings.azureDevOps.personalAccessToken = adoPat;
        // Migration: existing users with a stored PAT but no prior
        // auto-detect run — pin to PAT mode and mark as detected so
        // AdoSection's first-mount hook doesn't clobber their choice.
        if (!settings.azureDevOps.authAutoDetected) {
          settings.azureDevOps.authMethod = 'pat';
          settings.azureDevOps.authAutoDetected = true;
        }
      }
```

- [ ] **Step 4: Re-run the tests to verify they pass**

Run: `cd src/BorgDock.Tauri && npm run test -- settings-store`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/stores/settings-store.ts src/BorgDock.Tauri/src/stores/__tests__/settings-store.test.ts
git commit -m "feat(ado-auth): migrate existing PAT users to authMethod=pat on hydrate"
```

---

## Task 8: `AdoClient` refactor — async header caching + 401 retry (TDD)

**Files:**
- Modify: `src/BorgDock.Tauri/src/services/ado/client.ts`
- Create: `src/BorgDock.Tauri/src/services/ado/__tests__/client.test.ts`

- [ ] **Step 1: Write failing Vitest tests**

Create `src/BorgDock.Tauri/src/services/ado/__tests__/client.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { AdoClient } from '../client';

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

describe('AdoClient header resolution', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('resolves the header once and reuses it across requests', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return 'Bearer tok-1';
      if (cmd === 'ado_fetch') {
        return {
          status: 200,
          status_text: 'OK',
          body: '{"ok":true}',
          body_base64: null,
          headers: {},
        };
      }
      throw new Error('unexpected command: ' + cmd);
    });

    const client = new AdoClient('org', 'proj', 'pat-unused', 'azCli');
    await client.get('projects');
    await client.get('projects');

    const resolveCalls = invokeMock.mock.calls.filter((c) => c[0] === 'ado_resolve_auth_header');
    expect(resolveCalls).toHaveLength(1);
  });

  it('refreshes the header and retries once on a 401', async () => {
    const resolveResponses = ['Bearer tok-1', 'Bearer tok-2'];
    let resolveIdx = 0;
    const fetchResponses = [
      { status: 401, status_text: 'Unauthorized', body: '', body_base64: null, headers: {} },
      { status: 200, status_text: 'OK', body: '{"ok":true}', body_base64: null, headers: {} },
    ];
    let fetchIdx = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return resolveResponses[resolveIdx++];
      if (cmd === 'ado_fetch') return fetchResponses[fetchIdx++];
      throw new Error('unexpected');
    });

    const client = new AdoClient('org', 'proj', 'p', 'azCli');
    const result = await client.get<{ ok: boolean }>('projects');

    expect(result).toEqual({ ok: true });
    expect(resolveIdx).toBe(2);
    expect(fetchIdx).toBe(2);
  });

  it('surfaces AdoAuthError when the 401 persists after the retry', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return 'Bearer tok';
      if (cmd === 'ado_fetch') {
        return { status: 401, status_text: 'Unauthorized', body: '', body_base64: null, headers: {} };
      }
      throw new Error('unexpected');
    });

    const client = new AdoClient('org', 'proj', 'p', 'azCli');
    await expect(client.get('projects')).rejects.toThrow(/authentication failed/i);
  });
});
```

- [ ] **Step 2: Run the tests — expect compile/type errors**

Run: `cd src/BorgDock.Tauri && npm run test -- client.test`
Expected: tests FAIL with "Expected 3-4 arguments, but got 4" or similar — signature mismatch on the new 4th constructor arg.

- [ ] **Step 3: Refactor `AdoClient` — signature, caching, retry**

Replace the contents of `src/BorgDock.Tauri/src/services/ado/client.ts` up through the end of `testConnection` (lines 1–204) with the new implementation. Here is the full replacement up to (but not including) the two exported error classes at the bottom — keep those exports intact:

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { AdoAuthMethod } from '@/types/settings';

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 3;

interface AdoFetchResponse {
  status: number;
  status_text: string;
  body: string;
  body_base64: string | null;
  headers: Record<string, string>;
}

export class AdoClient {
  private readonly org: string;
  private readonly project: string;
  private readonly pat: string;
  private readonly authMethod: AdoAuthMethod;
  private cachedHeader: string | null = null;

  constructor(org: string, project: string, pat: string, authMethod: AdoAuthMethod = 'pat') {
    this.org = org;
    this.project = project;
    this.pat = pat;
    this.authMethod = authMethod;
  }

  private async getAuthHeader(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedHeader) return this.cachedHeader;
    const header = await invoke<string>('ado_resolve_auth_header', {
      authMethod: this.authMethod,
      pat: this.authMethod === 'pat' ? this.pat : null,
    });
    this.cachedHeader = header;
    return header;
  }

  /**
   * Route ADO HTTP requests through the Rust backend. On a 401, refresh
   * the cached Authorization header once and retry the original request.
   * The retry is enforced here rather than in `fetchWithRetry` so it
   * applies to every call path (get, post, patch, delete, getStream).
   */
  private async fetchViaTauri(url: string, init: RequestInit): Promise<Response> {
    let response = await this.fetchViaTauriOnce(url, init, await this.getAuthHeader());
    if (response.status === 401) {
      try {
        const fresh = await this.getAuthHeader(true);
        response = await this.fetchViaTauriOnce(url, init, fresh);
      } catch {
        // Resolver failed on refresh — let the original 401 surface.
      }
    }
    return response;
  }

  private async fetchViaTauriOnce(
    url: string,
    init: RequestInit,
    authHeader: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: authHeader };
    if (init.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        if (k.toLowerCase() !== 'authorization') headers[k] = v;
      }
    }

    const result = await invoke<AdoFetchResponse>('ado_fetch', {
      request: {
        url,
        method: (init.method ?? 'GET').toUpperCase(),
        headers,
        body: init.body ? String(init.body) : null,
      },
    });

    return new Response(result.body, {
      status: result.status,
      statusText: result.status_text,
      headers: new Headers(result.headers),
    });
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await this.fetchViaTauri(url, init);
      if (!TRANSIENT_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
        return response;
      }
      const retryAfter = response.headers.get('Retry-After');
      const rawDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 || 1000 : 1000 * 2 ** attempt;
      const delay = Math.min(rawDelay, 120_000);
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error('Retry loop exhausted');
  }

  get isConfigured(): boolean {
    if (this.org.trim().length === 0 || this.project.trim().length === 0) return false;
    if (this.authMethod === 'azCli') return true;
    return this.pat.trim().length > 0;
  }

  private get baseUrl(): string {
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/${encodeURIComponent(this.project)}/_apis`;
  }

  private buildUrl(relativePath: string, apiVersion = '7.1'): string {
    const separator = relativePath.includes('?') ? '&' : '?';
    return `${this.baseUrl}/${relativePath}${separator}api-version=${apiVersion}`;
  }

  private buildOrgUrl(relativePath: string): string {
    const separator = relativePath.includes('?') ? '&' : '?';
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/_apis/${relativePath}${separator}api-version=7.1`;
  }

  private get commonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  async get<T>(relativePath: string, apiVersion?: string): Promise<T> {
    const url = this.buildUrl(relativePath, apiVersion);
    const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });
    return this.handleResponse<T>(response, url);
  }

  async getOrgLevel<T>(relativePath: string): Promise<T> {
    const url = this.buildOrgUrl(relativePath);
    const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });
    return this.handleResponse<T>(response, url);
  }

  async post<T>(
    relativePath: string,
    body: unknown,
    contentType?: string,
    apiVersion?: string,
  ): Promise<T> {
    const url = this.buildUrl(relativePath, apiVersion);
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { ...this.commonHeaders, 'Content-Type': contentType ?? 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, url);
  }

  async patch<T>(relativePath: string, body: unknown, contentType?: string): Promise<T> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: { ...this.commonHeaders, 'Content-Type': contentType ?? 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, url);
  }

  async delete(relativePath: string): Promise<void> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, {
      method: 'DELETE',
      headers: this.commonHeaders,
    });

    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }

  async getStream(relativePath: string): Promise<Blob> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });

    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return response.blob();
  }

  /**
   * Verify the current credentials by GETting the project metadata.
   * Uses the configured auth method — no extra args required.
   *
   * Returns a human-readable string on HTTP-level failures, `null` on
   * success. Structured errors from `ado_resolve_auth_header` (e.g.
   * `AzNotInstalled`, `AzNotLoggedIn`) are re-thrown so the UI can
   * match on their `kind` field and render mode-specific copy.
   */
  async testConnection(): Promise<string | null> {
    try {
      const url = `https://dev.azure.com/${encodeURIComponent(this.org)}/_apis/projects/${encodeURIComponent(this.project)}?api-version=7.1`;
      const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });

      if (response.status === 401) return 'Authentication failed. Check your credentials.';
      if (response.status === 404) return 'Organization or project not found.';

      if (!response.ok) {
        return `Connection failed: ${response.status} ${response.statusText}`;
      }

      return null;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') return 'Connection timed out.';
        return `Connection failed: ${error.message}`;
      }
      // Non-Error values (structured Tauri errors from the resolver)
      // surface unchanged so the caller can dispatch on `kind`.
      throw error;
    }
  }

  private async handleResponse<T>(response: Response, url: string): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText} for ${url}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
}
```

Keep the `export class AdoAuthError extends Error { ... }` and `export class AdoApiError extends Error { ... }` blocks at the bottom of the file unchanged (currently lines 222–236).

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd src/BorgDock.Tauri && npm run test -- client.test`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/services/ado/client.ts src/BorgDock.Tauri/src/services/ado/__tests__/client.test.ts
git commit -m "refactor(ado-client): async header caching + 401 refresh retry"
```

---

## Task 9: Update every `AdoClient` call site to pass `authMethod`

**Files (one-line edits each):**

For each file below, find every `new AdoClient(...)` call and add the 4th argument `settings.azureDevOps.authMethod` (or the local variable name already in scope). The exact change pattern per call site:

`new AdoClient(org, project, pat)` → `new AdoClient(org, project, pat, authMethod)`

- [ ] **Step 1: Update `src/components/settings/AdoSection.tsx:22-25`**

Before:

```typescript
const client = new AdoClient(
  azureDevOps.organization,
  azureDevOps.project,
  azureDevOps.personalAccessToken ?? '',
);
```

After:

```typescript
const client = new AdoClient(
  azureDevOps.organization,
  azureDevOps.project,
  azureDevOps.personalAccessToken ?? '',
  azureDevOps.authMethod,
);
```

Also update the subsequent `client.testConnection(...)` call at lines 27–31 — `testConnection` now takes zero arguments:

Before:

```typescript
const error = await client.testConnection(
  azureDevOps.organization,
  azureDevOps.project,
  azureDevOps.personalAccessToken ?? '',
);
```

After:

```typescript
const error = await client.testConnection();
```

- [ ] **Step 2: Update `src/hooks/useAdoPolling.ts` — two call sites + dep array**

First call site, at the useEffect around lines 32–48. Replace:

```typescript
    clientRef.current = new AdoClient(
      settings.azureDevOps.organization,
      settings.azureDevOps.project,
      settings.azureDevOps.personalAccessToken!,
    );
```

with:

```typescript
    clientRef.current = new AdoClient(
      settings.azureDevOps.organization,
      settings.azureDevOps.project,
      settings.azureDevOps.personalAccessToken ?? '',
      settings.azureDevOps.authMethod,
    );
```

In the same useEffect's dependency array (currently lines 43–48), add `settings.azureDevOps.authMethod` as the last entry:

```typescript
  }, [
    isConfigured,
    settings.azureDevOps.organization,
    settings.azureDevOps.project,
    settings.azureDevOps.personalAccessToken,
    settings.azureDevOps.authMethod,
  ]);
```

Second call site, at the useEffect around lines 54–58. Replace:

```typescript
    const client = new AdoClient(
      settings.azureDevOps.organization,
      settings.azureDevOps.project,
      settings.azureDevOps.personalAccessToken!,
    );
```

with:

```typescript
    const client = new AdoClient(
      settings.azureDevOps.organization,
      settings.azureDevOps.project,
      settings.azureDevOps.personalAccessToken ?? '',
      settings.azureDevOps.authMethod,
    );
```

(The `!` non-null assertion is dropped — in azCli mode the PAT is intentionally empty.)

- [ ] **Step 3: Update `src/components/command-palette/CommandPalette.tsx:72`**

Replace:

```typescript
    return new AdoClient(ado.organization, ado.project, ado.personalAccessToken ?? '');
```

with:

```typescript
    return new AdoClient(
      ado.organization,
      ado.project,
      ado.personalAccessToken ?? '',
      ado.authMethod,
    );
```

- [ ] **Step 4: Update `src/components/work-items/WorkItemDetailApp.tsx` lines 244 and 271**

Line 244 call site. Replace:

```typescript
      adoSettings.personalAccessToken ?? '',
```

(which is the last positional arg to `new AdoClient(...)`) with:

```typescript
      adoSettings.personalAccessToken ?? '',
      adoSettings.authMethod,
```

Line 271 call site. Replace:

```typescript
        const client = new AdoClient(ado.organization, ado.project, ado.personalAccessToken ?? '');
```

with:

```typescript
        const client = new AdoClient(
          ado.organization,
          ado.project,
          ado.personalAccessToken ?? '',
          ado.authMethod,
        );
```

- [ ] **Step 5: Update `src/hooks/usePaletteSearch.ts` lines 138 and 215**

Both call sites construct an AdoClient with `adoSettings.personalAccessToken ?? ''` as the 3rd positional arg. Add `adoSettings.authMethod` as the 4th. Specifically:

Line 138, replace:

```typescript
      adoSettings.personalAccessToken ?? '',
```

(the last arg of the `new AdoClient(...)` call on/around that line) with:

```typescript
      adoSettings.personalAccessToken ?? '',
      adoSettings.authMethod,
```

Line 215, same edit.

- [ ] **Step 6: Update `src/hooks/useAdoImageAuth.ts:16`**

Open the file. If the line reads `const pat = useSettingsStore.getState().settings.azureDevOps.personalAccessToken;` and the PAT is only used as a bearer/basic header constructor (not via `new AdoClient`), this hook predates the centralized client and should use the resolver. Replace the whole `useAdoImageAuth` body so it invokes `ado_resolve_auth_header` instead of manually formatting the header:

Before (lines 14–20 approximately):

```typescript
export function useAdoImageAuth() {
  return useCallback(async (): Promise<string> => {
    const pat = useSettingsStore.getState().settings.azureDevOps.personalAccessToken;
    if (!pat) return '';
    return `Basic ${btoa(`:${pat}`)}`;
  }, []);
}
```

After:

```typescript
export function useAdoImageAuth() {
  return useCallback(async (): Promise<string> => {
    const ado = useSettingsStore.getState().settings.azureDevOps;
    if (!ado.organization) return '';
    try {
      return await invoke<string>('ado_resolve_auth_header', {
        authMethod: ado.authMethod,
        pat: ado.authMethod === 'pat' ? (ado.personalAccessToken ?? '') : null,
      });
    } catch {
      return '';
    }
  }, []);
}
```

You may need to add `import { invoke } from '@tauri-apps/api/core';` at the top if not already present.

If the hook has a different shape than shown above, adapt: the goal is "fetch an Authorization header via the Rust resolver rather than building one locally from the PAT".

- [ ] **Step 7: Search for any call sites missed**

Run: `grep -rn 'new AdoClient' src/BorgDock.Tauri/src`
Expected: every match has exactly four arguments. Any three-arg call remaining → go back and fix.

- [ ] **Step 8: Update the AdoSection-side default fixture in any tests**

Test fixtures in `src/components/command-palette/__tests__/PaletteApp.test.tsx`, `CommandPalette.test.tsx`, `src/components/work-items/__tests__/WorkItemDetailApp.test.tsx`, and `src/__tests__/App.test.tsx` construct `azureDevOps` settings objects without `authMethod`/`authAutoDetected`. Add these two fields to each fixture — `authMethod: 'pat'` and `authAutoDetected: true` (choosing `pat` keeps the existing behavior tied to the fixtures' PAT values).

Run: `grep -rln "personalAccessToken: 'pat'" src/BorgDock.Tauri/src`
For each match, open the file and add the two fields to the same object literal.

- [ ] **Step 9: Verify full build + tests**

Run these in sequence:
1. `cd src/BorgDock.Tauri && npm run build` — expect success
2. `cd src/BorgDock.Tauri && npm run test` — expect all tests pass

- [ ] **Step 10: Commit**

```bash
git add src/BorgDock.Tauri/src
git commit -m "refactor(ado-auth): thread authMethod through AdoClient call sites"
```

---

## Task 10: Fix `isConfigured` gates for azCli mode

**Files:**
- Modify: `src/BorgDock.Tauri/src/hooks/useAdoPolling.ts:28-29`
- Modify: `src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx:151`

- [ ] **Step 1: Update `useAdoPolling.ts` gate**

At `src/BorgDock.Tauri/src/hooks/useAdoPolling.ts:28-29`, replace:

```typescript
const isConfigured =
  !!settings.azureDevOps.organization && !!settings.azureDevOps.personalAccessToken;
```

with:

```typescript
const isConfigured =
  !!settings.azureDevOps.organization &&
  !!settings.azureDevOps.project &&
  (settings.azureDevOps.authMethod === 'azCli' || !!settings.azureDevOps.personalAccessToken);
```

- [ ] **Step 2: Update `WorkItemsSection.tsx` gate**

At `src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx:151`, replace:

```typescript
if (!adoSettings.organization || !adoSettings.personalAccessToken) {
```

with:

```typescript
const hasCredentials =
  adoSettings.authMethod === 'azCli' || !!adoSettings.personalAccessToken;
if (!adoSettings.organization || !hasCredentials) {
```

- [ ] **Step 3: Search for any other gates that proxy configuration on PAT presence**

Run: `grep -n 'adoSettings\\.personalAccessToken\\|azureDevOps\\.personalAccessToken' src/BorgDock.Tauri/src --include='*.ts' --include='*.tsx' -r`

For each match that's used as a **boolean configured check** (not as an actual value passed to AdoClient), update it to include the azCli branch.

- [ ] **Step 4: Verify build**

Run: `cd src/BorgDock.Tauri && npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/hooks/useAdoPolling.ts src/BorgDock.Tauri/src/components/work-items/WorkItemsSection.tsx
git commit -m "fix(ado-auth): isConfigured accepts azCli mode without a PAT"
```

---

## Task 11: AdoSection radio buttons + conditional PAT field

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/AdoSection.tsx`

- [ ] **Step 1: Import `clsx` and wrap radio + PAT JSX**

At the top of `src/BorgDock.Tauri/src/components/settings/AdoSection.tsx`, replace the existing imports (lines 1–3) with:

```typescript
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AdoClient } from '@/services/ado/client';
import type { AzureDevOpsSettings, AdoAuthMethod } from '@/types';
```

- [ ] **Step 2: Add radio buttons above the PAT field and make the PAT field conditional**

In `src/BorgDock.Tauri/src/components/settings/AdoSection.tsx`, replace the entire `<FieldLabel label="Personal Access Token">` block (currently lines 64–81) with:

```tsx
      <FieldLabel label="Auth Method">
        <div className="flex gap-1">
          {(['azCli', 'pat'] as const).map((method) => (
            <button
              key={method}
              className={clsx(
                'flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                azureDevOps.authMethod === method
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                  : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
              )}
              onClick={() =>
                update({ authMethod: method as AdoAuthMethod, authAutoDetected: true })
              }
            >
              {method === 'azCli' ? 'Azure CLI' : 'Personal Access Token'}
            </button>
          ))}
        </div>
      </FieldLabel>

      {azureDevOps.authMethod === 'pat' && (
        <FieldLabel label="Personal Access Token">
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              className="field-input w-full pr-8"
              value={azureDevOps.personalAccessToken ?? ''}
              onChange={(e) => update({ personalAccessToken: e.target.value })}
              placeholder="ADO PAT"
            />
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              onClick={() => setShowToken((prev) => !prev)}
              type="button"
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </FieldLabel>
      )}
```

Note: when the user explicitly clicks a radio, we set `authAutoDetected: true`. This freezes the first-mount detection (Task 12) from re-firing even if they later toggle back to the default value.

- [ ] **Step 3: Manual UI smoke test**

Run: `cd src/BorgDock.Tauri && npm run tauri dev`

1. Open Settings → Azure DevOps.
2. Verify the radio buttons render; both states visually update on click.
3. Verify the PAT field disappears in azCli mode and reappears in PAT mode.
4. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/AdoSection.tsx
git commit -m "feat(ado-auth): auth-method radio buttons in AdoSection"
```

---

## Task 12: First-mount auto-detect + error status line

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/settings/AdoSection.tsx`

- [ ] **Step 1: Add the detection `useEffect` and status-line state**

Near the top of the `AdoSection` function (right after the existing `useState` calls at lines 11–13), add:

```typescript
  const [detectedStatus, setDetectedStatus] = useState<
    | { kind: 'ok' }
    | { kind: 'az_not_installed' }
    | { kind: 'az_not_logged_in' }
    | { kind: 'token_fetch_failed'; message: string }
    | null
  >(null);

  useEffect(() => {
    if (azureDevOps.authAutoDetected) return;
    let cancelled = false;
    (async () => {
      try {
        const available = await invoke<boolean>('az_cli_available');
        if (cancelled) return;
        update({
          authMethod: available ? 'azCli' : 'pat',
          authAutoDetected: true,
        });
      } catch {
        if (cancelled) return;
        update({ authMethod: 'pat', authAutoDetected: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per mount when autoDetected flips to true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Surface resolver errors inline when azCli mode is selected**

Adjust `handleTestConnection` so that in azCli mode, a failure classifies the error for better copy. Replace the existing `handleTestConnection` function (around lines 18–42) with:

```typescript
  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    setDetectedStatus(null);
    try {
      const client = new AdoClient(
        azureDevOps.organization,
        azureDevOps.project,
        azureDevOps.personalAccessToken ?? '',
        azureDevOps.authMethod,
      );
      const error = await client.testConnection();
      if (error) {
        setTestStatus('error');
        setTestError(error);
      } else {
        setTestStatus('success');
        if (azureDevOps.authMethod === 'azCli') {
          setDetectedStatus({ kind: 'ok' });
        }
      }
    } catch (e) {
      setTestStatus('error');
      // ado_resolve_auth_header rejection arrives here as a structured
      // error object — { kind, message } — when Rust returns AdoAuthError.
      const errObj = e as { kind?: string; message?: string };
      if (errObj?.kind === 'az_not_installed') {
        setDetectedStatus({ kind: 'az_not_installed' });
        setTestError('Azure CLI not found on PATH.');
      } else if (errObj?.kind === 'az_not_logged_in') {
        setDetectedStatus({ kind: 'az_not_logged_in' });
        setTestError('Not logged in to Azure.');
      } else if (errObj?.kind === 'token_fetch_failed') {
        setDetectedStatus({ kind: 'token_fetch_failed', message: errObj.message ?? 'Unknown error' });
        setTestError(`Couldn't fetch Azure token: ${errObj.message ?? 'Unknown error'}`);
      } else {
        setTestError('Connection failed.');
      }
    }
  };
```

- [ ] **Step 3: Render the status line in azCli mode**

Directly below the "Auth Method" `FieldLabel` block (just after the radio buttons — before the `{azureDevOps.authMethod === 'pat' && ...}` conditional block added in Task 11), insert:

```tsx
      {azureDevOps.authMethod === 'azCli' && detectedStatus && (
        <div className="text-[10px]">
          {detectedStatus.kind === 'ok' && (
            <span className="text-[var(--color-status-green)]">
              Using your <code>az login</code> session.
            </span>
          )}
          {detectedStatus.kind === 'az_not_installed' && (
            <span className="text-[var(--color-status-red)]">
              Azure CLI not found on PATH. Install <code>az</code> or switch to Personal Access Token.
            </span>
          )}
          {detectedStatus.kind === 'az_not_logged_in' && (
            <span className="text-[var(--color-status-red)]">
              Not logged in to Azure. Run <code>az login</code> in a terminal, then click Test Connection.
            </span>
          )}
          {detectedStatus.kind === 'token_fetch_failed' && (
            <span className="text-[var(--color-status-red)]">
              Couldn&apos;t fetch Azure token: {detectedStatus.message}
            </span>
          )}
        </div>
      )}
```

- [ ] **Step 4: Manual UI smoke test**

Run: `cd src/BorgDock.Tauri && npm run tauri dev`

1. If you have `az` installed and logged in:
   - Delete `authAutoDetected` from your settings.json (or test on a fresh profile) to force first-mount detection.
   - Open Settings → Azure DevOps. Radio should default to Azure CLI.
   - Click Test Connection. Green status line appears.
2. If you can temporarily rename `az` on PATH (e.g. via `PATH=` in a shell launching the dev build), verify NotInstalled copy.
3. Run `az logout`, then click Test Connection — red NotLoggedIn status line appears.
4. Run `az login` again; re-test. Green status returns.
5. Toggle radio to PAT — status line disappears, PAT field appears.
6. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/settings/AdoSection.tsx
git commit -m "feat(ado-auth): first-mount detection + status line in AdoSection"
```

---

## Task 13: End-to-end manual walkthrough

Run the six scenarios from the spec's §Testing plan on a dev build (`npm run tauri dev`). Mark each checkbox after successful verification.

- [ ] **Scenario 1:** Fresh install with `az` logged in → open ADO Settings → radio defaults to Azure CLI, status green after Test, work items load successfully.

- [ ] **Scenario 2:** Fresh install with `az` not installed → radio defaults to PAT, existing PAT flow unchanged, Test Connection passes with a valid PAT.

- [ ] **Scenario 3:** Fresh install with `az` installed but not logged in → radio defaults to Azure CLI. Click Test — red NotLoggedIn message appears. Run `az login` in a terminal, click Test again — green.

- [ ] **Scenario 4:** Upgrade from PAT-only build. Set up a fresh profile dir that contains a `settings.json` with org/project set and a PAT stored in the OS keychain under `borgdock:azure_devops`. Launch BorgDock — Settings → ADO shows the PAT radio selected, the PAT already populated, no behavior change.

- [ ] **Scenario 5:** Mid-session token revocation. Start in azCli mode, connect, then run `az account clear`. Trigger any ADO poll (wait ~2 min or change focus). Expect: one silent refresh attempt, then status line red with NotLoggedIn. Existing work items stay visible but no new data loads until re-login.

- [ ] **Scenario 6:** Method toggle. With `az` logged in AND a PAT stored, flip the radio azCli → pat → azCli. Click Test Connection after each flip. Both paths connect. `authAutoDetected` stays true throughout (verify via `settings.json`).

- [ ] **Commit the plan-completion marker**

```bash
git commit --allow-empty -m "test(ado-auth): e2e manual walkthrough complete"
```

---

## Post-implementation checklist

- [ ] `cd src/BorgDock.Tauri && npm run build` succeeds on master.
- [ ] `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib` passes (9 new tests + all pre-existing).
- [ ] `cd src/BorgDock.Tauri && npm run test` passes.
- [ ] CHANGELOG.md gains an entry describing the new Azure CLI auth option under "Improvements" for the next release.
- [ ] Spec at `docs/superpowers/specs/2026-04-16-ado-az-cli-auth-design.md` stays as the design-of-record; no edits needed post-implementation.

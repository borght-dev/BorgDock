# Dispatch API

The types are the contract: `shared/src/api.ts`. This page covers what the types can't say: sign-in, headers, errors,
and push. Base URL in production: `https://your-mac.your-tailnet.ts.net:10000`. It's public through Tailscale Funnel,
and the tailnet reaches the same URL.

## Conventions
- JSON in and out. Errors are `{ "error": "<sentence for the user>" }` with a 4xx/5xx status.
- `401` means the session is gone (revoked or expired). Sign in again.
- `409` means the world moved on, e.g. the agent's question changed or the worktree got taken. Reload the overview.
- `502` means T3 Code or Azure DevOps failed. The message says which one.
- Browser writes need the session cookie, `X-Dispatch-Intent: 1`, and a same-origin `Origin`. Bearer clients (the app) need `Authorization: Bearer <token>`. Send `X-Dispatch-Intent: 1` on every request anyway: unauthenticated POSTs such as `/api/auth/app/token` require it.
- A request with any `Authorization` header is judged on that header alone; the cookie is ignored.
- Bodies are limited to 64 KB (413).
- Account changes need a passkey check from the last 5 minutes: adding or removing a passkey, and issuing a phone app sign-in code. Without one, the server answers `403 {"error", "reverify": true}`. Then call `POST /api/auth/reverify/options` and `/verify` (the same shape as login) and retry. App sessions can't make account changes.

## Sign-in
Passkeys only, with user verification required. There is one user.

**First device or recovery.** Run `npm run cli -- setup-code` on the Mac, open `/setup`, and enter the code. The code works once and expires after 30 minutes.

**Browser.** These calls go through `POST /api/auth/login/options`, which returns `{options, challengeId}`. The browser then calls `navigator.credentials.get`. Finally `POST /api/auth/login/verify {challengeId, response, deviceName}` sets the `__Host-dispatch` cookie (HttpOnly, Secure, SameSite=Strict, 30 days sliding).

**iPhone app** (OAuth-style code flow with PKCE S256):
1. Make a random `verifier` (43–128 chars) and set `challenge = base64url(sha256(verifier))`, without padding. Make a random `state`.
2. Open `ASWebAuthenticationSession` on `{base}/auth/app?state=<state>&code_challenge=<challenge>` with callback scheme `dispatch`.
3. The page signs in with the passkey (or confirms it, if already signed in) after the user taps "Sign in the Dispatch app". It then redirects to `dispatch://auth?code=<code>&state=<state>`. Check that `state` matches.
4. Send `POST /api/auth/app/token {code, codeVerifier, deviceName}` to get `{token, sessionId}`. The code is single-use and lasts 2 minutes.
5. Keep the token in the Keychain and send `Authorization: Bearer <token>`. It expires after 180 days unused.

`GET /api/auth/status` → `AuthStatus`. `POST /api/auth/logout` revokes the calling session.

## Endpoints (all need a session)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/config | | `AppConfig` |
| GET | /api/overview | | `Overview` (503 while the first sync runs). Cached: ADO is read every minute, T3 every 4 seconds |
| POST | /api/refresh | `{}` | `Overview`, read fresh from ADO and T3 right now. Use it for pull to refresh |
| GET | /api/events | | SSE, `event: overview` when it changes (web only) |
| GET | /api/items/:id | | `ItemDetail` |
| GET | /api/items/:id/start | | `StartOptions`: the pick-up and QA prompts, the item's branch, and the worktree for a QA handoff |
| GET | /api/browse/queries | | `BrowseQuery[]` |
| GET | /api/browse?query=<id>&search=<text> | | `BrowseResult` |
| POST | /api/threads | `StartThreadRequest` | `StartThreadResponse` |
| POST | /api/threads/:id/answers | `AnswerRequest` | `{ok}` |
| POST | /api/threads/:id/settle | `{}` | `{ok}` |
| POST | /api/threads/:id/link | `LinkThreadRequest` | `{ok}` |
| POST | /api/items/:id/state | `MoveStateRequest` | `MoveStateResponse` |
| POST | /api/items/:id/dismiss | `{}` | `{ok}` (hides the current suggestion) |
| POST / DELETE | /api/queue/:id | `{}` | `{ok}` |
| POST | /api/push/apns | `ApnsRegistration` | `{ok, enabled}` |
| POST | /api/push/web | `WebPushRegistration` | `{ok}` |
| POST | /api/push/test | `{}` | `{ok}` |
| GET / PUT | /api/preferences/notifications | `NotificationPreferences` | `NotificationPreferences` |
| GET | /api/auth/sessions | | `SessionInfo[]` |
| DELETE | /api/auth/sessions/:id | | `{ok}` |
| GET | /api/auth/passkeys | | `PasskeyInfo[]` |
| GET | /api/audit | | the last 100 security and action events |

The start prompt comes from `AppConfig.promptTemplate`, with `{id}`, `{title}` and `{branch}` filled in. Branch:
`feat/` for PBIs, `chore/` for Tasks, `fix/` otherwise, then `<id>-<first 4 meaningful title words>`.
To answer, send each `options[i].value` (not `label`) keyed by question `id`; free text is allowed when `allowCustomAnswer`.

## Push (APNs)
Payload: `aps.alert {title, body}`, `aps.category`, `aps["thread-id"]` = `item-<id>`. Dispatch's own data sits under the
`dispatch` key and follows the `PushData` shape.

| Category | Actions |
|---|---|
| `DISPATCH_QUESTION` | `answer.recommended` "Use recommended answer" (only meaningful when `recommended` isn't null); `answer.text` text input "Answer…" (when `allowCustomAnswer`). Both require unlock (`.authenticationRequired`), because the agent has full access. Both POST `/api/threads/:threadId/answers` with `{requestId, answers: {[questionId]: value}}`. |
| `DISPATCH_QUESTION_RECOMMENDED` | Only `answer.recommended`: the question has a recommended option but no free text. |
| `DISPATCH_QUESTION_TEXT` | Only `answer.text`: free text allowed, no recommended option. |
| `DISPATCH_SUGGESTION` | `move` "Move in ADO" (requires unlock). POST `/api/items/:itemId/state {to}`. |
| `DISPATCH_DEFAULT` | none; tapping opens the item. |

APNs is off until `~/.dispatch/apns.json` exists: `{keyId, teamId, bundleId, keyFile, production}`.

# BorgDock

The types are in `shared/src/borgdock.ts`. Production base URL: `https://your-mac.your-tailnet.ts.net/borgdock`
(a Funnel path route; the server sees `/api/...`). The server is its own service (`~/.borgdock-server`, port 8797),
beside Dispatch.

## Sign-in with Clerk
1. `GET /api/server` (no session) → `ServerInfo`: whether someone owns the server, and Clerk's publishable key.
2. Sign in with Clerk in the app, then `POST /api/auth/clerk {clerkToken, deviceName, devicePublicKey, claim?}`.
   The server checks the session token against `<frontendApi>/.well-known/jwks.json` (RS256, `iss` = the frontend
   API, `exp` and `nbf` required, 5 s leeway) and reads the profile from Clerk's Backend API with the secret key.
   The device's Secure Enclave key is bound to the new session (180 days unused) and never changes.
3. An unclaimed server answers `403 {claimRequired: true}`. Claim it with the code from `npm run cli -- pair` on the
   server's own machine (run with `DISPATCH_DATA_DIR=~/.borgdock-server`): `claim = {code, proof}`. Codes from
   other machines' connectors can't claim. The first Clerk account to claim is the owner; any other gets 403.
   Or name the owner in `config.json`: `"owners": { "emails": [...], "githubLogins": [...] }` (case-insensitive).
   An unclaimed server then lets the first Clerk user with a **verified** matching email address, or a verified
   GitHub account with a matching login, claim it on sign-in without a code; everyone else still gets
   `403 {claimRequired: true}`. The allowlist only claims: once owned, only the owner signs in.
4. `GET /api/account` → `Account`; sign a device out with `DELETE /api/auth/sessions/:id`.

Browser sessions (passkeys) bind a WebCrypto key with `POST /api/devices/key {devicePublicKey}` within five minutes
of a passkey check; 409 when the session has a key already.

## Signed commands
Headers and canonical string: `shared/src/borgdock.ts`, "Signed commands". The signature is DER (Secure Enclave);
a 64-byte r‖s (WebCrypto) is accepted too. 403 `{signatureRequired: true}` when it's missing, wrong, older than two
minutes, or its nonce was used. Signed: `POST /api/threads`, `/api/threads/:id/answers`, `/settle`, `/messages`,
`/approve-plan`, `/api/agents/launch`, `/api/machines/pair`, `/api/desktop/links/approve`, and the GitHub merge and
review routes.

## Linking the desktop app
The BorgDock desktop app links to the server so it shares read state and reports when you're at your desk. Types:
`DesktopLinkRequest`, `DesktopLinkStart`, `DesktopLinkStatus`, `ApproveDesktopRequest`, `DesktopLinkApproval`.

| Method | Path | Session | Body | Returns |
|---|---|---|---|---|
| POST | /api/desktop/links | none | `{deviceName}` | `DesktopLinkStart`: `code` (`ABCD-EFGH`, Crockford), `pollSecret`, `link` = `borgdock://link-desktop?server=<url>&code=<code>`. 10 a minute per client; 429 when three links of the client (or twenty in all) are waiting |
| POST | /api/desktop/links/approve | phone, **signed** | `{code}` | `{deviceName, sessionId}`. Case and dashes don't matter. 409 when the code expired (10 minutes) or was used |
| GET | /api/desktop/links/:linkId?secret= | none | | `{status: 'pending'}`, `{status: 'expired'}`, or once `{status: 'approved', token, sessionId, serverName}`; then the link is gone (404, as for a wrong secret) |

- Links live in memory: a server restart drops the ones in progress. After an approval the desktop has at least two
  minutes to pick up its token; a token nobody picks up revokes its session.
- The desktop's session is an app session named after `deviceName`, 180 days unused. It may only call `GET /api/server`,
  `GET /api/activity` (its reads never count as a visit for the away summary), `POST /api/activity/read`,
  `POST /api/activity/read-targets`, `GET /api/activity/reads`, `POST /api/presence` and `POST /api/auth/logout`.
  Anything else answers `403 {error}`.
- `GET /api/sources` lists linked desktops (`desktops: LinkedDesktop[]`, `atDesk` from its own presence reports), and
  `GET /api/account` marks each device `kind: 'desktop'` or `'phone'` (browsers leave it out). Signing the session out
  (`DELETE /api/auth/sessions/:id`, or the desktop's own logout) unlinks the desktop.

## Machines and connectors
- `npx borgdock connect --server <url> [--label <name>] [--pair]` on any machine with T3 Code. It dials
  `wss://<server>/api/connector`, so the machine needs no open port. The first run shows a QR:
  `borgdock://pair?server=<url>&code=<code>&secret=<base64url 32 bytes>`. `--pair` shows a new one for another device.
- The phone sends `POST /api/machines/pair {code, proof, devicePublicKey}` (signed; `devicePublicKey` is the
  session's own key), `proof = base64(HMAC-SHA256(secret, devicePublicKey bytes))`. The server passes the proof to
  the connector, which checks it against the secret only it holds. 409: the code expired (10 minutes) or was used;
  403: wrong proof (five tries per code).
- For a camera that can't read the QR, the machine also prints a typed code `ABCD-EFGH-JKMN-PQRS`: the server's code
  `ABCD-EFGH` plus an 8-character secret (Crockford alphabet) that never reaches the server. The phone sends the
  server's code and `proof = base64(HMAC-SHA256(UTF-8 of the secret, devicePublicKey bytes))`.
- After pairing, the connector trusts that device key. The server relays T3 reads (shell, a thread's projection,
  `server.getConfig`, `vcs.listRefs`); a command goes over only as the phone's signed request, which the connector
  checks against its trusted keys and its own nonce list, then reads the command out of itself. A command for a
  machine is refused when its ids name another machine.
- The server's own machine trusts every device of the owner. A connector machine only the devices that paired it:
  the server answers 403 "Pair this device with … first" for the others.
- `GET /api/sources`, `GET /api/machines`, `DELETE /api/machines/:id` (forgets its token and trust).

Socket frames (`server/src/borgdock/connector-protocol.ts`): the connector says `hello {token?, pair?, machine}`;
the server answers `welcome`, `pairing {code, expiresAt, serverUrl}`, `registered {machineId, token}` (after the
first pairing), `paired`, `error`, or `request {id, request}` with `get`, `rpc`, `command {envelope}` or
`verify {devicePublicKey, proof}`; the connector answers `reply {id, ok, value | error, status}`.

## Agents
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/agents/targets | | `LaunchTargets`. Every T3 project counts; one per repository per machine (the shortest checkout wins) |
| GET | /api/agents/branches?machine=&project= | | `Branches` (local names first; the default by its local name) |
| POST | /api/agents/launch | `LaunchRequest` (signed) | `StartThreadResponse`. Fresh worktree from `baseBranch` (none: the default branch), beside a thread (its checkout, or the project root), or continue it (409 while it runs). Plan first appends the instruction; the thread runs in default mode |
| GET | /api/threads/:id | | `ThreadDetail` |
| POST | /api/threads/:id/messages | `SendMessageRequest` (signed) | `{ok}` |
| POST | /api/threads/:id/approve-plan | `{}` (signed) | `{ok}`. Leaves T3's plan mode first when the thread is in it, then sends "Go ahead with the plan." |

`Overview.walk` and `ItemOverview.walk` follow the desktop's states walk (`server/src/borgdock/verdict.ts`, `walk.ts`).

## Activity, push, Live Activities
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | /api/activity?category=&before=&limit= | | `ActivityPage`. The first page counts as a visit; after an hour away it opens the away summary |
| POST | /api/activity/read | `MarkReadRequest` | `{unread}`; other devices get a silent `read` push |
| POST | /api/activity/read-targets | `ReadTargetsRequest` | `{unread}`. Every unread line about those targets from at or before `before` becomes read, and every device gets the silent `read` push for them. Targets match by kind and id (`pr` keys case-insensitive); 400 without a valid `before` |
| GET | /api/activity/reads?since= | | `ReadsSince`: the targets of lines read at or after `since` (any device, either route), and `until` for the next call. A line read in the same millisecond as `until` can come twice, never not at all. Without `since`: the last day |
| GET | /api/activity/digest?since= | | `Digest` |
| GET | /api/search?q= | | `SearchResults` |
| GET | /api/widgets | | `WidgetSnapshot` |
| POST | /api/refs/resolve | `ResolveRefsRequest` | `ResolvedRefs` |
| POST / DELETE | /api/live-activities, /api/live-activities/:token | `LiveActivityRegistration` | `{ok}` |
| POST | /api/live-activities/start-token | `PushToStartRegistration` | `{ok}` (one per device) |
| POST | /api/presence | `Presence` | `{ok}`. A linked desktop reports under its own session |
| GET / PUT | /api/preferences | `BorgDockPreferences` | `BorgDockPreferences` |

- The journal reads Dispatch's overview (only once ADO and every T3 host have been read) and GitHub's `focus` and
  `ci` events. A source's first observation seeds; each fact adds one line, once.
- Pushes: `immediate` categories push each line, `summary` ones gather into one push every 30 minutes, `off` never.
  More than four new lines at once is a burst: one summary. With `quietAtDesk`, nothing alerts while the desktop
  reported use in the last five minutes. Categories: `BORGDOCK_QUESTION`/`_RECOMMENDED`/`_TEXT` (an answerable
  agent question, `dispatch` = `PushData` kind `question`), `BORGDOCK_SUGGESTION` (kind `suggestion`), `BORGDOCK_PR`
  (review lines), `BORGDOCK_CI`, `BORGDOCK_DEFAULT`; other lines carry `ActivityPush`. Silent `refresh` pushes come at
  most every five minutes.
- Live Activities: topic `dev.borght.borgdock.push-type.liveactivity`. Agent activities get `update` when the run
  moves on and `end` (dismissed after 15 minutes) when it's done or failed. Push-to-start for a thread launched from
  the device, once it runs: `attributes-type: "AgentActivityAttributes"`, `attributes {threadId, title, place, itemId}`,
  `content-state` = `AgentActivityState`. Checks activities end once nothing is pending.
- APNs is off until `~/.borgdock-server/apns.json` exists (`{keyId, teamId, bundleId: "dev.borght.borgdock", keyFile, production}`).

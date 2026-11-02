# T3 Code protocol v2

Verified against the installed Nightly bundle on 2026-10-05. Dispatch connects to the desktop server on `127.0.0.1:3773` through `server/src/t3/client.ts`.

## Auth

Every request needs a bearer credential, including loopback. Dispatch keeps its existing 30-day session in `~/.dispatch/t3-session.json`, renews before expiry, and retries after HTTP 401. Tokens stay out of logs.

The bundled CLI issues sessions. The executable name follows the app bundle name:

```sh
T3="/Applications/T3 Code (Nightly).app/Contents"
ELECTRON_RUN_AS_NODE=1 "$T3/MacOS/T3 Code (Nightly)" "$T3/Resources/app.asar/apps/server/dist/bin.mjs" \
  auth session issue --label dispatch --ttl 30d --json
```

`loadConfig` discovers Nightly, Alpha or the regular app. `~/.dispatch/config.json` can override `t3.app`.

## Transport

Orchestration HTTP requests require `x-t3-orchestration-protocol: 2`. Omitting it returns HTTP 400 with an empty body.

- `GET /api/orchestration/shell` returns `schemaVersion`, `snapshotSequence`, projects and thread shells.
- `GET /api/orchestration/threads/:id/bounded` returns a bounded `projection` with messages, runtime requests and turn items. Full projections use the route without `/bounded`.
- `POST /api/auth/websocket-ticket` returns a short-lived ticket. Connect to `/ws?orchestrationProtocol=2&wsTicket=<ticket>`.
- WebSocket uses Effect RPC, one JSON message per frame:
  - Request: `{"_tag":"Request","id":"7","tag":"orchestration.dispatchCommand","payload":{…},"headers":[]}`.
  - Response: `{"_tag":"Exit","requestId":"7","exit":{"_tag":"Success","value":{…}}}`.
  - Answer `Ping` with `Pong`.

Dispatch reads first user messages from `statev2.sqlite`, table `orchestration_v2_projection_messages`, to retain item links when bounded history omits the first turn. Older installations use `state.sqlite`.

## Thread state and actions

Shells expose `status`, `activityRunStatus`, latest run timestamps, `pendingRuntimeRequest`, and `pendingBackgroundTasks`. Pending input and approval take precedence; queued/preparing/starting/running work and background work count as running. Question text lives in `user_input_request` turn items; unresolved requests have `status: pending`. Option values can differ from display labels.

- Start through `orchestration.launchThread` with a caller-generated `threadId`, project, title, model, runtime/interaction modes, `workspaceStrategy: {type: "root"}` and `initialMessage`. M/V/W projects are already separate project checkouts.
- Answer through `orchestration.dispatchCommand` with `type: "runtime-request.respond"`, `threadId`, `requestId`, and `answers`.
- Settle through the same dispatch RPC with `type: "thread.settle"`.

The client translates Dispatch's existing start/answer commands at the transport boundary. Live verification uses read-only HTTP and WebSocket calls; tests cover launches and answers without starting agents or answering real questions.

## Incident, 2026-10-05

Switching to Nightly left Dispatch polling without the v2 header and pointing session renewal at a removed Alpha executable. The iPhone showed "T3 Code isn't reachable" and the time of the last successful sync. The fix updates bundle discovery, protocol negotiation, shell/detail mapping, command transport and message-database discovery. No iPhone rebuild is required.

## Deep links

- Web: `http://<host>:3773/<environmentId>/<threadId>`.
- iPhone: `t3code://threads/<environmentId>/<threadId>`.
- Desktop: opens the owning host’s exact web thread URL.

## Multiple hosts, 2026-10-06

`T3Fleet` polls configured hosts independently. Every host supplies its environment identity and provider catalogue through `server.getConfig`. Launches preserve exact provider instance IDs, custom model names and option descriptors. Remote first user messages come from the full thread projection when bounded history omits them.

Remote project/thread IDs are prefixed with `<environmentId>:` inside Dispatch; transport calls strip that prefix. Primary Mac IDs remain unchanged for existing links and notification history. First-message caches are namespaced remotely. SQLite stores successful snapshots per host and restores them offline on startup. A failed host keeps its activity visible but disables its actions; reconnection restores availability even when the snapshot sequence did not change.

The M/V/W project filter applies to both the rack and activity matching. An unrelated conversation mentioning an item cannot replace activity from its worktree.

# BorgDock server (grown from Dispatch)

The server behind BorgDock for iPhone (`src/BorgDock.iOS`), and Dispatch's web app. The phone shows what needs you
(pull requests to review, agents waiting for an answer, red CI, what changed while you were away) without the desktop
app, and steers T3 agents on your machines. The design is `design/ios-app/mockups.html` at the repository root; how
the code is split is in `docs/borgdock-plan.md`; the API is `shared/src/borgdock.ts` and `docs/api.md`.

This folder is its own npm workspace (Node 24): run `npm` here, not `bun` at the repository root.

- `server/`: Dispatch's server plus GitHub (through `gh`), Clerk sign-in, device-signed commands, machines and
  connectors, the states walk, the activity journal, APNs pushes and Live Activities.
- `connector/`: `npx borgdock connect --server <url>` on any machine with T3 Code; it dials out, so the machine needs
  no open port, and it runs only commands signed by a phone it paired with.
- `../BorgDock.iOS/`: the SwiftUI app with widgets, Live Activities and a notification content extension.

## Run the BorgDock server on the Mac mini
```sh
deploy/borgdock-install.sh     # launchd service dev.borght.borgdock-server, data in ~/.borgdock-server, port 8797,
                               # public at https://your-mac.your-tailnet.ts.net/borgdock (Funnel path route)
deploy/borgdock-uninstall.sh
```
`~/.borgdock-server` holds `config.json`, `clerk.json` ({publishableKey, secretKey, frontendApi}) and `apns.json`.
It runs beside Dispatch and never touches `~/.dispatch`.

**Claim it:** sign in on the iPhone, then run `DISPATCH_DATA_DIR=~/.borgdock-server npm run cli -- pair` on the Mac
mini and scan the code (or type it). Only a code from the server's own machine can claim it. Other machines:
`npx borgdock connect --server https://your-mac.your-tailnet.ts.net/borgdock`.

---

# Dispatch

One overview of your Azure DevOps work and your T3 Code agents, from your phone or any computer.

Dispatch matches each ADO item assigned to you with its T3 threads, then sorts everything by what it needs:

| Group | Meaning |
|---|---|
| Waiting on you | An agent asked something, proposed a plan, finished, or failed. |
| Out of sync | ADO and the agent disagree, e.g. a PR merged while ADO still says Code Review. |
| Agents working | Running now. |
| Up next | Items you queued. |
| Not started | Assigned to you, no agent yet. |
| Paused | An agent worked on it, nothing is running now. |
| Handed off | Code Review, QA or later. |

You can start an agent on an item in a free Mac, Vera or Windows worktree (M/V/W), answer agent questions, and confirm ADO state moves.
Nothing changes in ADO unless you press the button.

**Production:** https://your-mac.your-tailnet.ts.net:10000. The iPhone app and browsers on Mac and Windows use the same address.

## Layout
- `server/`: Node 24 + Hono, TypeScript run directly (no build step). Reads ADO through the `az` CLI and T3 through each host’s API. State lives in `~/.dispatch/dispatch.db`.
- `web/`: React + Vite. An installable web app for desktop and phone.
- `e2e/`: the browser end-to-end test, and `ui-fixture.mjs`, the sample-data server for web and iPhone screenshots.
- `shared/src/api.ts`: the API contract. `docs/api.md` covers sign-in, errors and push.
- `docs/security.md`: who gets in and what leaves the Mac. `docs/t3-protocol.md`: how Dispatch talks to T3.

## Run it on the Mac mini
Run the services from a checkout that follows `main` (not a development worktree): the launchd jobs point at it.
`~/.dispatch/config.json` needs `ado` (`orgUrl`, `project`, `team`) and, for a public address, `publicOrigin`.
```sh
deploy/install.sh        # install, typecheck, test, build, launchd service, public Funnel route
deploy/uninstall.sh      # stop it and close the public route (keeps your passkeys and settings)
```
- Logs: `~/.dispatch/logs/dispatch.log`.
- Restart: `launchctl kickstart -k gui/$(id -u)/dev.borght.dispatch`.

### First sign-in
1. On the Mac, run `npm run cli -- setup-code`. It prints a one-time code that works for 30 minutes.
2. On your iPhone, open the address above, go to `/setup`, enter the code, and create the passkey with Face ID.
3. iCloud Keychain syncs that passkey to your Mac. On Windows, choose "Use a phone" in the passkey prompt, or add a Windows Hello passkey under Settings once you're signed in.

Lost every device? Run `npm run cli -- setup-code` on the Mac again.

### Admin commands
`npm run cli -- setup-code | sessions | revoke <id> | passkeys`

## Develop
```sh
npm install
DISPATCH_DATA_DIR=/tmp/dispatch-dev PORT=8796 DISPATCH_ORIGIN=http://localhost:5173 npm run dev:server
npm run dev:web          # Vite on :5173, proxies /api to :8796
npm test                 # server unit and HTTP tests
e2e/run.sh               # browser end-to-end test with a virtual passkey on a throwaway server
```
The dev server talks to the real T3 and ADO, so the e2e test intercepts every write.

## Notifications
- Browsers: Settings → Turn on notifications (Web Push; on iPhone, only after adding Dispatch to the Home Screen).
- iPhone app: needs an APNs key. Create a key with Apple Push Notifications enabled in the Apple Developer portal, save the `.p8` as `~/.dispatch/AuthKey.p8`, and write `~/.dispatch/apns.json`:
  `{"keyId": "...", "teamId": "...", "bundleId": "dev.borght.dispatch", "keyFile": "/Users/<you>/.dispatch/AuthKey.p8", "production": false}`
  Then restart the service.

## T3 hosts

The project filter is `^[MVW]\\d+$`. All matching projects and their threads appear across configured hosts. Mac remains `t3`; remote hosts go in `t3Environments` in `~/.dispatch/config.json`.

Add each remote host to `t3Environments`, then restart Dispatch. Keep session credentials in owner-only files next to the config.

Each remote entry has `label`, `environmentId`, `baseUrl`, `webBase`, `pollSeconds`, `sessionFile`, and `sessionCommand` (an executable/argument array returning T3 session JSON). `app` and `stateDb` may be empty remotely. The environment ID must match the server’s identity.

The selected workspace determines the launch host and its live provider/model catalogue. Answers, settle actions and links use that same host. Offline hosts retain their last snapshot across restarts; their workspaces cannot launch agents until reconnected. Host IDs distinguish duplicate project names. Existing Mac thread IDs remain valid.

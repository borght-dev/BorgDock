# BorgDock for iPhone: build plan

Dispatch grows into BorgDock's backend and iPhone app. The screens follow `design/ios-app/mockups.html` (open it
in a browser; sections 1–9 match the slices below). The desktop app this mirrors lives in
`src/BorgDock.Tauri` in this repository; port its rules from there instead of reinventing them.

## Architecture

- **Server** (`server/`, Node 24 + Hono, TypeScript run directly): Dispatch's server, plus GitHub, activity,
  Clerk sign-in, device-signed commands, machines/connectors, Live Activity pushes. One owner per server.
  Runs on the Mac mini as its own service (`~/.borgdock-server`, port 8797), public at
  `https://your-mac.your-tailnet.ts.net/borgdock` (Tailscale Funnel path route; the prefix is stripped,
  so the server sees `/api/...`).
- **Contract**: `shared/src/borgdock.ts` (+ `api.ts`). Routes are documented next to each type. Additive changes
  only; say so in your report.
- **iPhone app** (`src/BorgDock.iOS/`, SwiftUI, iOS 26, XcodeGen): targets `BorgDock`, `BorgDockWidgets` (widgets + Live
  Activities), `BorgDockNotificationContent`. `src/BorgDock.iOS/Shared` compiles into all three (design tokens `BD`,
  components, shared models). App Group `group.dev.borght.borgdock`.
- **Design**: BorgDock tokens and components in `src/BorgDock.iOS/Shared/Design` (`BD.*`, `Tone`, `ToneChip`, `CheckBar`,
  `PersonAvatar`, `WorkItemGlyph`, `GitHubLabel`, `BucketPill`, `GroupHeader`, `.bdCard()`, `BDButtonStyle`,
  `GlassIconButton`, `DiffStat`, `PulseDot`, `BDMark`, `BDAppTile`). Use native iOS 26 Liquid Glass (`.glassEffect`,
  `.buttonStyle(.glass)`, toolbars) rather than imitating it. Every screen works in light and dark.
- **Navigation**: `Router` (`src/BorgDock.iOS/BorgDock/App/Router.swift`): tabs, one `Route` enum for all stacks, `SheetRoute`,
  `CoverRoute`, `borgdock://` links. `RootView.swift` maps routes to views. Each feature has a store on `AppModel`
  (`app.focus`, `app.activity`, `app.account`, `app.notes`, `app.search`); add your state there.
- **Signed requests**: `APIClient.post(…, signed: true)` adds the device signature through `app.signer`
  (`RequestSigner`). The Dispatch slice implements the signer; until then signed calls fail with a clear error.

## Slices

All slices work at the same time in one checkout, `~/projects/borgdock-mobile`, on branch `borgdock`. Each owns the
files listed. Don't edit files you don't own; if you must, keep it to a few lines and list them in your report. Shared touch points: `shared/src/borgdock.ts`
(append only), `src/BorgDock.iOS/project.yml` (extensions slice only), `AppModel.swift` (add a line or two, nothing more).

### S1 · Server: GitHub
Owns `server/src/github/**`, `server/src/api/routes/github.ts`, `server/test/github*.test.ts`.
- `GithubService` reads through `gh` (`gh auth token --user <login>`; accounts from config, else every account
  `gh auth status` lists). Poll every `github.pollSeconds`: open PRs that involve you (GraphQL search
  `is:open is:pr involves:@me` per account) plus `github.repos`.
- Focus buckets and reasons: port `services/focus-bucket.ts`, `pr-grouping.ts`, `priority-scoring.ts`.
  `agentsWaiting` from `DispatchService.overview` (bay `waiting`). Snoozes in a table.
- Detail, files (`changedSinceReview` via compare from your last review's commit), conversation (review threads
  + comments), proof images from the body, check runs with failure reasons: read failed jobs' log tails (follow
  the redirect, `Range: bytes=-65536`), sanitise, extract step / summary / snippet / file:line (see the desktop's
  `services/ci-failures/` and `src-tauri/src/ci_failures/`).
- Related CI failure groups across open PRs and base branches (fingerprint the normalised signal), suspect commit
  on the base branch, claims. `masterHealth()` for widgets. `search()`.
- Actions: comment/reply, resolve thread, submit review (signed), merge (signed; auto-merge when checks are
  pending; `headSha` guard → 409), rerun failed jobs, snooze. Emit `focus` and `ci` events.
- Tests use recorded responses; never call GitHub from tests.

### S2 · Server: platform
Owns `server/src/borgdock/**`, `server/src/api/routes/platform.ts`, `server/src/auth/signatures.ts`,
`server/src/t3/**`, `server/src/push/**`, `service.ts` additions, `connector/` (new workspace), `deploy/borgdock*`,
`docs/api.md`, `server/test/` files for these.
- Clerk exchange (`POST /api/auth/clerk`): verify the session JWT with the instance JWKS
  (`<frontendApi>/.well-known/jwks.json`), check `iss`, `exp`, `nbf`; profile from Clerk's Backend API with the
  secret key. Owner binding on first claim (pairing proof). Device keys per session. `GET /api/server`, `/api/account`.
- Signatures: replace the stub in `auth/signatures.ts` (ECDSA P-256 over the canonical string in the contract,
  2-minute window, nonce replay table). Every signed route in the contract must reject unsigned requests.
- Machines: pairing codes, `npm run cli -- pair` (QR in the terminal for this machine), the connector
  (`connector/`, `npx borgdock connect --server <url>`) dialling out over WebSocket and relaying T3 for its
  machine, trusting device keys from pairing and checking command signatures itself. `GET /api/sources`.
- T3: every project counts (no M/V/W slots); launch in a fresh worktree from a branch or continue/beside a
  thread (port the desktop's `services/dispatch/launch.ts` and `src-tauri/src/t3/`); thread detail, send message,
  approve plan (`GO_AHEAD_MESSAGE`), targets and branches.
- States walk: port `services/dispatch/verdict.ts` and `walk.ts`; fill `ItemOverview.walk` and `Overview.walk`.
- Activity journal from Dispatch overview changes and GitHub `focus`/`ci` events: seed first, no bursts, read
  state, away summary, digest. Push per category preferences (BORGDOCK_* categories), quiet-at-desk via presence,
  silent `refresh` and `read` pushes, Live Activity updates and push-to-start (topic
  `<bundleId>.push-type.liveactivity`). Search, widgets snapshot, refs resolve, preferences.
- Deploy files only (launchd plist for `dev.borght.borgdock-server`, install script, Funnel path route). Don't
  install or touch the running Dispatch service; the integrator deploys.
- The passkey web flow and the web app keep working.

### I1 · iPhone: Focus, pull requests, Quick Review, CI
Owns `src/BorgDock.iOS/BorgDock/Features/{Focus,PullRequest,Review,CI}/**`, `src/BorgDock.iOS/BorgDock/Model/GitHub.swift`,
`e2e/fixtures/10-github.mjs`, its tests. Mockup sections 1, 2, 3 and 7 (CI failure).
- Focus: bucket pills, PR cards (check bar, reason, chips, diff stat), agents-waiting strip, pull to refresh,
  swipe actions (snooze, merge, review), context menu (Review, Fix with Claude, Rerun failed, Open in T3, Snooze,
  Open AB#, Copy branch, Open on GitHub), avatar → Settings sheet, bell → Activity.
- Pull requests tab (`Features/PullRequests`): every open pull request the server reads, the desktop list's filters
  (All, Needs you, Mine, Failing), search, grouped by author or repository with Needs you pinned, the Focus swipes
  and menu.
- Pull request: header, labels, chips, tabs (Overview, Files, Checks, Proof, Comments), reviews, work item card,
  bottom bar (Fix → launch sheet with `prKey`, Start review). Checks sheet with failure reasons, Rerun failed,
  Hand to Claude. Comments with diff lines, reply, resolve. Merge sheet with method, delete branch, Face ID
  (when the preference is on), signed merge.
- Quick Review: file walk (unified diff, syntax colours, wrapping), tap a line for a draft comment, mark reviewed,
  file dots, locked Approve with files left, decide sheet, Approve with a 5-second Undo before the signed submit,
  re-review starting on changed files. Reviewed files persist per PR and head.
- CI failure group: signal, stats, where it fails, claim, Investigate → launch sheet with `ciGroupId`.

### I2 · iPhone: Dispatch, threads, Activity, account
Owns `src/BorgDock.iOS/BorgDock/Features/{Overview,ItemDetail,StartThread,Browse,Thread,Launch,Activity,Account,Settings,SignIn}/**`,
`src/BorgDock.iOS/BorgDock/Networking/**`, `src/BorgDock.iOS/BorgDock/Notifications/**`, `src/BorgDock.iOS/BorgDock/Model/Platform.swift`,
`e2e/fixtures/20-platform.mjs`, its tests. Mockup sections 4, 5 (Activity) and 8.
- Sign in with Clerk (`ClerkKit`: Apple, GitHub, Microsoft, passkey; publishable key from `GET /api/server`),
  exchange for a device session with a Secure Enclave key (`RequestSigner` implementation), claim flow, Connect
  your work, Add a machine (camera QR via VisionKit + typed code, HMAC proof), Settings (account, sources,
  machines, notification categories, quiet at desk, Face ID, devices, sign out).
- Dispatch states walk (briefing, Fix out of sync / Sync all, lanes with verdicts, evidence, latest message),
  Thread (chat, folded activity, plan approval, composer), Launch sheet (machine, repository, workspace, model,
  plan first, move toggle, first message, signed launch), Work item restyled, Browse kept behind a toolbar button.
- Activity (behind the bell on Focus, not a tab: the tab bar holds five items with Search): filter pills, away
  card, entries, swipe to mark read, tap opens the target, mark all read; the bell shows unread.
- Notifications: register BORGDOCK_* categories, signed answers from actions, open targets, `read` pushes.

### I3 · iPhone: extensions, Notes, Search, Workstreams
Owns `src/BorgDock.iOS/BorgDockWidgets/**`, `src/BorgDock.iOS/BorgDockNotificationContent/**`, new files in `src/BorgDock.iOS/Shared/**` (don't change
existing tokens), `src/BorgDock.iOS/BorgDock/Features/{Notes,Search,Workstreams}/**`, `src/BorgDock.iOS/BorgDock/Extensions/**`,
`src/BorgDock.iOS/BorgDock/Model/{Notes,Widgets}.swift`, `src/BorgDock.iOS/project.yml`, `e2e/fixtures/30-notes.mjs`, its tests.
Mockup sections 5 (lock screen, widgets, Dynamic Island, notification), 6 and 7 (workstream).
- Widgets: Focus (medium), Agents (small), master health (small), lock-screen accessories; snapshot in the App
  Group, refreshed on foreground, background refresh and silent pushes. Control Center control + App Intent for
  Quick note (Action button).
- Live Activities: agent run and PR checks, compact/expanded/minimal, push token and push-to-start registration.
- Notification content extension: the question with its options and reasons; one action per option (the app
  handles and signs the answer).
- Notes: pick the vault folder in Files (security-scoped bookmark), daily note with the "Since yesterday" block
  from `/api/activity/digest` between `<!-- borgdock:… -->` markers, live chips for AB#/PR refs via
  `/api/refs/resolve`, tasks, wikilinks, list and new note, never writing over text you haven't read. Quick
  capture sheet with dictation, linked to what you last opened.
- Search tab (server search + notes full text, jump to a number), Spotlight for open PRs and items.
- Workstreams: read `BorgDock Workstreams/*.json` next to the notes folder (format: the desktop's
  `src-tauri/src/workstreams/` and `services/workstreams/`), outcomes, evidence, decisions.

## Conventions

- **One shared checkout.** Every command starts with `cd ~/projects/borgdock-mobile`. Never `git switch`, `git
  stash`, `git reset`, `git checkout -- <file>` or `git clean`: other slices have work in progress in the same tree.
  Don't touch other checkouts (the BorgDock desktop repo is read-only reference).
- **Commits**: small and logical, straight onto `borgdock`, containing only your files:
  `git add <your paths> && git commit -m "…" -- <your paths>` (the `-- <paths>` keeps other slices' staged
  changes out of your commit; retry if `index.lock` exists). Title in plain English (imperative, under 70 chars),
  body says why. End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push.
- **Write whole files and keep them compiling.** Other slices build the same app target. Prefer writing a complete
  file over leaving it half-edited, and fix your own build errors first. If a build fails only in files you don't
  own, wait two minutes and build again; never edit their files to make yours build.
- **Server checks**: `npm run typecheck` and your own tests (`node --no-warnings --test server/test/<yours>*.test.ts`);
  the full `npm test` before your last commit. Type errors only in another slice's files: wait and retry.
- **iPhone checks**: regenerate when you add or remove files (`cd ios && xcodegen generate`), then
  `xcodebuild -project ios/BorgDock.xcodeproj -scheme BorgDock -destination 'platform=iOS Simulator,name=<your simulator>'
  -derivedDataPath /tmp/bd-dd-<slice> build` (or `test`). Extension-only work can build one target:
  `-target BorgDockWidgets -sdk iphonesimulator`. Create your own simulator
  (`xcrun simctl create "BorgDock <slice>" "iPhone 17 Pro" com.apple.CoreSimulator.SimRuntime.iOS-26-5`); never use
  the booted shared ones.
- **Sample data**: `PORT=<port> node e2e/ui-fixture.mjs` (I1 8801, I2 8802, I3 8803); launch the app with
  `-BorgDockServer http://localhost:<port> -BorgDockToken sample-token-for-fixture-only-123 -BorgDockRoute …`.
  Add your endpoints to your own fixture module.
- **Proof**: screenshot every screen you build in light and dark against the fixture, compare with the mockup
  section, fix what's off, and keep the final shots in `src/BorgDock.iOS/screenshots/borgdock/<slice>/`.
- **Report**: head commit, your commit list, what works, what doesn't, contract changes, files touched outside your
  ownership, proof paths.

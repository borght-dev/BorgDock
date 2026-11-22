# BorgDock for iPhone

SwiftUI, iOS 26, XcodeGen (`project.yml` is the source). BorgDock's three targets, and BorgDock Review (below):

- `BorgDock`: the app (Focus, Pull requests, Work, Sprint, Search; Activity and Notes sit behind the bell and the notes button on Focus). Clerk's `ClerkKit` is its only package.
- `BorgDockWidgets`: widgets, lock-screen accessories, the Quick note control, and the agent and checks Live Activities.
- `BorgDockNotificationContent`: the expanded agent question with its options.

`Shared/` compiles into all three (BorgDock's design tokens `BD`, components, Live Activity attributes, question
actions). They share the App Group `group.dev.borght.borgdock`. The screens follow `design/ios-flow/mockups.html` (and `design/ios-app/mockups.html` for the rest) at the
repository root; `src/BorgDock.Server/docs/borgdock-plan.md` explains how the code is split. The server it talks to is
`src/BorgDock.Server`.

```sh
xcodegen generate
xcodebuild -project BorgDock.xcodeproj -scheme BorgDock -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test

# On the iPhone (Debug build; pushes use the APNs sandbox)
source ~/.config/together-ci/apple.env
xcodebuild -project BorgDock.xcodeproj -scheme BorgDock -configuration Debug -destination 'id=<device>' \
  -derivedDataPath build -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8 -authenticationKeyID $ASC_KEY_ID -authenticationKeyIssuerID $ASC_ISSUER_ID \
  BORGDOCK_SERVER_URL=$(node -p "require('$HOME/.borgdock-server/config.json').publicOrigin") build
xcrun devicectl device install app --device <device> build/Build/Products/Debug-iphoneos/BorgDock.app

# TestFlight (internal group "Internal", automatic distribution)
./testflight.sh
```

- **Signing:** team `2YU6RWHUWX`, automatic, through the App Store Connect API key (Xcode on the Mac mini has no
  personal Apple account). App Store Connect app "BorgDock", Apple ID 6829171084.
- **Server address:** a fresh install talks to `BORGDOCK_SERVER_URL`, which `testflight.sh` takes from the server's
  `publicOrigin` in `~/.borgdock-server/config.json`. Without it the app starts on `http://127.0.0.1:8797`; the sign-in
  screen changes it.
- **Sign-in:** Clerk (Apple, GitHub, passkeys; whatever the Clerk app enables), traded once for a BorgDock device
  session. Clerk keeps its session in the keychain, so a sign-in reuses it instead of running the provider again;
  a server that turns the account down, or a cancelled claim, signs out of Clerk so the next tap can pick another
  one. The first sign-in claims an unclaimed server through the `owners` allowlist in its `config.json`, or with a
  pairing code from `npm run cli -- pair` on the server's machine. A server without Clerk falls back to its own
  passkey web sign-in.
- **Device key:** a Secure Enclave P-256 key signs agent, merge and approve commands (`Networking/DeviceKey.swift`).
  Face ID guards them when Settings says so.
- **Notifications:** BORGDOCK_* categories; answers from the lock screen are signed and need an unlocked phone.
- **Simulator without Clerk** (Debug builds only): `-BorgDockServer <url> -BorgDockToken <bearer>`;
  `-BorgDockRoute <route>` opens a screen (see `App/RootView.swift` `DebugRoute`). None of this exists in Release.

## BorgDock Review: pull request review without the server

A second app in the same project (target and scheme `BorgDockReview`, bundle `dev.borght.borgdock.review`): the pull
request list, the pull request page, Quick Review and the work items a pull request names. It reads GitHub and Azure
DevOps straight from the phone, so it needs no BorgDock server, and has no agents, notes, sprint or pushes.

- **How it is built.** It compiles BorgDock's sources with its own entry point (`BorgDockReview/`) and without Clerk
  or the extensions. The screens ask a `PullRequestBackend` and a `WorkItemBackend` (`BorgDock/Model/Backends.swift`):
  the server client in BorgDock, `GitHubDirect` and `AdoWorkItems` here. `AppModel.direct` is set in this app only;
  `canStartAgents` hides what needs T3.
- **`Direct/`** is the Swift port of the server's `github/` and `ado/` code: the same searches, Focus rules, file
  categories and item page. Change a rule on both sides together. It is Foundation only, so `Package.swift` compiles
  it on the Mac: `swift test` runs `DirectTests/` in seconds, without a simulator (the Xcode test target runs them too).
- **Accounts** (`BorgDock/DirectMode/`): a token per GitHub account (classic, `repo` and `read:org`, single sign-on
  authorized) and one Azure DevOps organization, project and personal access token. They live in the Keychain of the
  phone. Watched repositories, snoozes and the last list live in Application Support.
- **Images** load through `ImageLoader` (`DesignSystem/ImageLoader.swift`), not `AsyncImage`: Azure DevOps
  attachments and uploads in private GitHub repositories need a token, and `AsyncImage` can't send one (it ignores
  registered `URLProtocol`s too). A token goes only to the address a rule names, never along with a redirect to
  another host.
- **Made-up data** (Debug): `-BorgDockFixture` answers GitHub and Azure DevOps from `DirectMode/DirectFixture.swift`
  (the `acme` shop) and touches no network; `-BorgDockRoute` opens a screen as in BorgDock. Use it for screenshots.
- **Your real accounts in a simulator** (Debug): `SIMCTL_CHILD_BORGDOCK_GITHUB_TOKENS="$(gh auth token)" xcrun simctl
  launch <id> dev.borght.borgdock.review`; add `BORGDOCK_ADO_ORGANIZATION`, `BORGDOCK_ADO_PROJECT` and
  `BORGDOCK_ADO_TOKEN` (or `BORGDOCK_ADO_BEARER`) for Azure DevOps. Build for a simulator with signing on: an
  unsigned build (`CODE_SIGNING_ALLOWED=NO`) can't use the Keychain. Never post screenshots of real work.

```sh
swift test                                   # Direct/ on the Mac
xcodebuild -project BorgDock.xcodeproj -scheme BorgDockReview -destination 'platform=iOS Simulator,id=<id>' build
```

## Sample data and screenshots

`cd ../BorgDock.Server && PORT=8801 node e2e/ui-fixture.mjs` serves made-up sample data plus BorgDock's fixture
modules in `e2e/fixtures/`. It keeps writes in memory and makes no external requests. Point the simulator at it with
`-BorgDockServer http://localhost:8801 -BorgDockToken fixture`. Screenshots stay out of the repository: capture them
again from the fixture when you need them.

This repository is public. Tests, fixtures and screenshots use made-up data only (the `acme` shop); never a real work
item, customer, host name or address.

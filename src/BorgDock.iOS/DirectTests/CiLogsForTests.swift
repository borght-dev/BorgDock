// The server's sample job logs (`server/test/github-fixtures/logs/`, made up after the desktop's
// src-tauri/src/ci_failures/fixtures/logs), as constants: SwiftPM and the Xcode test target find resource files in
// different places, and a constant is found by both. Copies of those files: a log changes on both sides together.
// `\#u{1B}` is the escape character of the runner's terminal colours.

enum CiLogs {
    /// `vitest-failure.txt`
    static let vitestFailure = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'oven-sh/setup-bun@v2' (SHA:4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5)
2026-10-20T09:14:01.1606000Z Complete job name: test
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: borght-dev/BorgDock
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: borght-dev/BorgDock
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/BorgDock/BorgDock/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run oven-sh/setup-bun@v2
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   bun-version: 1.1.38
2026-10-20T09:14:01.5256000Z   no-cache: false
2026-10-20T09:14:01.5329000Z ##[endgroup]
2026-10-20T09:14:01.5402000Z Downloading a new version of Bun: https://github.com/oven-sh/bun/releases/download/bun-v1.1.38/bun-linux-x64.zip
2026-10-20T09:14:01.5475000Z [command]/usr/bin/unzip -o -q /home/runner/work/_temp/6f3e2d1c-bun.zip
2026-10-20T09:14:01.5548000Z [command]/home/runner/.bun/bin/bun --revision
2026-10-20T09:14:01.5621000Z 1.1.38+bf2f153f5
2026-10-20T09:14:01.5694000Z ##[group]Run bun install --frozen-lockfile
2026-10-20T09:14:01.5767000Z \#u{1B}[36;1mbun install --frozen-lockfile\#u{1B}[0m
2026-10-20T09:14:01.5840000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5913000Z ##[endgroup]
2026-10-20T09:14:01.5986000Z bun install v1.1.38 (bf2f153f)
2026-10-20T09:14:01.6059000Z\#u{20}
2026-10-20T09:14:01.6132000Z + @biomejs/biome@1.9.4
2026-10-20T09:14:01.6205000Z + @tauri-apps/cli@2.1.0
2026-10-20T09:14:01.6278000Z + typescript@5.6.3
2026-10-20T09:14:01.6351000Z + vitest@3.2.4
2026-10-20T09:14:01.6424000Z\#u{20}
2026-10-20T09:14:01.6497000Z 1204 packages installed [8.41s]
2026-10-20T09:14:01.6570000Z ##[group]Run bun run lint
2026-10-20T09:14:01.6643000Z \#u{1B}[36;1mbun run lint\#u{1B}[0m
2026-10-20T09:14:01.6716000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.6789000Z ##[endgroup]
2026-10-20T09:14:01.6862000Z $ biome lint .
2026-10-20T09:14:01.6935000Z Checked 612 files in 341ms. No fixes applied.
2026-10-20T09:14:01.7008000Z ##[group]Run bun run test
2026-10-20T09:14:01.7081000Z \#u{1B}[36;1mbun run test\#u{1B}[0m
2026-10-20T09:14:01.7154000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.7227000Z ##[endgroup]
2026-10-20T09:14:01.7300000Z $ vitest run
2026-10-20T09:14:01.7373000Z\#u{20}
2026-10-20T09:14:01.7446000Z \#u{1B}[1m\#u{1B}[46m RUN \#u{1B}[49m\#u{1B}[22m \#u{1B}[36mv3.2.4 \#u{1B}[39m\#u{1B}[90m/home/runner/work/BorgDock/BorgDock/src/BorgDock.Tauri\#u{1B}[39m
2026-10-20T09:14:01.7519000Z\#u{20}
2026-10-20T09:14:01.7592000Z  \#u{1B}[32m✓\#u{1B}[39m src/utils/__tests__/format.test.ts \#u{1B}[2m(\#u{1B}[22m\#u{1B}[2m12 tests\#u{1B}[22m\#u{1B}[2m)\#u{1B}[22m\#u{1B}[32m 8\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.7665000Z  \#u{1B}[33m❯\#u{1B}[39m src/services/__tests__/cart.test.ts \#u{1B}[2m(\#u{1B}[22m\#u{1B}[2m3 tests\#u{1B}[22m\#u{1B}[2m | \#u{1B}[22m\#u{1B}[31m1 failed\#u{1B}[39m\#u{1B}[2m)\#u{1B}[22m\#u{1B}[32m 14\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.7738000Z    \#u{1B}[32m✓\#u{1B}[39m cart > adds an item\#u{1B}[32m 2\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.7811000Z    \#u{1B}[31m×\#u{1B}[39m cart > applies the discount\#u{1B}[32m 9\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.7884000Z      \#u{1B}[31m→ expected 100 to be 90 // Object.is equality\#u{1B}[39m
2026-10-20T09:14:01.7957000Z    \#u{1B}[32m✓\#u{1B}[39m cart > removes an item\#u{1B}[32m 1\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.8030000Z  \#u{1B}[33m❯\#u{1B}[39m src/components/__tests__/CartSummary.test.tsx \#u{1B}[2m(\#u{1B}[22m\#u{1B}[2m4 tests\#u{1B}[22m\#u{1B}[2m | \#u{1B}[22m\#u{1B}[31m2 failed\#u{1B}[39m\#u{1B}[2m)\#u{1B}[22m\#u{1B}[32m 41\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.8103000Z    \#u{1B}[32m✓\#u{1B}[39m CartSummary > renders the items\#u{1B}[32m 12\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.8176000Z    \#u{1B}[31m×\#u{1B}[39m CartSummary > renders the total\#u{1B}[32m 6\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.8249000Z      \#u{1B}[31m→ Cannot read properties of undefined (reading 'toFixed')\#u{1B}[39m
2026-10-20T09:14:01.8322000Z    \#u{1B}[31m×\#u{1B}[39m CartSummary > renders the savings\#u{1B}[32m 4\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.8395000Z      \#u{1B}[31m→ Cannot read properties of undefined (reading 'toFixed')\#u{1B}[39m
2026-10-20T09:14:01.8468000Z    \#u{1B}[32m✓\#u{1B}[39m CartSummary > renders empty\#u{1B}[32m 3\#u{1B}[2mms\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.8541000Z\#u{20}
2026-10-20T09:14:01.8614000Z \#u{1B}[31m⎯⎯⎯⎯⎯⎯⎯\#u{1B}[39m\#u{1B}[1m\#u{1B}[41m Failed Tests 3 \#u{1B}[49m\#u{1B}[22m\#u{1B}[31m⎯⎯⎯⎯⎯⎯⎯\#u{1B}[39m
2026-10-20T09:14:01.8687000Z\#u{20}
2026-10-20T09:14:01.8760000Z \#u{1B}[41m\#u{1B}[1m FAIL \#u{1B}[22m\#u{1B}[49m src/services/__tests__/cart.test.ts\#u{1B}[2m > \#u{1B}[22mcart\#u{1B}[2m > \#u{1B}[22mapplies the discount
2026-10-20T09:14:01.8833000Z \#u{1B}[31m\#u{1B}[1mAssertionError\#u{1B}[22m: expected 100 to be 90 // Object.is equality\#u{1B}[39m
2026-10-20T09:14:01.8906000Z\#u{20}
2026-10-20T09:14:01.8979000Z \#u{1B}[32m- Expected\#u{1B}[39m
2026-10-20T09:14:01.9052000Z \#u{1B}[31m+ Received\#u{1B}[39m
2026-10-20T09:14:01.9125000Z\#u{20}
2026-10-20T09:14:01.9198000Z \#u{1B}[32m- 90\#u{1B}[39m
2026-10-20T09:14:01.9271000Z \#u{1B}[31m+ 100\#u{1B}[39m
2026-10-20T09:14:01.9344000Z\#u{20}
2026-10-20T09:14:01.9417000Z \#u{1B}[36m \#u{1B}[2m❯\#u{1B}[22m src/services/__tests__/cart.test.ts:\#u{1B}[2m24:31\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:01.9490000Z     \#u{1B}[90m 22| \#u{1B}[39m    const cart = createCart([{ price: 100 }]);
2026-10-20T09:14:01.9563000Z     \#u{1B}[90m 23| \#u{1B}[39m    cart.applyDiscount('SAVE10');
2026-10-20T09:14:01.9636000Z     \#u{1B}[90m 24| \#u{1B}[39m    expect(cart.total()).toBe(90);
2026-10-20T09:14:01.9709000Z     \#u{1B}[90m   | \#u{1B}[39m                         \#u{1B}[31m^\#u{1B}[39m
2026-10-20T09:14:01.9782000Z     \#u{1B}[90m 25| \#u{1B}[39m  });
2026-10-20T09:14:01.9855000Z     \#u{1B}[90m 26| \#u{1B}[39m});
2026-10-20T09:14:01.9928000Z\#u{20}
2026-10-20T09:14:02.0001000Z \#u{1B}[31m\#u{1B}[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:02.0074000Z\#u{20}
2026-10-20T09:14:02.0147000Z \#u{1B}[41m\#u{1B}[1m FAIL \#u{1B}[22m\#u{1B}[49m src/components/__tests__/CartSummary.test.tsx\#u{1B}[2m > \#u{1B}[22mCartSummary\#u{1B}[2m > \#u{1B}[22mrenders the total
2026-10-20T09:14:02.0220000Z \#u{1B}[41m\#u{1B}[1m FAIL \#u{1B}[22m\#u{1B}[49m src/components/__tests__/CartSummary.test.tsx\#u{1B}[2m > \#u{1B}[22mCartSummary\#u{1B}[2m > \#u{1B}[22mrenders the savings
2026-10-20T09:14:02.0293000Z \#u{1B}[31m\#u{1B}[1mTypeError\#u{1B}[22m: Cannot read properties of undefined (reading 'toFixed')\#u{1B}[39m
2026-10-20T09:14:02.0366000Z \#u{1B}[36m \#u{1B}[2m❯\#u{1B}[22m formatMoney src/components/CartSummary.tsx:\#u{1B}[2m18:22\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:02.0439000Z     \#u{1B}[90m 16| \#u{1B}[39m
2026-10-20T09:14:02.0512000Z     \#u{1B}[90m 17| \#u{1B}[39mfunction formatMoney(value: number) {
2026-10-20T09:14:02.0585000Z     \#u{1B}[90m 18| \#u{1B}[39m  return `$${value.toFixed(2)}`;
2026-10-20T09:14:02.0658000Z     \#u{1B}[90m   | \#u{1B}[39m                   \#u{1B}[31m^\#u{1B}[39m
2026-10-20T09:14:02.0731000Z     \#u{1B}[90m 19| \#u{1B}[39m}
2026-10-20T09:14:02.0804000Z \#u{1B}[90m \#u{1B}[2m❯\#u{1B}[22m src/components/__tests__/CartSummary.test.tsx:\#u{1B}[2m12:5\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:02.0877000Z\#u{20}
2026-10-20T09:14:02.0950000Z \#u{1B}[31m\#u{1B}[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯\#u{1B}[22m\#u{1B}[39m
2026-10-20T09:14:02.1023000Z\#u{20}
2026-10-20T09:14:02.1096000Z\#u{20}
2026-10-20T09:14:02.1169000Z \#u{1B}[2m Test Files \#u{1B}[22m \#u{1B}[1m\#u{1B}[31m2 failed\#u{1B}[39m\#u{1B}[22m\#u{1B}[2m | \#u{1B}[22m\#u{1B}[1m\#u{1B}[32m1 passed\#u{1B}[39m\#u{1B}[22m\#u{1B}[90m (3)\#u{1B}[39m
2026-10-20T09:14:02.1242000Z \#u{1B}[2m      Tests \#u{1B}[22m \#u{1B}[1m\#u{1B}[31m3 failed\#u{1B}[39m\#u{1B}[22m\#u{1B}[2m | \#u{1B}[22m\#u{1B}[1m\#u{1B}[32m16 passed\#u{1B}[39m\#u{1B}[22m\#u{1B}[90m (19)\#u{1B}[39m
2026-10-20T09:14:02.1315000Z \#u{1B}[2m   Start at \#u{1B}[22m 09:14:31
2026-10-20T09:14:02.1388000Z \#u{1B}[2m   Duration \#u{1B}[22m 1.84s\#u{1B}[2m (transform 312ms, setup 0ms, collect 902ms, tests 63ms, environment 1.20s, prepare 410ms)\#u{1B}[22m
2026-10-20T09:14:02.1461000Z\#u{20}
2026-10-20T09:14:02.1534000Z error: script "test" exited with code 1
2026-10-20T09:14:02.1607000Z ##[error]Process completed with exit code 1.
2026-10-20T09:14:02.1680000Z Post job cleanup.
2026-10-20T09:14:02.1753000Z [command]/usr/bin/git version
2026-10-20T09:14:02.1826000Z git version 2.47.0
2026-10-20T09:14:02.1899000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:02.1972000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:02.2045000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:02.2118000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:02.2191000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:02.2264000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:02.2337000Z http.https://github.com/.extraheader
2026-10-20T09:14:02.2410000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:02.2483000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:02.2556000Z Cleaning up orphan processes

"""#

    /// `playwright-retries.txt`
    static let playwrightRetries = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'oven-sh/setup-bun@v2' (SHA:4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5)
2026-10-20T09:14:01.1606000Z Complete job name: e2e
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: borght-dev/BorgDock
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: borght-dev/BorgDock
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/BorgDock/BorgDock/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run oven-sh/setup-bun@v2
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   bun-version: 1.1.38
2026-10-20T09:14:01.5256000Z   no-cache: false
2026-10-20T09:14:01.5329000Z ##[endgroup]
2026-10-20T09:14:01.5402000Z Downloading a new version of Bun: https://github.com/oven-sh/bun/releases/download/bun-v1.1.38/bun-linux-x64.zip
2026-10-20T09:14:01.5475000Z [command]/usr/bin/unzip -o -q /home/runner/work/_temp/6f3e2d1c-bun.zip
2026-10-20T09:14:01.5548000Z [command]/home/runner/.bun/bin/bun --revision
2026-10-20T09:14:01.5621000Z 1.1.38+bf2f153f5
2026-10-20T09:14:01.5694000Z ##[group]Run bun install --frozen-lockfile
2026-10-20T09:14:01.5767000Z \#u{1B}[36;1mbun install --frozen-lockfile\#u{1B}[0m
2026-10-20T09:14:01.5840000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5913000Z ##[endgroup]
2026-10-20T09:14:01.5986000Z bun install v1.1.38 (bf2f153f)
2026-10-20T09:14:01.6059000Z\#u{20}
2026-10-20T09:14:01.6132000Z + @biomejs/biome@1.9.4
2026-10-20T09:14:01.6205000Z + @tauri-apps/cli@2.1.0
2026-10-20T09:14:01.6278000Z + typescript@5.6.3
2026-10-20T09:14:01.6351000Z + vitest@3.2.4
2026-10-20T09:14:01.6424000Z\#u{20}
2026-10-20T09:14:01.6497000Z 1204 packages installed [8.41s]
2026-10-20T09:14:01.6570000Z ##[group]Run bunx playwright install --with-deps chromium
2026-10-20T09:14:01.6643000Z \#u{1B}[36;1mbunx playwright install --with-deps chromium\#u{1B}[0m
2026-10-20T09:14:01.6716000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.6789000Z ##[endgroup]
2026-10-20T09:14:01.6862000Z Installing dependencies...
2026-10-20T09:14:01.6935000Z Downloading Chromium 131.0.6778.33 (playwright build v1148) from https://playwright.azureedge.net/builds/chromium/1148/chromium-linux.zip
2026-10-20T09:14:01.7008000Z |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 164.7 MiB
2026-10-20T09:14:01.7081000Z Chromium 131.0.6778.33 (playwright build v1148) downloaded to /home/runner/.cache/ms-playwright/chromium-1148
2026-10-20T09:14:01.7154000Z ##[group]Run bunx playwright test
2026-10-20T09:14:01.7227000Z \#u{1B}[36;1mbunx playwright test\#u{1B}[0m
2026-10-20T09:14:01.7300000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.7373000Z env:
2026-10-20T09:14:01.7446000Z   CI: true
2026-10-20T09:14:01.7519000Z ##[endgroup]
2026-10-20T09:14:01.7592000Z\#u{20}
2026-10-20T09:14:01.7665000Z Running 26 tests using 2 workers
2026-10-20T09:14:01.7738000Z\#u{20}
2026-10-20T09:14:01.7811000Z   \#u{1B}[32m✓\#u{1B}[39m   1 [chromium] › tests/login.spec.ts:8:5 › Login › signs in \#u{1B}[2m(2.1s)\#u{1B}[22m
2026-10-20T09:14:01.7884000Z   \#u{1B}[32m✓\#u{1B}[39m   2 [chromium] › tests/cart.spec.ts:8:5 › Cart › adds an item \#u{1B}[2m(1.8s)\#u{1B}[22m
2026-10-20T09:14:01.7957000Z   \#u{1B}[31m✘\#u{1B}[39m   3 [chromium] › tests/cart.spec.ts:18:5 › Cart › removes an item \#u{1B}[2m(10.2s)\#u{1B}[22m
2026-10-20T09:14:01.8030000Z   \#u{1B}[31m✘\#u{1B}[39m   4 [chromium] › tests/checkout.spec.ts:42:7 › Checkout › applies a discount code \#u{1B}[2m(5.4s)\#u{1B}[22m
2026-10-20T09:14:01.8103000Z   \#u{1B}[32m✓\#u{1B}[39m   5 [chromium] › tests/cart.spec.ts:18:5 › Cart › removes an item (retry #1) \#u{1B}[2m(2.2s)\#u{1B}[22m
2026-10-20T09:14:01.8176000Z   \#u{1B}[31m✘\#u{1B}[39m   6 [chromium] › tests/checkout.spec.ts:42:7 › Checkout › applies a discount code (retry #1) \#u{1B}[2m(5.3s)\#u{1B}[22m
2026-10-20T09:14:01.8249000Z   \#u{1B}[32m✓\#u{1B}[39m   7 [chromium] › tests/checkout.spec.ts:61:7 › Checkout › pays with a saved card \#u{1B}[2m(3.0s)\#u{1B}[22m
2026-10-20T09:14:01.8322000Z   \#u{1B}[31m✘\#u{1B}[39m   8 [chromium] › tests/checkout.spec.ts:42:7 › Checkout › applies a discount code (retry #2) \#u{1B}[2m(5.3s)\#u{1B}[22m
2026-10-20T09:14:01.8395000Z\#u{20}
2026-10-20T09:14:01.8468000Z\#u{20}
2026-10-20T09:14:01.8541000Z   1) [chromium] › tests/checkout.spec.ts:42:7 › Checkout › applies a discount code ─────────────────
2026-10-20T09:14:01.8614000Z\#u{20}
2026-10-20T09:14:01.8687000Z     Error: expect(locator).toHaveText(expected) failed
2026-10-20T09:14:01.8760000Z\#u{20}
2026-10-20T09:14:01.8833000Z     Locator:  getByTestId('total')
2026-10-20T09:14:01.8906000Z     Expected: "$90.00"
2026-10-20T09:14:01.8979000Z     Received: "$100.00"
2026-10-20T09:14:01.9052000Z     Timeout:  5000ms
2026-10-20T09:14:01.9125000Z\#u{20}
2026-10-20T09:14:01.9198000Z     Call log:
2026-10-20T09:14:01.9271000Z       - Expect "toHaveText" with timeout 5000ms
2026-10-20T09:14:01.9344000Z       - waiting for getByTestId('total')
2026-10-20T09:14:01.9417000Z         9 × locator resolved to <span data-testid="total">$100.00</span>
2026-10-20T09:14:01.9490000Z           - unexpected value "$100.00"
2026-10-20T09:14:01.9563000Z\#u{20}
2026-10-20T09:14:01.9636000Z\#u{20}
2026-10-20T09:14:01.9709000Z       46 |   await page.getByLabel('Discount code').fill('SAVE10');
2026-10-20T09:14:01.9782000Z       47 |   await page.getByRole('button', { name: 'Apply' }).click();
2026-10-20T09:14:01.9855000Z     > 48 |   await expect(page.getByTestId('total')).toHaveText('$90.00');
2026-10-20T09:14:01.9928000Z          |                                           ^
2026-10-20T09:14:02.0001000Z       49 | });
2026-10-20T09:14:02.0074000Z       50 |
2026-10-20T09:14:02.0147000Z\#u{20}
2026-10-20T09:14:02.0220000Z         at /home/runner/work/BorgDock/BorgDock/tests/checkout.spec.ts:48:43
2026-10-20T09:14:02.0293000Z\#u{20}
2026-10-20T09:14:02.0366000Z     Error Context: test-results/checkout-Checkout-applies-a-discount-code-chromium/error-context.md
2026-10-20T09:14:02.0439000Z\#u{20}
2026-10-20T09:14:02.0512000Z     Retry #1 ───────────────────────────────────────────────────────────────────────────────────────
2026-10-20T09:14:02.0585000Z\#u{20}
2026-10-20T09:14:02.0658000Z     Error: expect(locator).toHaveText(expected) failed
2026-10-20T09:14:02.0731000Z\#u{20}
2026-10-20T09:14:02.0804000Z     Locator:  getByTestId('total')
2026-10-20T09:14:02.0877000Z     Expected: "$90.00"
2026-10-20T09:14:02.0950000Z     Received: "$100.00"
2026-10-20T09:14:02.1023000Z     Timeout:  5000ms
2026-10-20T09:14:02.1096000Z\#u{20}
2026-10-20T09:14:02.1169000Z         at /home/runner/work/BorgDock/BorgDock/tests/checkout.spec.ts:48:43
2026-10-20T09:14:02.1242000Z\#u{20}
2026-10-20T09:14:02.1315000Z     Error Context: test-results/checkout-Checkout-applies-a-discount-code-chromium-retry1/error-context.md
2026-10-20T09:14:02.1388000Z\#u{20}
2026-10-20T09:14:02.1461000Z     Retry #2 ───────────────────────────────────────────────────────────────────────────────────────
2026-10-20T09:14:02.1534000Z\#u{20}
2026-10-20T09:14:02.1607000Z     Error: expect(locator).toHaveText(expected) failed
2026-10-20T09:14:02.1680000Z\#u{20}
2026-10-20T09:14:02.1753000Z     Locator:  getByTestId('total')
2026-10-20T09:14:02.1826000Z     Expected: "$90.00"
2026-10-20T09:14:02.1899000Z     Received: "$100.00"
2026-10-20T09:14:02.1972000Z     Timeout:  5000ms
2026-10-20T09:14:02.2045000Z\#u{20}
2026-10-20T09:14:02.2118000Z         at /home/runner/work/BorgDock/BorgDock/tests/checkout.spec.ts:48:43
2026-10-20T09:14:02.2191000Z\#u{20}
2026-10-20T09:14:02.2264000Z     attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
2026-10-20T09:14:02.2337000Z     test-results/checkout-Checkout-applies-a-discount-code-chromium-retry2/trace.zip
2026-10-20T09:14:02.2410000Z     Usage:
2026-10-20T09:14:02.2483000Z\#u{20}
2026-10-20T09:14:02.2556000Z         bunx playwright show-trace test-results/checkout-Checkout-applies-a-discount-code-chromium-retry2/trace.zip
2026-10-20T09:14:02.2629000Z\#u{20}
2026-10-20T09:14:02.2702000Z     ────────────────────────────────────────────────────────────────────────────────────────────────
2026-10-20T09:14:02.2775000Z\#u{20}
2026-10-20T09:14:02.2848000Z   2) [chromium] › tests/cart.spec.ts:18:5 › Cart › removes an item ──────────────────────────────────
2026-10-20T09:14:02.2921000Z\#u{20}
2026-10-20T09:14:02.2994000Z     TimeoutError: locator.click: Timeout 10000ms exceeded.
2026-10-20T09:14:02.3067000Z     Call log:
2026-10-20T09:14:02.3140000Z       - waiting for getByRole('button', { name: 'Remove' })
2026-10-20T09:14:02.3213000Z\#u{20}
2026-10-20T09:14:02.3286000Z\#u{20}
2026-10-20T09:14:02.3359000Z       18 | test('removes an item', async ({ page }) => {
2026-10-20T09:14:02.3432000Z       19 |   await page.goto('/cart');
2026-10-20T09:14:02.3505000Z     > 20 |   await page.getByRole('button', { name: 'Remove' }).click();
2026-10-20T09:14:02.3578000Z          |                                                       ^
2026-10-20T09:14:02.3651000Z       21 |   await expect(page.getByTestId('cart-count')).toHaveText('0');
2026-10-20T09:14:02.3724000Z       22 | });
2026-10-20T09:14:02.3797000Z\#u{20}
2026-10-20T09:14:02.3870000Z         at /home/runner/work/BorgDock/BorgDock/tests/cart.spec.ts:20:55
2026-10-20T09:14:02.3943000Z\#u{20}
2026-10-20T09:14:02.4016000Z     Error Context: test-results/cart-Cart-removes-an-item-chromium/error-context.md
2026-10-20T09:14:02.4089000Z\#u{20}
2026-10-20T09:14:02.4162000Z   1 failed
2026-10-20T09:14:02.4235000Z     [chromium] › tests/checkout.spec.ts:42:7 › Checkout › applies a discount code ──
2026-10-20T09:14:02.4308000Z   1 flaky
2026-10-20T09:14:02.4381000Z     [chromium] › tests/cart.spec.ts:18:5 › Cart › removes an item ──────────────
2026-10-20T09:14:02.4454000Z   24 passed (1.4m)
2026-10-20T09:14:02.4527000Z error: "playwright" exited with code 1
2026-10-20T09:14:02.4600000Z ##[error]Process completed with exit code 1.
2026-10-20T09:14:02.4673000Z Post job cleanup.
2026-10-20T09:14:02.4746000Z [command]/usr/bin/git version
2026-10-20T09:14:02.4819000Z git version 2.47.0
2026-10-20T09:14:02.4892000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:02.4965000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:02.5038000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:02.5111000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:02.5184000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:02.5257000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:02.5330000Z http.https://github.com/.extraheader
2026-10-20T09:14:02.5403000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:02.5476000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:02.5549000Z Cleaning up orphan processes

"""#

    /// `tsc-errors.txt`
    static let tscErrors = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'oven-sh/setup-bun@v2' (SHA:4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5)
2026-10-20T09:14:01.1606000Z Complete job name: typecheck
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: borght-dev/BorgDock
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: borght-dev/BorgDock
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/BorgDock/BorgDock/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run oven-sh/setup-bun@v2
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   bun-version: 1.1.38
2026-10-20T09:14:01.5256000Z   no-cache: false
2026-10-20T09:14:01.5329000Z ##[endgroup]
2026-10-20T09:14:01.5402000Z Downloading a new version of Bun: https://github.com/oven-sh/bun/releases/download/bun-v1.1.38/bun-linux-x64.zip
2026-10-20T09:14:01.5475000Z [command]/usr/bin/unzip -o -q /home/runner/work/_temp/6f3e2d1c-bun.zip
2026-10-20T09:14:01.5548000Z [command]/home/runner/.bun/bin/bun --revision
2026-10-20T09:14:01.5621000Z 1.1.38+bf2f153f5
2026-10-20T09:14:01.5694000Z ##[group]Run bun install --frozen-lockfile
2026-10-20T09:14:01.5767000Z \#u{1B}[36;1mbun install --frozen-lockfile\#u{1B}[0m
2026-10-20T09:14:01.5840000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5913000Z ##[endgroup]
2026-10-20T09:14:01.5986000Z bun install v1.1.38 (bf2f153f)
2026-10-20T09:14:01.6059000Z\#u{20}
2026-10-20T09:14:01.6132000Z + @biomejs/biome@1.9.4
2026-10-20T09:14:01.6205000Z + @tauri-apps/cli@2.1.0
2026-10-20T09:14:01.6278000Z + typescript@5.6.3
2026-10-20T09:14:01.6351000Z + vitest@3.2.4
2026-10-20T09:14:01.6424000Z\#u{20}
2026-10-20T09:14:01.6497000Z 1204 packages installed [8.41s]
2026-10-20T09:14:01.6570000Z ##[group]Run bun run typecheck
2026-10-20T09:14:01.6643000Z \#u{1B}[36;1mbun run typecheck\#u{1B}[0m
2026-10-20T09:14:01.6716000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.6789000Z ##[endgroup]
2026-10-20T09:14:01.6862000Z $ tsc -b
2026-10-20T09:14:01.6935000Z src/services/cart.ts(14,5): error TS2322: Type 'string' is not assignable to type 'number'.
2026-10-20T09:14:01.7008000Z src/components/CartSummary.tsx(31,22): error TS2339: Property 'discountTotal' does not exist on type 'Cart'.
2026-10-20T09:14:01.7081000Z src/components/CartSummary.tsx(52,18): error TS7006: Parameter 'item' implicitly has an 'any' type.
2026-10-20T09:14:01.7154000Z error: script "typecheck" exited with code 2
2026-10-20T09:14:01.7227000Z ##[error]Process completed with exit code 2.
2026-10-20T09:14:01.7300000Z Post job cleanup.
2026-10-20T09:14:01.7373000Z [command]/usr/bin/git version
2026-10-20T09:14:01.7446000Z git version 2.47.0
2026-10-20T09:14:01.7519000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:01.7592000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.7665000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.7738000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:01.7811000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:01.7884000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:01.7957000Z http.https://github.com/.extraheader
2026-10-20T09:14:01.8030000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:01.8103000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:01.8176000Z Cleaning up orphan processes

"""#

    /// `rustc-compile-error.txt`
    static let rustcCompileError = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'dtolnay/rust-toolchain@stable' (SHA:315e265cd78dad1e1dcf3a5074f6d6c47029d5aa)
2026-10-20T09:14:01.1606000Z Complete job name: rust
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: borght-dev/BorgDock
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: borght-dev/BorgDock
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/BorgDock/BorgDock/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run dtolnay/rust-toolchain@stable
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   toolchain: stable
2026-10-20T09:14:01.5256000Z   components: clippy
2026-10-20T09:14:01.5329000Z ##[endgroup]
2026-10-20T09:14:01.5402000Z info: component 'clippy' for target 'x86_64-unknown-linux-gnu' is up to date
2026-10-20T09:14:01.5475000Z ##[group]Run cargo clippy --lib -- -D warnings
2026-10-20T09:14:01.5548000Z \#u{1B}[36;1mcargo clippy --lib -- -D warnings\#u{1B}[0m
2026-10-20T09:14:01.5621000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5694000Z env:
2026-10-20T09:14:01.5767000Z   CARGO_TERM_COLOR: always
2026-10-20T09:14:01.5840000Z ##[endgroup]
2026-10-20T09:14:01.5913000Z \#u{1B}[1m\#u{1B}[92m    Checking\#u{1B}[0m borgdock v4.6.0 (/home/runner/work/BorgDock/BorgDock/src/BorgDock.Tauri/src-tauri)
2026-10-20T09:14:01.5986000Z \#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;9merror[E0308]\#u{1B}[0m\#u{1B}[0m\#u{1B}[1m: mismatched types\#u{1B}[0m
2026-10-20T09:14:01.6059000Z \#u{1B}[0m  \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m--> \#u{1B}[0m\#u{1B}[0msrc/ci_failures/extract/mod.rs:61:5\#u{1B}[0m
2026-10-20T09:14:01.6132000Z \#u{1B}[0m   \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m
2026-10-20T09:14:01.6205000Z \#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m59\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0mfn first_line(lines: &[&str]) -> u32 {\#u{1B}[0m
2026-10-20T09:14:01.6278000Z \#u{1B}[0m   \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m                                  \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m---\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12mexpected `u32` because of return type\#u{1B}[0m
2026-10-20T09:14:01.6351000Z \#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m60\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m    let _ = lines;\#u{1B}[0m
2026-10-20T09:14:01.6424000Z \#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m61\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m    "1"\#u{1B}[0m
2026-10-20T09:14:01.6497000Z \#u{1B}[0m   \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m     \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;9m^^^\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;9mexpected `u32`, found `&str`\#u{1B}[0m
2026-10-20T09:14:01.6570000Z\#u{20}
2026-10-20T09:14:01.6643000Z \#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;9merror[E0425]\#u{1B}[0m\#u{1B}[0m\#u{1B}[1m: cannot find value `lines` in this scope\#u{1B}[0m
2026-10-20T09:14:01.6716000Z \#u{1B}[0m   \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m--> \#u{1B}[0m\#u{1B}[0msrc/ci_failures/extract/generic.rs:24:30\#u{1B}[0m
2026-10-20T09:14:01.6789000Z \#u{1B}[0m    \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m
2026-10-20T09:14:01.6862000Z \#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m24\#u{1B}[0m\#u{1B}[0m  \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m    for (index, line) in lines.iter().enumerate() {\#u{1B}[0m
2026-10-20T09:14:01.6935000Z \#u{1B}[0m    \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;12m|\#u{1B}[0m\#u{1B}[0m                          \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;9m^^^^^\#u{1B}[0m\#u{1B}[0m \#u{1B}[0m\#u{1B}[0m\#u{1B}[1m\#u{1B}[38;5;9mnot found in this scope\#u{1B}[0m
2026-10-20T09:14:01.7008000Z\#u{20}
2026-10-20T09:14:01.7081000Z \#u{1B}[0m\#u{1B}[1mSome errors have detailed explanations: E0308, E0425.\#u{1B}[0m
2026-10-20T09:14:01.7154000Z \#u{1B}[0m\#u{1B}[1mFor more information about an error, try `rustc --explain E0308`.\#u{1B}[0m
2026-10-20T09:14:01.7227000Z \#u{1B}[1m\#u{1B}[91merror\#u{1B}[0m\#u{1B}[1m:\#u{1B}[0m could not compile `borgdock` (lib) due to 2 previous errors
2026-10-20T09:14:01.7300000Z ##[error]Process completed with exit code 101.
2026-10-20T09:14:01.7373000Z Post job cleanup.
2026-10-20T09:14:01.7446000Z [command]/usr/bin/git version
2026-10-20T09:14:01.7519000Z git version 2.47.0
2026-10-20T09:14:01.7592000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:01.7665000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.7738000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.7811000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:01.7884000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:01.7957000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:01.8030000Z http.https://github.com/.extraheader
2026-10-20T09:14:01.8103000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:01.8176000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:01.8249000Z Cleaning up orphan processes

"""#

    /// `dotnet-xunit.txt`
    static let dotnetXunit = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'actions/setup-dotnet@v4' (SHA:3e891b0cb619bf60e2c25674b222b8940e2c1c25)
2026-10-20T09:14:01.1606000Z Complete job name: test (ubuntu-latest)
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: acme/shop-api
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: acme/shop-api
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/shop-api/shop-api'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/shop-api/shop-api
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/shop-api/shop-api'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/shop-api/shop-api
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/shop-api/shop-api/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/acme/shop-api
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/acme/shop-api
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run actions/setup-dotnet@v4
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   dotnet-version: 8.0.x
2026-10-20T09:14:01.5256000Z   cache: false
2026-10-20T09:14:01.5329000Z ##[endgroup]
2026-10-20T09:14:01.5402000Z [command]/home/runner/work/_actions/actions/setup-dotnet/v4/externals/install-dotnet.sh --skip-non-versioned-files --runtime dotnet --channel LTS
2026-10-20T09:14:01.5475000Z dotnet-install: .NET Core Runtime with version '8.0.10' is already installed.
2026-10-20T09:14:01.5548000Z [command]/home/runner/work/_actions/actions/setup-dotnet/v4/externals/install-dotnet.sh --skip-non-versioned-files --channel 8.0
2026-10-20T09:14:01.5621000Z dotnet-install: .NET Core SDK with version '8.0.403' is already installed.
2026-10-20T09:14:01.5694000Z ##[group]Run dotnet build --configuration Release
2026-10-20T09:14:01.5767000Z \#u{1B}[36;1mdotnet build --configuration Release\#u{1B}[0m
2026-10-20T09:14:01.5840000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5913000Z env:
2026-10-20T09:14:01.5986000Z   DOTNET_ROOT: /usr/share/dotnet
2026-10-20T09:14:01.6059000Z ##[endgroup]
2026-10-20T09:14:01.6132000Z   Determining projects to restore...
2026-10-20T09:14:01.6205000Z   Restored /home/runner/work/shop-api/shop-api/src/Shop.Orders/Shop.Orders.csproj (in 2.1 sec).
2026-10-20T09:14:01.6278000Z   Restored /home/runner/work/shop-api/shop-api/tests/Shop.Orders.Tests/Shop.Orders.Tests.csproj (in 2.4 sec).
2026-10-20T09:14:01.6351000Z /home/runner/work/shop-api/shop-api/src/Shop.Orders/Payments/CardGateway.cs(27,17): warning CS0168: The variable 'ex' is declared but never used [/home/runner/work/shop-api/shop-api/src/Shop.Orders/Shop.Orders.csproj]
2026-10-20T09:14:01.6424000Z   Shop.Orders -> /home/runner/work/shop-api/shop-api/src/Shop.Orders/bin/Release/net8.0/Shop.Orders.dll
2026-10-20T09:14:01.6497000Z   Shop.Orders.Tests -> /home/runner/work/shop-api/shop-api/tests/Shop.Orders.Tests/bin/Release/net8.0/Shop.Orders.Tests.dll
2026-10-20T09:14:01.6570000Z\#u{20}
2026-10-20T09:14:01.6643000Z Build succeeded.
2026-10-20T09:14:01.6716000Z\#u{20}
2026-10-20T09:14:01.6789000Z /home/runner/work/shop-api/shop-api/src/Shop.Orders/Payments/CardGateway.cs(27,17): warning CS0168: The variable 'ex' is declared but never used [/home/runner/work/shop-api/shop-api/src/Shop.Orders/Shop.Orders.csproj]
2026-10-20T09:14:01.6862000Z     1 Warning(s)
2026-10-20T09:14:01.6935000Z     0 Error(s)
2026-10-20T09:14:01.7008000Z\#u{20}
2026-10-20T09:14:01.7081000Z Time Elapsed 00:00:18.42
2026-10-20T09:14:01.7154000Z ##[group]Run dotnet test --no-build --configuration Release
2026-10-20T09:14:01.7227000Z \#u{1B}[36;1mdotnet test --no-build --configuration Release\#u{1B}[0m
2026-10-20T09:14:01.7300000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.7373000Z env:
2026-10-20T09:14:01.7446000Z   DOTNET_ROOT: /usr/share/dotnet
2026-10-20T09:14:01.7519000Z ##[endgroup]
2026-10-20T09:14:01.7592000Z Test run for /home/runner/work/shop-api/shop-api/tests/Shop.Orders.Tests/bin/Release/net8.0/Shop.Orders.Tests.dll (.NETCoreApp,Version=v8.0)
2026-10-20T09:14:01.7665000Z VSTest version 17.11.1 (x64)
2026-10-20T09:14:01.7738000Z\#u{20}
2026-10-20T09:14:01.7811000Z Starting test execution, please wait...
2026-10-20T09:14:01.7884000Z A total of 1 test files matched the specified pattern.
2026-10-20T09:14:01.7957000Z [xUnit.net 00:00:00.41]     Shop.Orders.Tests.PricingTests.Applies_volume_discount [FAIL]
2026-10-20T09:14:01.8030000Z [xUnit.net 00:00:00.43]     Shop.Orders.Tests.PaymentTests.Pays_with_card(card: "visa", amount: 12.5) [FAIL]
2026-10-20T09:14:01.8103000Z   Failed Shop.Orders.Tests.PricingTests.Applies_volume_discount [4 ms]
2026-10-20T09:14:01.8176000Z   Error Message:
2026-10-20T09:14:01.8249000Z    Assert.Equal() Failure: Values differ
2026-10-20T09:14:01.8322000Z Expected: 90.00
2026-10-20T09:14:01.8395000Z Actual:   100.00
2026-10-20T09:14:01.8468000Z   Stack Trace:
2026-10-20T09:14:01.8541000Z      at Shop.Orders.Tests.PricingTests.Applies_volume_discount() in /home/runner/work/shop-api/shop-api/tests/Shop.Orders.Tests/PricingTests.cs:line 48
2026-10-20T09:14:01.8614000Z    at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)
2026-10-20T09:14:01.8687000Z    at System.Reflection.MethodBaseInvoker.InvokeWithNoArgs(Object obj, BindingFlags invokeAttr)
2026-10-20T09:14:01.8760000Z   Failed Shop.Orders.Tests.PaymentTests.Pays_with_card(card: "visa", amount: 12.5) [2 ms]
2026-10-20T09:14:01.8833000Z   Error Message:
2026-10-20T09:14:01.8906000Z    System.InvalidOperationException : Gateway rejected the charge: card_declined
2026-10-20T09:14:01.8979000Z   Stack Trace:
2026-10-20T09:14:01.9052000Z      at Shop.Orders.Payments.CardGateway.Charge(Card card, Decimal amount) in /home/runner/work/shop-api/shop-api/src/Shop.Orders/Payments/CardGateway.cs:line 31
2026-10-20T09:14:01.9125000Z    at Shop.Orders.Tests.PaymentTests.Pays_with_card(String card, Decimal amount) in /home/runner/work/shop-api/shop-api/tests/Shop.Orders.Tests/PaymentTests.cs:line 22
2026-10-20T09:14:01.9198000Z    at System.RuntimeMethodHandle.InvokeMethod(Object target, Void** arguments, Signature sig, Boolean isConstructor)
2026-10-20T09:14:01.9271000Z    at System.Reflection.MethodBaseInvoker.InvokeDirectByRefWithFewArgs(Object obj, Span`1 copyOfArgs, BindingFlags invokeAttr)
2026-10-20T09:14:01.9344000Z\#u{20}
2026-10-20T09:14:01.9417000Z Failed!  - Failed:     2, Passed:    58, Skipped:     0, Total:    60, Duration: 812 ms - Shop.Orders.Tests.dll (net8.0)
2026-10-20T09:14:01.9490000Z ##[error]Process completed with exit code 1.
2026-10-20T09:14:01.9563000Z Post job cleanup.
2026-10-20T09:14:01.9636000Z [command]/usr/bin/git version
2026-10-20T09:14:01.9709000Z git version 2.47.0
2026-10-20T09:14:01.9782000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:01.9855000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.9928000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/shop-api/shop-api
2026-10-20T09:14:02.0001000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:02.0074000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:02.0147000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:02.0220000Z http.https://github.com/.extraheader
2026-10-20T09:14:02.0293000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:02.0366000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:02.0439000Z Cleaning up orphan processes

"""#

    /// `npm-e404.txt`
    static let npmE404 = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'actions/setup-node@v4' (SHA:39370e3970a6d050c480ffad4ff0ed4d3fdee5af)
2026-10-20T09:14:01.1606000Z Complete job name: build
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: acme/shop-web
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: acme/shop-web
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/shop-web/shop-web'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/shop-web/shop-web
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/shop-web/shop-web'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/shop-web/shop-web
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/shop-web/shop-web/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/acme/shop-web
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/acme/shop-web
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run actions/setup-node@v4
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   node-version: 18
2026-10-20T09:14:01.5256000Z   cache: npm
2026-10-20T09:14:01.5329000Z   always-auth: false
2026-10-20T09:14:01.5402000Z   check-latest: false
2026-10-20T09:14:01.5475000Z   token: ***
2026-10-20T09:14:01.5548000Z ##[endgroup]
2026-10-20T09:14:01.5621000Z Found in cache @ /opt/hostedtoolcache/node/18.20.4/x64
2026-10-20T09:14:01.5694000Z ##[group]Environment details
2026-10-20T09:14:01.5767000Z node: v18.20.4
2026-10-20T09:14:01.5840000Z npm: 10.7.0
2026-10-20T09:14:01.5913000Z yarn: 1.22.22
2026-10-20T09:14:01.5986000Z ##[endgroup]
2026-10-20T09:14:01.6059000Z [command]/opt/hostedtoolcache/node/18.20.4/x64/bin/npm config get cache
2026-10-20T09:14:01.6132000Z /home/runner/.npm
2026-10-20T09:14:01.6205000Z Cache hit for: node-cache-Linux-x64-npm-1f3a2b4c5d6e7f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f80
2026-10-20T09:14:01.6278000Z Received 41943040 of 61237465 (68.5%), 40.0 MBs/sec
2026-10-20T09:14:01.6351000Z Received 61237465 of 61237465 (100.0%), 41.2 MBs/sec
2026-10-20T09:14:01.6424000Z Cache Size: ~58 MB (61237465 B)
2026-10-20T09:14:01.6497000Z [command]/usr/bin/tar -xf /home/runner/work/_temp/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0/cache.tzst -P -C /home/runner/work/shop-web/shop-web --use-compress-program unzstd
2026-10-20T09:14:01.6570000Z Cache restored successfully
2026-10-20T09:14:01.6643000Z Cache restored from key: node-cache-Linux-x64-npm-1f3a2b4c5d6e7f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f80
2026-10-20T09:14:01.6716000Z ##[group]Run npm ci
2026-10-20T09:14:01.6789000Z \#u{1B}[36;1mnpm ci\#u{1B}[0m
2026-10-20T09:14:01.6862000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.6935000Z ##[endgroup]
2026-10-20T09:14:01.7008000Z npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it.
2026-10-20T09:14:01.7081000Z npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
2026-10-20T09:14:01.7154000Z npm ERR! code E404
2026-10-20T09:14:01.7227000Z npm ERR! 404 Not Found - GET https://registry.npmjs.org/@acme%2fwidgets - Not found
2026-10-20T09:14:01.7300000Z npm ERR! 404
2026-10-20T09:14:01.7373000Z npm ERR! 404  '@acme/widgets@^2.1.0' is not in this registry.
2026-10-20T09:14:01.7446000Z npm ERR! 404
2026-10-20T09:14:01.7519000Z npm ERR! 404 Note that you can also install from a
2026-10-20T09:14:01.7592000Z npm ERR! 404 tarball, folder, http url, or git url.
2026-10-20T09:14:01.7665000Z\#u{20}
2026-10-20T09:14:01.7738000Z npm ERR! A complete log of this run can be found in: /home/runner/.npm/_logs/2026-10-20T09_14_12_345Z-debug-0.log
2026-10-20T09:14:01.7811000Z ##[error]Process completed with exit code 1.
2026-10-20T09:14:01.7884000Z Post job cleanup.
2026-10-20T09:14:01.7957000Z [command]/usr/bin/git version
2026-10-20T09:14:01.8030000Z git version 2.47.0
2026-10-20T09:14:01.8103000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:01.8176000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.8249000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/shop-web/shop-web
2026-10-20T09:14:01.8322000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:01.8395000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:01.8468000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:01.8541000Z http.https://github.com/.extraheader
2026-10-20T09:14:01.8614000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:01.8687000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:01.8760000Z Cleaning up orphan processes

"""#

    /// `docker-build-failure.txt`
    static let dockerBuildFailure = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'docker/setup-buildx-action@v3' (SHA:c47758b77c9736f4b2ef4073d4d51994fabfe349)
2026-10-20T09:14:01.1606000Z Download action repository 'docker/build-push-action@v6' (SHA:4f58ea79222b3b9dc2c8bbdd6debcef730109a75)
2026-10-20T09:14:01.1679000Z Complete job name: image
2026-10-20T09:14:01.1752000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1825000Z with:
2026-10-20T09:14:01.1898000Z   repository: borght-dev/BorgDock
2026-10-20T09:14:01.1971000Z   token: ***
2026-10-20T09:14:01.2044000Z   ssh-strict: true
2026-10-20T09:14:01.2117000Z   ssh-user: git
2026-10-20T09:14:01.2190000Z   persist-credentials: true
2026-10-20T09:14:01.2263000Z   clean: true
2026-10-20T09:14:01.2336000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2409000Z   fetch-depth: 1
2026-10-20T09:14:01.2482000Z   fetch-tags: false
2026-10-20T09:14:01.2555000Z   show-progress: true
2026-10-20T09:14:01.2628000Z   lfs: false
2026-10-20T09:14:01.2701000Z   submodules: false
2026-10-20T09:14:01.2774000Z   set-safe-directory: true
2026-10-20T09:14:01.2847000Z ##[endgroup]
2026-10-20T09:14:01.2920000Z Syncing repository: borght-dev/BorgDock
2026-10-20T09:14:01.2993000Z ##[group]Getting Git version info
2026-10-20T09:14:01.3066000Z Working directory is '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3139000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3212000Z git version 2.47.0
2026-10-20T09:14:01.3285000Z ##[endgroup]
2026-10-20T09:14:01.3358000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3431000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3504000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3577000Z Deleting the contents of '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3650000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3723000Z [command]/usr/bin/git init /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3796000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3869000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3942000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.4015000Z Initialized empty Git repository in /home/runner/work/BorgDock/BorgDock/.git/
2026-10-20T09:14:01.4088000Z [command]/usr/bin/git remote add origin https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4161000Z ##[endgroup]
2026-10-20T09:14:01.4234000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4307000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4380000Z From https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4453000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4526000Z ##[endgroup]
2026-10-20T09:14:01.4599000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4672000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4745000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4818000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4891000Z ##[endgroup]
2026-10-20T09:14:01.4964000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.5037000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5110000Z ##[group]Run docker/setup-buildx-action@v3
2026-10-20T09:14:01.5183000Z with:
2026-10-20T09:14:01.5256000Z   driver: docker-container
2026-10-20T09:14:01.5329000Z   install: false
2026-10-20T09:14:01.5402000Z   use: true
2026-10-20T09:14:01.5475000Z   keep-state: false
2026-10-20T09:14:01.5548000Z   cache-binary: true
2026-10-20T09:14:01.5621000Z   cleanup: true
2026-10-20T09:14:01.5694000Z ##[endgroup]
2026-10-20T09:14:01.5767000Z ##[group]Docker info
2026-10-20T09:14:01.5840000Z [command]/usr/bin/docker version
2026-10-20T09:14:01.5913000Z Client: Docker Engine - Community
2026-10-20T09:14:01.5986000Z  Version:           27.3.1
2026-10-20T09:14:01.6059000Z  API version:       1.47
2026-10-20T09:14:01.6132000Z ##[endgroup]
2026-10-20T09:14:01.6205000Z ##[group]Creating a new builder instance
2026-10-20T09:14:01.6278000Z [command]/usr/bin/docker buildx create --name builder-6f1c0e2a --driver docker-container --buildkitd-flags --allow-insecure-entitlement security.insecure --allow-insecure-entitlement network.host --use
2026-10-20T09:14:01.6351000Z builder-6f1c0e2a
2026-10-20T09:14:01.6424000Z ##[endgroup]
2026-10-20T09:14:01.6497000Z ##[group]Run docker/build-push-action@v6
2026-10-20T09:14:01.6570000Z with:
2026-10-20T09:14:01.6643000Z   context: .
2026-10-20T09:14:01.6716000Z   push: false
2026-10-20T09:14:01.6789000Z   tags: ghcr.io/borght-dev/borgdock-site:pr-123
2026-10-20T09:14:01.6862000Z   load: false
2026-10-20T09:14:01.6935000Z   no-cache: false
2026-10-20T09:14:01.7008000Z   pull: false
2026-10-20T09:14:01.7081000Z   github-token: ***
2026-10-20T09:14:01.7154000Z ##[endgroup]
2026-10-20T09:14:01.7227000Z ##[group]GitHub Actions runtime token ACs
2026-10-20T09:14:01.7300000Z ac: [{"Scope":"refs/pull/123/merge","Permission":3},{"Scope":"refs/heads/master","Permission":1}]
2026-10-20T09:14:01.7373000Z ##[endgroup]
2026-10-20T09:14:01.7446000Z ##[group]Docker info
2026-10-20T09:14:01.7519000Z [command]/usr/bin/docker version
2026-10-20T09:14:01.7592000Z Client: Docker Engine - Community
2026-10-20T09:14:01.7665000Z  Version:           27.3.1
2026-10-20T09:14:01.7738000Z ##[endgroup]
2026-10-20T09:14:01.7811000Z [command]/usr/bin/docker buildx build --iidfile /home/runner/work/_temp/docker-actions-toolkit-Qx3e1f/build-iidfile-0a1b2c3d4e.txt --tag ghcr.io/borght-dev/borgdock-site:pr-123 --metadata-file /home/runner/work/_temp/docker-actions-toolkit-Qx3e1f/build-metadata-0a1b2c3d4e.json .
2026-10-20T09:14:01.7884000Z #0 building with "builder-6f1c0e2a" instance using docker-container driver
2026-10-20T09:14:01.7957000Z\#u{20}
2026-10-20T09:14:01.8030000Z #1 [internal] load build definition from Dockerfile
2026-10-20T09:14:01.8103000Z #1 transferring dockerfile: 512B done
2026-10-20T09:14:01.8176000Z #1 DONE 0.0s
2026-10-20T09:14:01.8249000Z\#u{20}
2026-10-20T09:14:01.8322000Z #2 [internal] load metadata for docker.io/oven/bun:1.1
2026-10-20T09:14:01.8395000Z #2 DONE 0.8s
2026-10-20T09:14:01.8468000Z\#u{20}
2026-10-20T09:14:01.8541000Z #3 [internal] load .dockerignore
2026-10-20T09:14:01.8614000Z #3 transferring context: 92B done
2026-10-20T09:14:01.8687000Z #3 DONE 0.0s
2026-10-20T09:14:01.8760000Z\#u{20}
2026-10-20T09:14:01.8833000Z #4 [build 1/7] FROM docker.io/oven/bun:1.1@sha256:5f1f9a2e6c3b4d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e
2026-10-20T09:14:01.8906000Z #4 resolve docker.io/oven/bun:1.1@sha256:5f1f9a2e6c3b4d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e done
2026-10-20T09:14:01.8979000Z #4 DONE 2.1s
2026-10-20T09:14:01.9052000Z\#u{20}
2026-10-20T09:14:01.9125000Z #5 [internal] load build context
2026-10-20T09:14:01.9198000Z #5 transferring context: 1.21MB 0.1s done
2026-10-20T09:14:01.9271000Z #5 DONE 0.1s
2026-10-20T09:14:01.9344000Z\#u{20}
2026-10-20T09:14:01.9417000Z #6 [build 2/7] WORKDIR /app
2026-10-20T09:14:01.9490000Z #6 DONE 0.2s
2026-10-20T09:14:01.9563000Z\#u{20}
2026-10-20T09:14:01.9636000Z #7 [build 3/7] COPY package.json bun.lock ./
2026-10-20T09:14:01.9709000Z #7 DONE 0.0s
2026-10-20T09:14:01.9782000Z\#u{20}
2026-10-20T09:14:01.9855000Z #8 [build 4/7] RUN bun install --frozen-lockfile
2026-10-20T09:14:01.9928000Z #8 0.041 bun install v1.1.38 (bf2f153f)
2026-10-20T09:14:02.0001000Z #8 0.212 error: lockfile had changes, but lockfile is frozen
2026-10-20T09:14:02.0074000Z #8 0.212 note: try re-running without --frozen-lockfile and commit the updated lockfile
2026-10-20T09:14:02.0147000Z #8 ERROR: process "/bin/sh -c bun install --frozen-lockfile" did not complete successfully: exit code: 1
2026-10-20T09:14:02.0220000Z ------
2026-10-20T09:14:02.0293000Z  > [build 4/7] RUN bun install --frozen-lockfile:
2026-10-20T09:14:02.0366000Z 0.041 bun install v1.1.38 (bf2f153f)
2026-10-20T09:14:02.0439000Z 0.212 error: lockfile had changes, but lockfile is frozen
2026-10-20T09:14:02.0512000Z 0.212 note: try re-running without --frozen-lockfile and commit the updated lockfile
2026-10-20T09:14:02.0585000Z ------
2026-10-20T09:14:02.0658000Z Dockerfile:9
2026-10-20T09:14:02.0731000Z --------------------
2026-10-20T09:14:02.0804000Z    7 |     COPY package.json bun.lock ./
2026-10-20T09:14:02.0877000Z    8 |
2026-10-20T09:14:02.0950000Z    9 | >>> RUN bun install --frozen-lockfile
2026-10-20T09:14:02.1023000Z   10 |
2026-10-20T09:14:02.1096000Z   11 |     COPY . .
2026-10-20T09:14:02.1169000Z --------------------
2026-10-20T09:14:02.1242000Z ERROR: failed to solve: process "/bin/sh -c bun install --frozen-lockfile" did not complete successfully: exit code: 1
2026-10-20T09:14:02.1315000Z ##[error]buildx failed with: ERROR: failed to solve: process "/bin/sh -c bun install --frozen-lockfile" did not complete successfully: exit code: 1
2026-10-20T09:14:02.1388000Z Post job cleanup.
2026-10-20T09:14:02.1461000Z ##[group]Removing builder
2026-10-20T09:14:02.1534000Z [command]/usr/bin/docker buildx rm builder-6f1c0e2a
2026-10-20T09:14:02.1607000Z builder-6f1c0e2a removed
2026-10-20T09:14:02.1680000Z ##[endgroup]
2026-10-20T09:14:02.1753000Z ##[group]Cleaning up certificates
2026-10-20T09:14:02.1826000Z ##[endgroup]
2026-10-20T09:14:02.1899000Z Post job cleanup.
2026-10-20T09:14:02.1972000Z [command]/usr/bin/git version
2026-10-20T09:14:02.2045000Z git version 2.47.0
2026-10-20T09:14:02.2118000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:02.2191000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:02.2264000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:02.2337000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:02.2410000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:02.2483000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:02.2556000Z http.https://github.com/.extraheader
2026-10-20T09:14:02.2629000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:02.2702000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:02.2775000Z Cleaning up orphan processes

"""#

    /// `cargo-test-panic.txt`
    static let cargoTestPanic = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'dtolnay/rust-toolchain@stable' (SHA:315e265cd78dad1e1dcf3a5074f6d6c47029d5aa)
2026-10-20T09:14:01.1606000Z Complete job name: rust
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: borght-dev/BorgDock
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: borght-dev/BorgDock
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/BorgDock/BorgDock'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/BorgDock/BorgDock/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/borght-dev/BorgDock
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run dtolnay/rust-toolchain@stable
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   toolchain: stable
2026-10-20T09:14:01.5256000Z ##[endgroup]
2026-10-20T09:14:01.5329000Z ##[group]Run : parse toolchain version
2026-10-20T09:14:01.5402000Z \#u{1B}[36;1m: parse toolchain version\#u{1B}[0m
2026-10-20T09:14:01.5475000Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}
2026-10-20T09:14:01.5548000Z ##[endgroup]
2026-10-20T09:14:01.5621000Z info: syncing channel updates for 'stable-x86_64-unknown-linux-gnu'
2026-10-20T09:14:01.5694000Z info: latest update on 2026-10-16, rust version 1.94.0 (4a4ef493e 2026-03-02)
2026-10-20T09:14:01.5767000Z ##[group]Run cargo test --lib
2026-10-20T09:14:01.5840000Z \#u{1B}[36;1mcargo test --lib\#u{1B}[0m
2026-10-20T09:14:01.5913000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5986000Z env:
2026-10-20T09:14:01.6059000Z   CARGO_TERM_COLOR: always
2026-10-20T09:14:01.6132000Z ##[endgroup]
2026-10-20T09:14:01.6205000Z \#u{1B}[1m\#u{1B}[92m   Compiling\#u{1B}[0m borgdock v4.6.0 (/home/runner/work/BorgDock/BorgDock/src/BorgDock.Tauri/src-tauri)
2026-10-20T09:14:01.6278000Z \#u{1B}[1m\#u{1B}[93mwarning\#u{1B}[0m\#u{1B}[1m: unused variable: `stale`\#u{1B}[0m
2026-10-20T09:14:01.6351000Z \#u{1B}[1m\#u{1B}[94m   --> \#u{1B}[0msrc/cache/mod.rs:212:13
2026-10-20T09:14:01.6424000Z \#u{1B}[1m\#u{1B}[94m    |\#u{1B}[0m
2026-10-20T09:14:01.6497000Z \#u{1B}[1m\#u{1B}[94m212\#u{1B}[0m \#u{1B}[1m\#u{1B}[94m|\#u{1B}[0m         let stale = entry.is_stale();
2026-10-20T09:14:01.6570000Z \#u{1B}[1m\#u{1B}[94m    |\#u{1B}[0m             \#u{1B}[1m\#u{1B}[93m^^^^^\#u{1B}[0m \#u{1B}[1m\#u{1B}[93mhelp: if this is intentional, prefix it with an underscore: `_stale`\#u{1B}[0m
2026-10-20T09:14:01.6643000Z\#u{20}
2026-10-20T09:14:01.6716000Z \#u{1B}[1m\#u{1B}[92m    Finished\#u{1B}[0m `test` profile [unoptimized + debuginfo] target(s) in 1m 12s
2026-10-20T09:14:01.6789000Z \#u{1B}[1m\#u{1B}[92m     Running\#u{1B}[0m unittests src/lib.rs (target/debug/deps/borgdock_lib-5f0c1e2d3a4b6c7d)
2026-10-20T09:14:01.6862000Z\#u{20}
2026-10-20T09:14:01.6935000Z running 214 tests
2026-10-20T09:14:01.7008000Z test agents::tests::parses_agent_list ... ok
2026-10-20T09:14:01.7081000Z test ci_failures::extract::tests::caps_signals ... \#u{1B}[31mFAILED\#u{1B}[0m
2026-10-20T09:14:01.7154000Z test settings::tests::loads_defaults ... \#u{1B}[31mFAILED\#u{1B}[0m
2026-10-20T09:14:01.7227000Z test t3::references::tests::reads_ids ... \#u{1B}[32mok\#u{1B}[0m
2026-10-20T09:14:01.7300000Z\#u{20}
2026-10-20T09:14:01.7373000Z failures:
2026-10-20T09:14:01.7446000Z\#u{20}
2026-10-20T09:14:01.7519000Z ---- ci_failures::extract::tests::caps_signals stdout ----
2026-10-20T09:14:01.7592000Z\#u{20}
2026-10-20T09:14:01.7665000Z thread 'ci_failures::extract::tests::caps_signals' (18342) panicked at src/ci_failures/extract/tests.rs:118:9:
2026-10-20T09:14:01.7738000Z assertion `left == right` failed: one summary first
2026-10-20T09:14:01.7811000Z   left: 21
2026-10-20T09:14:01.7884000Z  right: 20
2026-10-20T09:14:01.7957000Z note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
2026-10-20T09:14:01.8030000Z\#u{20}
2026-10-20T09:14:01.8103000Z ---- settings::tests::loads_defaults stdout ----
2026-10-20T09:14:01.8176000Z\#u{20}
2026-10-20T09:14:01.8249000Z thread 'settings::tests::loads_defaults' (18345) panicked at src/settings/mod.rs:301:52:
2026-10-20T09:14:01.8322000Z called `Result::unwrap()` on an `Err` value: Os { code: 2, kind: NotFound, message: "No such file or directory" }
2026-10-20T09:14:01.8395000Z stack backtrace:
2026-10-20T09:14:01.8468000Z    0: rust_begin_unwind
2026-10-20T09:14:01.8541000Z              at /rustc/4a4ef493e3b1e6b7b2f7a8f1c7b1e7c3d3b0a1c2/library/std/src/panicking.rs:665:5
2026-10-20T09:14:01.8614000Z    1: core::panicking::panic_fmt
2026-10-20T09:14:01.8687000Z              at /rustc/4a4ef493e3b1e6b7b2f7a8f1c7b1e7c3d3b0a1c2/library/core/src/panicking.rs:74:14
2026-10-20T09:14:01.8760000Z    2: core::result::unwrap_failed
2026-10-20T09:14:01.8833000Z              at /rustc/4a4ef493e3b1e6b7b2f7a8f1c7b1e7c3d3b0a1c2/library/core/src/result.rs:1700:5
2026-10-20T09:14:01.8906000Z    3: borgdock_lib::settings::load
2026-10-20T09:14:01.8979000Z              at ./src/settings/mod.rs:301:52
2026-10-20T09:14:01.9052000Z    4: borgdock_lib::settings::tests::loads_defaults
2026-10-20T09:14:01.9125000Z              at ./src/settings/mod.rs:420:20
2026-10-20T09:14:01.9198000Z    5: core::ops::function::FnOnce::call_once
2026-10-20T09:14:01.9271000Z              at /rustc/4a4ef493e3b1e6b7b2f7a8f1c7b1e7c3d3b0a1c2/library/core/src/ops/function.rs:250:5
2026-10-20T09:14:01.9344000Z note: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.
2026-10-20T09:14:01.9417000Z\#u{20}
2026-10-20T09:14:01.9490000Z\#u{20}
2026-10-20T09:14:01.9563000Z failures:
2026-10-20T09:14:01.9636000Z     ci_failures::extract::tests::caps_signals
2026-10-20T09:14:01.9709000Z     settings::tests::loads_defaults
2026-10-20T09:14:01.9782000Z\#u{20}
2026-10-20T09:14:01.9855000Z test result: \#u{1B}[31mFAILED\#u{1B}[0m. 212 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.41s
2026-10-20T09:14:01.9928000Z\#u{20}
2026-10-20T09:14:02.0001000Z \#u{1B}[1m\#u{1B}[91merror\#u{1B}[0m\#u{1B}[1m:\#u{1B}[0m test failed, to rerun pass `--lib`
2026-10-20T09:14:02.0074000Z ##[error]Process completed with exit code 101.
2026-10-20T09:14:02.0147000Z Post job cleanup.
2026-10-20T09:14:02.0220000Z [command]/usr/bin/git version
2026-10-20T09:14:02.0293000Z git version 2.47.0
2026-10-20T09:14:02.0366000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:02.0439000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:02.0512000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/BorgDock/BorgDock
2026-10-20T09:14:02.0585000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:02.0658000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:02.0731000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:02.0804000Z http.https://github.com/.extraheader
2026-10-20T09:14:02.0877000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:02.0950000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:02.1023000Z Cleaning up orphan processes

"""#

    /// `network-generic.txt`
    static let networkGeneric = #"""
2026-10-20T09:14:01.0000000Z Current runner version: '2.320.0'
2026-10-20T09:14:01.0073000Z ##[group]Operating System
2026-10-20T09:14:01.0146000Z Ubuntu
2026-10-20T09:14:01.0219000Z 24.04.1
2026-10-20T09:14:01.0292000Z LTS
2026-10-20T09:14:01.0365000Z ##[endgroup]
2026-10-20T09:14:01.0438000Z ##[group]Runner Image
2026-10-20T09:14:01.0511000Z Image: ubuntu-24.04
2026-10-20T09:14:01.0584000Z Version: 20241020.1.0
2026-10-20T09:14:01.0657000Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20241020.1/images/ubuntu/Ubuntu2404-Readme.md
2026-10-20T09:14:01.0730000Z ##[endgroup]
2026-10-20T09:14:01.0803000Z ##[group]GITHUB_TOKEN Permissions
2026-10-20T09:14:01.0876000Z Contents: read
2026-10-20T09:14:01.0949000Z Metadata: read
2026-10-20T09:14:01.1022000Z PullRequests: read
2026-10-20T09:14:01.1095000Z ##[endgroup]
2026-10-20T09:14:01.1168000Z Secret source: Actions
2026-10-20T09:14:01.1241000Z Prepare workflow directory
2026-10-20T09:14:01.1314000Z Prepare all required actions
2026-10-20T09:14:01.1387000Z Getting action download info
2026-10-20T09:14:01.1460000Z Download action repository 'actions/checkout@v4' (SHA:11bd71901bbe5b1630ceea73d27597364c9af683)
2026-10-20T09:14:01.1533000Z Download action repository 'actions/setup-node@v4' (SHA:39370e3970a6d050c480ffad4ff0ed4d3fdee5af)
2026-10-20T09:14:01.1606000Z Complete job name: metadata
2026-10-20T09:14:01.1679000Z ##[group]Run actions/checkout@v4
2026-10-20T09:14:01.1752000Z with:
2026-10-20T09:14:01.1825000Z   repository: acme/shop-web
2026-10-20T09:14:01.1898000Z   token: ***
2026-10-20T09:14:01.1971000Z   ssh-strict: true
2026-10-20T09:14:01.2044000Z   ssh-user: git
2026-10-20T09:14:01.2117000Z   persist-credentials: true
2026-10-20T09:14:01.2190000Z   clean: true
2026-10-20T09:14:01.2263000Z   sparse-checkout-cone-mode: true
2026-10-20T09:14:01.2336000Z   fetch-depth: 1
2026-10-20T09:14:01.2409000Z   fetch-tags: false
2026-10-20T09:14:01.2482000Z   show-progress: true
2026-10-20T09:14:01.2555000Z   lfs: false
2026-10-20T09:14:01.2628000Z   submodules: false
2026-10-20T09:14:01.2701000Z   set-safe-directory: true
2026-10-20T09:14:01.2774000Z ##[endgroup]
2026-10-20T09:14:01.2847000Z Syncing repository: acme/shop-web
2026-10-20T09:14:01.2920000Z ##[group]Getting Git version info
2026-10-20T09:14:01.2993000Z Working directory is '/home/runner/work/shop-web/shop-web'
2026-10-20T09:14:01.3066000Z [command]/usr/bin/git version
2026-10-20T09:14:01.3139000Z git version 2.47.0
2026-10-20T09:14:01.3212000Z ##[endgroup]
2026-10-20T09:14:01.3285000Z Temporarily overriding HOME='/home/runner/work/_temp/9c1d4f0e-5b8a-4f7e-a3c2-6d1e2f3a4b5c' before making global git config changes
2026-10-20T09:14:01.3358000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.3431000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/shop-web/shop-web
2026-10-20T09:14:01.3504000Z Deleting the contents of '/home/runner/work/shop-web/shop-web'
2026-10-20T09:14:01.3577000Z ##[group]Initializing the repository
2026-10-20T09:14:01.3650000Z [command]/usr/bin/git init /home/runner/work/shop-web/shop-web
2026-10-20T09:14:01.3723000Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-10-20T09:14:01.3796000Z hint: is subject to change. To configure the initial branch name to use in all
2026-10-20T09:14:01.3869000Z hint: of your new repositories, which will suppress this warning, call:
2026-10-20T09:14:01.3942000Z Initialized empty Git repository in /home/runner/work/shop-web/shop-web/.git/
2026-10-20T09:14:01.4015000Z [command]/usr/bin/git remote add origin https://github.com/acme/shop-web
2026-10-20T09:14:01.4088000Z ##[endgroup]
2026-10-20T09:14:01.4161000Z ##[group]Fetching the repository
2026-10-20T09:14:01.4234000Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192:refs/remotes/pull/123/merge
2026-10-20T09:14:01.4307000Z From https://github.com/acme/shop-web
2026-10-20T09:14:01.4380000Z  * [new ref]         3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192 -> pull/123/merge
2026-10-20T09:14:01.4453000Z ##[endgroup]
2026-10-20T09:14:01.4526000Z ##[group]Checking out the ref
2026-10-20T09:14:01.4599000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/123/merge
2026-10-20T09:14:01.4672000Z Note: switching to 'refs/remotes/pull/123/merge'.
2026-10-20T09:14:01.4745000Z HEAD is now at 3f0964d Merge 72da1978 into 4601d631
2026-10-20T09:14:01.4818000Z ##[endgroup]
2026-10-20T09:14:01.4891000Z [command]/usr/bin/git log -1 --format=%H
2026-10-20T09:14:01.4964000Z 3f0964d2a1b4c5d6e7f8091a2b3c4d5e6f708192
2026-10-20T09:14:01.5037000Z ##[group]Run actions/setup-node@v4
2026-10-20T09:14:01.5110000Z with:
2026-10-20T09:14:01.5183000Z   node-version: 20
2026-10-20T09:14:01.5256000Z   cache: npm
2026-10-20T09:14:01.5329000Z ##[endgroup]
2026-10-20T09:14:01.5402000Z Found in cache @ /opt/hostedtoolcache/node/20.18.0/x64
2026-10-20T09:14:01.5475000Z ##[group]Environment details
2026-10-20T09:14:01.5548000Z node: v20.18.0
2026-10-20T09:14:01.5621000Z npm: 10.8.2
2026-10-20T09:14:01.5694000Z ##[endgroup]
2026-10-20T09:14:01.5767000Z ##[group]Run node scripts/fetch-registry-metadata.mjs
2026-10-20T09:14:01.5840000Z \#u{1B}[36;1mnode scripts/fetch-registry-metadata.mjs\#u{1B}[0m
2026-10-20T09:14:01.5913000Z shell: /usr/bin/bash -e {0}
2026-10-20T09:14:01.5986000Z ##[endgroup]
2026-10-20T09:14:01.6059000Z Fetching package metadata for 214 packages…
2026-10-20T09:14:01.6132000Z Error: getaddrinfo ENOTFOUND registry.npmjs.org
2026-10-20T09:14:01.6205000Z     at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:120:26) {
2026-10-20T09:14:01.6278000Z   errno: -3008,
2026-10-20T09:14:01.6351000Z   code: 'ENOTFOUND',
2026-10-20T09:14:01.6424000Z   syscall: 'getaddrinfo',
2026-10-20T09:14:01.6497000Z   hostname: 'registry.npmjs.org'
2026-10-20T09:14:01.6570000Z }
2026-10-20T09:14:01.6643000Z ##[error]Process completed with exit code 1.
2026-10-20T09:14:01.6716000Z Post job cleanup.
2026-10-20T09:14:01.6789000Z [command]/usr/bin/tar --posix -cf cache.tzst --exclude cache.tzst -P -C /home/runner/work/shop-web/shop-web --files-from manifest.txt --use-compress-program zstdmt
2026-10-20T09:14:01.6862000Z Failed to save: Unable to reserve cache with key node-cache-Linux-x64-npm-1f3a2b4c5d6e, another job may be creating this cache.
2026-10-20T09:14:01.6935000Z Post job cleanup.
2026-10-20T09:14:01.7008000Z [command]/usr/bin/git version
2026-10-20T09:14:01.7081000Z git version 2.47.0
2026-10-20T09:14:01.7154000Z Temporarily overriding HOME='/home/runner/work/_temp/2a7e5f1c-0d3b-4c6a-8e9f-1b2c3d4e5f60' before making global git config changes
2026-10-20T09:14:01.7227000Z Adding repository directory to the temporary git global config as a safe directory
2026-10-20T09:14:01.7300000Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/shop-web/shop-web
2026-10-20T09:14:01.7373000Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-20T09:14:01.7446000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-20T09:14:01.7519000Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-20T09:14:01.7592000Z http.https://github.com/.extraheader
2026-10-20T09:14:01.7665000Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-20T09:14:01.7738000Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-20T09:14:01.7811000Z Cleaning up orphan processes

"""#
}

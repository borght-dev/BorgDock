# Quick review experience

Implemented on `design/quick-review-experience`, branched from freshly fetched `origin/master` at `5e821945120dd52c9ad5b3099e042d9e2082fa05`.

## App behavior

- A wide review workspace shows the full PR description, followed by one file at a time. The header and compact 28px action buttons stay fixed while the content scrolls. Next keeps the same position across files and comments; each file starts at the top.
- Source files are grouped by directory, then documentation, generated files and lockfiles, and tests. Test detection is case-insensitive and includes `*.Tests/`, `.test.`, `.spec.`, `test/`, `tests/`, and `__tests__/`. Every file remains accessible.
- Previous and Next navigate files without marking them reviewed. Mark reviewed & next records progress. Mark reviewed & finish opens a separate final decision; it does not approve automatically.
- The + beside a diff line adds an editable draft attached to the correct old or new line. Finish review collects drafts and offers Comment, Request changes, or Approve with an optional overall message. Required text and unfinished drafts are validated before submission.
- Drafts and progress persist on this device by GitHub account, repository, and PR. Review later and closing the overlay preserve them. Storage failures display a session-only warning.
- File loading verifies a consistent head and base commit. Submission checks them again, then sends one GitHub review with all comments tied to the viewed head. Failed submissions retain drafts and stay on the PR. Reload clears reviewed status only for changed files and flags affected comments for explicit reattachment.
- N and P navigate; V toggles reviewed. Shortcuts are inactive in editable fields and while submitting. Approval always requires the final submit action.
- Existing shared Markdown, diff, button, and review decision components are reused. Large interactive diffs expand in batches of 500 lines. Binary, renamed, and missing-patch states use the shared diff renderer and GitHub fallback.

## Preview

The real component is available in Storybook under **Focus / Quick Review**, with default, large-diff, and load-failure stories. Run `bun run storybook` from `src/BorgDock.Tauri` (or choose an unused port when another server is running). `implemented.png` shows the actual React component with compact controls.

`preview.html` remains the standalone design prototype; `quick-review.html` is its editable source. Its PR title is inspired by the supplied screenshot, while its description, code, author, checks, and file list are illustrative. It has no GitHub connection and its drafts last only while open. The other screenshots show this original prototype.

## Validation

- Production frontend build and TypeScript check passed.
- Full frontend suite: 239 test files, 2,681 tests passed. An additional regression test verifies errors do not carry into the next PR or session summary.
- Two Playwright tests exercise the actual app with intercepted GitHub responses: fixed Next coordinates across description, short/long files and inline comments; compact controls at desktop, 736px and 360px widths; draft recovery after reload; and the exact review submission payload at the viewed commit.
- React Doctor: 89/100, with five component size/complexity warnings; no reported correctness errors.
- Validation is local. A packaged native build and a review posted to live GitHub were not exercised.

## Possible follow-ups

The current grouping is deterministic directory grouping. A future change could group related contracts, implementations and consumers across directories, with explicitly labeled generated explanations inspired by [CodeRabbit Change Stack](https://www.coderabbit.ai/blog/introducing-change-stack-the-first-ai-native-code-review-interface). Split diffs and expansion of unchanged context could also be added to Quick Review.
## Comments in Quick Review

Open **Comments** below **PR description** to skim the existing conversation. It includes top-level PR comments, review messages, and inline comments, newest first. Filter by **Everyone**, **PR author**, or **Other commenters**. Author matching is case-insensitive; bots remain visible in the matching category.

Screenshots render inside comments and open full-size in the browser when clicked. **View on GitHub** opens the original comment. GitHub-hosted attachment images are allowed by the desktop image policy. Quick Review requests rendered bodies using the documented full-response media types for [issue comments](https://docs.github.com/en/rest/issues/comments) and [review comments](https://docs.github.com/en/rest/pulls/comments), so it can use GitHub's resolved image URLs. These responses bypass the persisted ETag cache. Refresh comments to reload the conversation and attachment URLs; unavailable images offer a browser fallback.

The conversation loads on first opening and fetches every page. Partial failures are shown with a retry action. Switching back preserves the selected file, its scroll position, and local drafts. The review action buttons stay fixed. Restart `bun run tauri dev` to pick up the desktop image-policy change.

Comments validation: 119 focused component, discussion, and GitHub service tests passed after the reboot. All three Quick Review browser tests passed, including rendering an image from a resolved private-attachment URL under the desktop image policy. `comments-implemented.png` and `comments-mobile.png` show the actual app with sample comments and an existing fixture image, not live agent evidence.

## PR detail file navigation

The Files tab now uses a wider navigator with collapsible source-folder groups, followed by documentation, generated files, and tests. Filenames and paths wrap instead of being truncated; change statistics sit below each name. Search includes folder paths and reveals matches inside collapsed groups. The diff pane and its keyboard navigation follow the same file order. Flat list view remains available.

Open PRs that cannot currently merge show **Review** in the action bar. It starts Quick Review with only that PR, including in a separate PR detail window. Merge-ready PRs retain their enabled **Merge** action. `pr-detail-files.png` shows the actual component with sample changes.

Validation for the detail changes: production frontend build passed; 87 focused component tests passed across the initial run and corrected navigator rerun; both Playwright detail tests passed. Browser checks cover grouping, wrapping, filter recovery, matching diff order, jumping to a file, opening the selected PR in Quick Review, and keeping Merge enabled for ready PRs. React Doctor completed a partial scan: its maintainability checks timed out and it flagged the existing status-filter lookup against an array of at most three statuses. No live GitHub mutation or packaged native build was exercised.

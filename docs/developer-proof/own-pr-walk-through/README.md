Quick Review walks through your own PRs.

Your own open PR gets "Walk through" in the PR detail bar and its context menu (R on Focus works too). The overlay reads "Walk-through": same card, guide, risk, file tree and diff, with Done instead of Approve and Comment instead of Request changes. Done records the PR as walked through and posts nothing; Comment posts your drafts as a plain comment.

Validation: Storybook stories `Focus/Quick review` `OwnPrWalkThrough` and `OwnPrAllFilesRead` and `PR Detail/PrDetailView` `FailingOverview` captured and inspected (dark and light). Unit suite 4917 passed, including new walk-through tests; tsc and Biome passed; e2e `pr-detail-inline` and `quick-review-actions` passed.

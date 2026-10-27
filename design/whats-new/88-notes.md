# Release notes for #88 (Activity), for the next release

Paste the bullets into the release's entry of `/CHANGELOG.md` and the hero entries into
`design/whats-new/<version>.heroes.json`. Images go to `docs/whats-new/<version>/<slug>.png`;
replace `<version>` below.

## CHANGELOG bullets

### New Features

- **Catch up on what changed while you were away** — The new Activity section, last in the rail (key 7), keeps every change that matters until you read it: an agent asking a question or finishing its turn, a review on your pull request, checks failing or passing again, a shared CI failure growing, a workstream unblocked, a comment on your work item. Each entry says what happened in one sentence, where and when, and offers the one action that fits, such as answering the question, approving the plan, fixing the checks or opening the run log. Entries survive a restart, and a quick J/K, Enter, E or # works through them. ![The Activity section with questions, plans, reviews and a deploy](whats-new/<version>/activity.png)
- **Answer without leaving the list** — Select a question and its options appear inline; pick one and the agent carries on. BorgDock checks every action again right before it runs, so an answer you already gave on your phone, or new commits on a pull request, turn the button into Open instead of doing the wrong thing. ![An agent's question answered inline in Activity](whats-new/<version>/activity-answer.png)
- **Know where your merged work is** — Follow a repository's deployments in Settings → Repositories, and Activity tells you when your merged pull request reaches dev, acceptance or production, or when a deploy that carried it failed, with the run log one click away. ![A merged pull request reaching acceptance](whats-new/<version>/activity-deploys.png)
- **Updates on your phone** — Connect Home Assistant in Settings → Notifications, and updates that need you go to your phone once you have been away from the laptop for a while. Handle one on the laptop or in T3 and it disappears from your phone too. ![The Phone settings with Home Assistant](whats-new/<version>/activity-phone.png)

### Improvements

- **Since you last checked** — Focus opens with what changed since you last looked at Activity, and the five newest updates that need you, each with its action. The rail, the tray and the taskbar icon count the updates that need you. ![The Since you last checked card on Focus](whats-new/<version>/since-last-checked.png)
- **One kind of popup, and fewer of them** — Every popup now comes from an Activity entry. A restart never repeats one, time away becomes one summary instead of twenty popups, and a turn you watched finish in T3 doesn't pop up at all. Choose per kind of update what pops up and what goes to your phone. ![Per-update popup and phone choices in Settings](whats-new/<version>/activity-settings.png)

### Bug Fixes

- Notification settings that were never read (tray balloon, system toast, email digest) are gone; the sound switch now silences merge sounds.

## Heroes (`design/whats-new/<version>.heroes.json` entries)

```json
[
  { "slug": "activity", "storyId": "activity-activity--unread", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "activity-answer", "storyId": "activity-activity--expanded", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "activity-deploys", "storyId": "activity-activity--all", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "activity-phone", "storyId": "settings-notificationsection--phone-push", "viewport": { "width": 1000, "height": 2200 }, "delay": 1000, "selector": "#field-phone-push" },
  { "slug": "since-last-checked", "storyId": "activity-activity--focus-card", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "activity-settings", "storyId": "settings-notificationsection--phone-push", "viewport": { "width": 1000, "height": 1100 }, "delay": 1000, "selector": "#field-activity-categories" }
]
```

Other stories, if a different picture fits better: `activity-activity--needs-you`,
`--two-thousand`, `--long-titles`, `--commit-error`, and `flyout-flyoutapp--glance-with-activity`
for the tray.

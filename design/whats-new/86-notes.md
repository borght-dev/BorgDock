# Release notes for #86 (Workstreams), for the joint 4.7.0 release

Paste the bullets into the 4.7.0 entry of `/CHANGELOG.md` and the hero entries into
`design/whats-new/4.7.0.heroes.json`. Images go to `docs/whats-new/4.7.0/<slug>.png`.

## CHANGELOG bullets

### New Features

- **Workstreams** — Some goals take more than one work item, a couple of agent threads and a handful of pull requests. A workstream keeps them together under one goal, with the outcomes that goal needs and a next action you set yourself. BorgDock checks each outcome against the real records: when the pull request merges or the item reaches Done, the outcome turns green, and if the item is reopened later you hear about it. Find it in the new Workstreams section, right after Dispatch. ![A workstream with its goal, outcomes and next action](whats-new/4.7.0/workstreams-overview.png)
- **See how the pieces fit** — The map shows which pull request blocks which outcome, which one replaced an earlier attempt, and the decisions still open between two approaches. Record the decision with its reason, and the option you didn't take stays visible, greyed out, so nobody picks it up again by accident. ![The relation map of a workstream](whats-new/4.7.0/workstreams-map.png)
- **Let an agent review the workstream** — Review with agent sends everything the workstream links to a T3 thread. The agent reads the items, pull requests and conversations and comes back with proposals: a missing pull request, a duplicate to drop, the next action. You accept or reject each one, and nothing changes without you. Work next action starts a thread on the next action itself. ![An agent's proposals for a workstream](whats-new/4.7.0/workstreams-review.png)
- **Workstreams on every machine** — Point Settings → Workstreams at a folder that OneDrive, Dropbox or iCloud syncs, and your laptop and desktop share the same workstreams. When both changed the same thing, BorgDock shows both versions and lets you pick, instead of overwriting one. ![The sync folder setting](whats-new/4.7.0/workstreams-sync.png)

### Improvements

- **Workstreams wherever you look** — Pull requests and Dispatch rows show which workstream they belong to, and the details of a pull request or work item have Add to workstream. The Focus tab shows the workstreams that need you. ![Dispatch rows with their workstream chips](whats-new/4.7.0/workstreams-chips.png)

### Bug Fixes

- A work item deleted between two reads no longer stops the rest of your work items from loading.

## Heroes (`design/whats-new/4.7.0.heroes.json` entries)

```json
[
  { "slug": "workstreams-overview", "storyId": "workstreams-workstreams--overview", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "workstreams-map", "storyId": "workstreams-workstreams--relation-map", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "workstreams-review", "storyId": "workstreams-workstreams--review-with-agent", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 },
  { "slug": "workstreams-sync", "storyId": "settings-workstreamssection--sync-folder", "viewport": { "width": 1000, "height": 700 }, "delay": 1000 },
  { "slug": "workstreams-chips", "storyId": "workstreams-workstreams--dispatch-chips", "viewport": { "width": 1280, "height": 800 }, "delay": 1500 }
]
```

Other stories, if a different picture fits better: `workstreams-workstreams--list`,
`--members`, `--focus-card`, `--add-records`, `--conflict`, `--ready`.

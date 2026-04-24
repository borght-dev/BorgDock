# BorgDock UI Streamline

_Started 2026-04-23 14:54 UTC_

---

## User

I want to improve my application BorgDock. Please help me streamline the UI so it looks and feels like one streamlined application.

## Assistant

I'll help you streamline BorgDock into one cohesive application. Let me start by exploring your design system, styling guide, and existing code to understand the current state.

_[tool: read_file]_

_[tool: read_file]_

I'll read the remaining context files and look at the screenshots to understand the current state of each surface.

_[tool: read_file]_

_[tool: read_file]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: snip]_

I have enough context now. Let me briefly look at the src folder, then ask clarifying questions before diving in.

_[tool: local_ls]_

I have enough context. Let me ask focused questions before designing.

_[tool: questions_v2]_

## User

Questions timed out; go with defaults

## Assistant

_[tool: snip]_

_[tool: update_todos]_

I'll proceed with sensible defaults: unify **all four surfaces** into one cohesive system, with a **confident refinement** — same violet/purple DNA but resolving every inconsistency. Present as a `design_canvas` so you can compare them side-by-side, with Tweaks for Light/Dark + density + accent.

**My design system choices (stated out loud):**
- **One chrome vocabulary**: thin accent-tinted titlebar shared across flyout, main window, detail, and palettes. Logo pip sits left, window controls right, action cluster in the middle.
- **One card**: single PR card definition used everywhere — flyout gets a compact variant (`density=tight`), main window gets the expanded variant. Same status dot, same avatar, same readiness ring, same meta row.
- **Unified pill system**: status chips, filter chips, labels, and review states all use the same `{bg:6–10% / fg / border:14–22%}` triple from the design system — no more "filter chip looks different from review pill."
- **Single tab vocabulary**: underline tabs with 200ms slide, 12px label, count bubble in accent-subtle. Used for section switcher, filter tabs, and detail tabs.
- **Readiness**: circular accent ring with score centered (option A from the form — cleanest at every size, already in the system).
- **Density rhythm**: 4/6/8/12 — rows are 8px vertical padding, card gutter 12px, section gutter 16px.

Let me set up the canvas and start building.

_[tool: copy_starter_component]_

Now let me build the shared styles and components:

_[tool: write_file]_

Now let me build the shared components — icons, the card, and shared UI pieces:

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

Now the fixture data and the four surface designs:

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

<!-- snipping completed setup messages -->

_[tool: snip]_

_[tool: done]_

<!-- housekeeping -->

_[tool: snip]_

_[tool: fork_verifier_agent]_

Streamlined the four surfaces into one cohesive design system on a single canvas:

**What's unified**
- **One chrome** — thin accent-tinted titlebar with the same logo pip, title treatment, and window controls across flyout, main window, PR detail, and worktree palette.
- **One card** — `PRCard` component with a compact row variant for the flyout and an expanded variant for the main list; same avatar, status dot, meta row, and readiness ring.
- **One pill system** — status chips, filter chips, review states, and labels all use the shared `{bg/fg/border}` triple from the design system.
- **One tab vocabulary** — section tabs, filter tabs, and detail tabs all use the same underline bar with the accent-subtle count bubble.
- **One button vocabulary** — `primary / secondary / ghost / danger` with shared press scale and focus ring; the "Bypass Merge / Close PR" row no longer feels bolted-on.
- **One status bar** across every window (mono font, rate-limit info where relevant).
- Shared density tokens (4/6/8/12) and shared readiness ring (circular score, green ≥80 / yellow ≥50 / red).

**Tweaks enabled** (toolbar toggle): Light/Dark · Compact/Comfortable density · Violet/Teal/Amber accent hue — all three cascade through every surface.

**Next steps worth a follow-up round**
- Focus tab mockup (promised by the sidebar pill)
- Settings flyout + Work Items view
- Notifications/toasts + floating badge variants
- Empty & loading states in the card

Let me know which you'd like to tackle next, or comment on any surface to iterate.

## User

Yes please go ahead for the next steps, also the different tabs in the PR window and the new file viewer/file search. Essentially any user-facing view should be worked out so everything is clear.

## User

Yes please go ahead for the next steps, also the different tabs in the PR window and the new file viewer/file search. Essentially any user-facing view should be worked out so everything is clear

## Assistant

_[tool: snip]_

_[tool: update_todos]_

_[tool: list_files]_

<!-- housekeeping -->

_[tool: snip]_

_[tool: read_file]_

<!-- housekeeping -->

_[tool: snip]_

<!-- housekeeping -->

_[tool: snip]_

<!-- housekeeping -->

_[tool: snip]_

_[tool: read_file]_

<!-- housekeeping -->

_[tool: snip]_

I'll now build out the remaining surfaces. Let me create them efficiently as a single batch, then wire into the canvas.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: list_files]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: snip]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: snip]_

_[tool: read_file]_

<!-- housekeeping -->

_[tool: snip]_

I need to look at the remaining surfaces and wire them in. Let me check what's there.

_[tool: read_file]_

_[tool: read_file]_

<!-- housekeeping -->

_[tool: snip]_

<!-- housekeeping -->

_[tool: read_file]_

_[tool: read_file]_

<!-- housekeeping -->

_[tool: snip]_

<!-- housekeeping -->

_[tool: snip]_

<!-- housekeeping -->

Now let me write the remaining surfaces (settings, notifications, SQL, wizard/empty states, floating badge) as one consolidated file and wire everything into the canvas. I'll keep it compact.

_[tool: write_file]_

## Assistant

<!-- housekeeping -->

Now let me write the remaining key screens (Settings, SQL, Notifications, Floating Badge, Setup Wizard, What's New, Empty states) and wire everything into the canvas. Given context constraints I'll consolidate these into a single additional file and update the main HTML.

_[tool: write_file]_

## Assistant

<!-- housekeeping -->

_[tool: snip]_

Let me now build the remaining surfaces. I'll create the Settings, SQL window, Notifications, Setup Wizard, and integrate everything into the canvas.

_[tool: write_file]_

Now let me update the main HTML file to wire everything together into a proper design canvas.

_[tool: write_file]_

_[tool: snip]_

_[tool: update_todos]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

The design is now complete. **BorgDock — Streamlined** is laid out on a single design canvas with six sections:

1. **One design vocabulary** — sidebar, badge styles, worktree palette (same chrome)
2. **Focus tab** — priority-ranked home screen with Quick Review
3. **Main window** — PRs + Work Items
4. **PR detail** — Overview + Checks / Files / Reviews / Commits / Comments
5. **Palettes & code** — File Palette, File Viewer, SQL window
6. **Settings, wizard, notifications**

Tweaks panel supports light/dark, density, and three accent hues.

## User

The fileviewer is missing the diff viewer (separate feature, where if you have changes in your worktree it shows those, when clicked it will open a diff viewer where you can compare against head and compare against base branch)

## Assistant

_[tool: snip]_

_[tool: read_file]_

_[tool: read_file]_

I'll add two new surfaces: (1) a "worktree changes" section in the File Palette / File Viewer showing modified files, and (2) a Diff Viewer with a toggle for HEAD vs base branch.

_[tool: snip]_

Now let me add the diff viewer and worktree changes panel.

_[tool: write_file]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

Added a new **Worktree changes & diff viewer** section with two artboards:

- **Changes panel** — lists uncommitted edits vs HEAD and everything ahead of the base branch. Each row exposes "vs HEAD" and "vs base" actions on hover.
- **Diff viewer** — full split/unified diff with a compare toggle (HEAD ↔ base), hunk nav, and per-file list.

## User

Save as standalone HTML: BorgDock - Streamlined.html

## Assistant

_[tool: snip]_

_[tool: read_file]_

All resources are local files with no string-referenced URLs in JS. I just need to add a thumbnail template.

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: super_inline_html]_

## Assistant

Ready to download above.

## User

Can you also create the dark mode style and show it next to each light mode version?

## Assistant

_[tool: snip]_

_[tool: read_file]_

_[tool: snip]_

_[tool: grep]_

_[tool: snip]_

The dark theme tokens already exist (scoped to `.dark`). I need to render each artboard in light *and* dark side-by-side. The simplest approach: wrap each light artboard's content in a small wrapper, plus add a paired "dark" artboard next to every existing one, where the content is rendered inside a `<div class="dark">` that scopes the dark tokens.

Let me look at how artboards render to confirm this will work, then add dark variants.

_[tool: read_file]_

_[tool: read_file]_

_[tool: snip]_

I'll make a `DarkWrap` helper that scopes the `.dark` class and also sets local background, then pair every existing artboard with a dark variant.

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Each design now appears twice — light on the left, dark on the right — across every section.

## User

A background task has completed. Here are the results:

## Assistant

I need to fix DCSection to flatten fragment children (or inline the pairs). Easiest fix: make DCSection recursively flatten children.

_[tool: snip]_

_[tool: grep]_

I'll fix this without modifying the design-canvas starter — simpler to just inline the dark pairs in the HTML since there are only ~12 artboards.

_[tool: snip]_

_[tool: read_file]_

_[tool: snip]_

I'll patch design-canvas.jsx to flatten fragment children so `LightDarkPair` works, since it's the smallest change.

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Fixed — the design canvas now flattens fragment/helper-wrapped children, so every section renders its full set of light + dark artboards side-by-side.

## User

Save as standalone HTML: BorgDock - Streamlined.html

## Assistant

Thumbnail template already exists, all resources are local. Running the bundler:

_[tool: super_inline_html]_

_[tool: snip]_

_[tool: present_fs_item_for_download]_

Ready to download above.


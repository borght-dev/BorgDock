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

## User

In the sidebar when you hover over the PR card we show the buttons so that a user can immediately take action when needed (for example, checkout a PR, merge it etc) right now that isn't included in the main/focus window desings. What would be a good way of showing these buttons?

## Assistant

_[tool: snip]_

_[tool: read_file]_

Good question. Let me think through this design problem before coding.

**The constraint:** in the sidebar, hover-revealed action buttons work because the row is short and full-width — there's room. In the main/focus window, cards are richer (branch, diff, progress, worktree pill, labels) and live in a wider grid. A naive "hover overlay" would either obscure metadata or feel inconsistent across surfaces.

**Three approaches, each with trade-offs:**

1. **Persistent compact action rail on every card** — always-visible icon buttons in the top-right. Pro: discoverable, no mode change. Con: visual noise on 20+ cards.
2. **Hover-reveal action bar (footer)** — slide up from the bottom of the card on hover. Pro: matches sidebar behaviour, keeps card calm at rest. Con: layout shift unless the bar is absolute.
3. **Smart split: primary action always visible, secondary actions on hover** — one contextual primary button (the most likely next step given PR state — Review / Checkout / Merge) shown at rest, full action bar on hover. Pro: zero-click action available, matches user intent. Con: needs state-driven button logic.

I'll build all three as variants in a new "PR card actions" section so you can compare them directly. Let me explore the existing main window first to see the card context.

_[tool: read_file]_

_[tool: read_file]_

Let me also peek at the existing flyout to see how its hover-actions look today, so the new variants stay consistent.

_[tool: read_file]_

Now I have full context. The current sidebar `PRRow` doesn't actually render hover actions yet (it just changes background color), and neither does the main-window `PRCard` or the focus row. So this is a real gap — let me solve it once across all three surfaces, with clearly differentiated variants.

I'll create a new section showing **3 distinct approaches** in both the sidebar row and the main-window card, plus update the focus row, so you can pick the pattern.

_[tool: write_file]_

_[tool: snip]_

_[tool: read_file]_

I'll wire the new actions showcase into the canvas as a new section right after Main window.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

Added a new section **③ⓑ PR card actions** with three approaches side-by-side, in both card and sidebar-row form.

**The three patterns:**

- **A · Hover-reveal action bar** — card stays calm, full action stack slides up bottom-right on hover. Same gesture as today's sidebar; matches expectations.
- **B · Smart primary + hover secondary** — one context-aware action is *always* visible (Re-run when failing, Merge when approved & yours, Review when assigned, Checkout otherwise). Secondary icons fade in on hover. Zero-click for the obvious next step.
- **C · Persistent icon rail** — three icon buttons always visible. Most discoverable, but adds visual weight to every row.

**My recommendation: B.** Action overflow on hover is fine for a *list* of similar items (sidebar today), but main-window cards are bigger commitments — users have already filtered down to what they care about. Showing the most-likely action persistently reduces a hover-then-click to a single click, and the action label changes by state so it always reads as the *right* next step. Hover still reveals the full set for power users.

One caveat to consider: if you go with B, the primary action button shifts width as PR state changes ("Re-run" vs "Checkout" vs "Merge"). If that bothers you, we can fix the button to a uniform width or use icon-only at rest with a tooltip — let me know.

_[tool: fork_verifier_agent]_

Added the section — pick A, B, or C and I'll roll it through the live cards.

## User

Verifier agent check completed

## Assistant

Adding a `MoreH` icon to the set.

_[tool: grep]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: snip]_

Fixed — added a `MoreH` (three-dot) icon to the icon set. The new "③ⓑ PR card actions" section now renders all three variants in both card and sidebar form.

## User

I only see A fully, B and C gets cut off in the main-window card version. Right now, the flyout already shows fix/monitor on hovering a failing PR, but it doesn't show anything on the passing ones. I like B for the flyout. Can you fix the main-window so I can see all three variations?

## Assistant

Two things to fix: (1) widen the showcase or shrink columns so all three card variants fit, and (2) note that B is the chosen sidebar pattern. Let me check the actual width consumption.

The showcase is 1200px wide ÷ 3 columns = 400px each. The card variants need ~380–400px for the action stack to not clip. The smart-primary variant (B) puts a Ring + secondary icons + primary button all on the right, which probably overflows; same with C's avatar + ring + 3 icons.

Best fix: widen the showcase to ~1440 and tighten internal padding. Let me also restructure B to stack Ring above the action row (vertical) so the row has room.

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: str_replace_edit]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: done]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: snip]_

Fixed the layout — both card variants now stack the action row beneath the headline so all three columns fit inside a wider 1440-wide showcase. B and C should now show their actions in full.

Also noted your call: **B is the pick for the flyout.** When you're ready, I can wire it into the actual `PRRow` and add the smart-primary action to passing PRs in the sidebar (currently only failing PRs get hover actions).

## User

Go for A for the PR card actions and for B on the flyout.

## Assistant

<warning>I will not acknowledge the system reminder.</warning>

_[tool: snip]_

_[tool: read_file]_

Now I'll wire A into the main-window `PRCard` and B into the flyout `PRRow`. The action helpers already live in `pr-actions.jsx` (`primaryFor`, `primaryTone`, `ActionBtn`, `IconActionBtn`, `ACTIONS`) — I just need to make sure they load before `pr-card.jsx`.

Let me check load order:

_[tool: grep]_

`pr-actions.jsx` loads after `pr-card.jsx`, so I need to either move it earlier or duplicate the helpers. Cleaner to move it before `pr-card.jsx`.

_[tool: str_replace_edit]_

Now the helpers in `pr-actions.jsx` need to be exported on `window` so the other Babel scripts can see them. Let me check:

_[tool: grep]_

I need to export the helpers too so `pr-card.jsx` can use them.

_[tool: str_replace_edit]_

Now wire A (hover-reveal bar) into `PRCard` and B (smart primary + hover) into `PRRow`.

_[tool: str_replace_edit]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: snip]_

_[tool: done]_

<warning>I will not acknowledge the system reminder.</warning>

Wired in:
- **Main window cards** → Variant A: hover-reveal action bar (Open/Checkout/Review/More + a state-aware primary) anchored bottom-right.
- **Flyout rows** → Variant B: smart primary button always visible (Re-run / Merge / Review / Open by state), secondary icons (Checkout, More) fade in on hover. The review pill collapses while hovered to make space.

_[tool: fork_verifier_agent]_

Done — A on cards, B on the flyout. Hover any PR card or sidebar row to see them in action.

## User

Save as standalone HTML: BorgDock - Streamlined.html

## Assistant

<warning>I will not acknowledge the system reminder.</warning>

_[tool: snip]_

_[tool: grep]_

_[tool: grep]_

No code-referenced resources, no API calls. Thumbnail already present. Just need to bundle.

_[tool: super_inline_html]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: snip]_

_[tool: show_html]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: show_html]_

<warning>I will not acknowledge the system reminder.</warning>

_[tool: get_webview_logs]_

<warning>I will not acknowledge the system reminder.</warning>

Clean. Delivering the file.

_[tool: present_fs_item_for_download]_

Standalone bundle ready above — 1.3MB, fully offline.


# BorgDock styling guide

The short version of `DESIGN-SYSTEM.md`: what the app looks like and the rules for keeping it that way. Values come from `src/BorgDock.Tauri/src/styles/index.css` (`:root` is light, `.dark` is dark); regenerate the tables from there when a token changes.

## Look

Workbench direction (`plans/ui-overhaul-workbench.md`), shipped in 3.0.0. Graphite surfaces in dark, porcelain in light, one indigo accent that marks selection and the single primary action. Status has three colours (green, red, amber) plus merged violet and informational blue. Depth comes from surfaces and hairlines; shadows are only for floating UI.

## Layout

- Main window: a 200 px rail (logo, Focus / Pull requests / Work items / Worktrees with counts, sync state and GitHub rate at the bottom), then a 36 px title bar, the view, and a 28 px status bar with the keys for the current view.
- A PR or work item opens full screen over the list. Back, `Esc`, `Alt+←` or the mouse back button return to the same row and scroll position. Ctrl+click opens the PR in its own window instead.
- Rows: avatar, title with one meta line, check bar, one review chip, number. 42 px comfortable, 32 px compact. One trailing action (Review or Merge) appears on hover, focus and selection.
- Toasts sit bottom right, 5 s, with Undo when the action can be taken back.
- Tool windows use the same title bar and status bar (`WindowTitleBar`, `chrome/WindowStatusBar`).

## Palette

| Role | Light (porcelain) | Dark (graphite) |
|---|---|---|
| Background | `#f5f5f7` | `#151618` |
| Surface / card | `#ffffff` | `#1b1c1f` |
| Surface raised | `rgba(23,24,28,.03)` | `#212226` |
| Hover wash | `rgba(23,24,28,.04)` | `rgba(255,255,255,.028)` |
| Hairline (`subtle-border`) | `#e5e6ea` | `rgba(255,255,255,.065)` |
| Strong border | `#d4d6dc` | `rgba(255,255,255,.12)` |
| Text primary / secondary | `#17181c` / `#5d606a` | `#ededef` / `#9c9da4` |
| Text muted (small readable text) | `#6b6e78` | `#8e8f96` |
| Text tertiary (≥ 4.5:1 on background and surface) | `#6d707a` | `#82838a` |
| Accent | `#4f46e5` | `#7f7eff` |
| Text on accent (`accent-foreground`) | `#ffffff` | `#12121a` |
| Accent as text on a wash (`purple`) | `#4f46e5` | `#9d9cff` |
| Status green / red / yellow / blue | `#1f9d6b` / `#d64560` / `#c98a12` / `#2d6be4` | `#5cc98f` / `#f0616d` / `#e5b454` / `#6fa8ff` |

Contrast rules, enforced by `src/styles/__tests__/contrast.test.ts` and `tests/e2e/tool-windows-a11y.spec.ts`:
- Readable small text uses `text-tertiary`, `text-muted` or stronger on the background and the surface: all of them pass 4.5:1 in both themes. On `surface-raised` use `text-muted` (tertiary is 4.2:1 there in dark).
- Text on an accent fill uses `accent-foreground` (dark ink in dark mode; white on `#7f7eff` is 3.3:1).
- Accent-coloured text on an accent wash (active chip, selected row id) uses `purple`, which is lighter than the accent in dark mode.

## Type

| Font | Token | Where |
|---|---|---|
| Inter | `--font-ui` (`font-sans`) | Shell, lists, chrome, every tool window. Set on `body`. |
| Instrument Sans | `--font-reading` (`font-reading`) | PR detail, work item detail, Quick Review, the What's new reading view |
| JetBrains Mono | `--font-code` (`font-mono`) | Code, diffs, paths, key chips (`Kbd`) |

All three are self-hosted through `@fontsource-variable` (no network). Lists and chrome are 13 px; status bars 11 px with tabular numerals. Labels are sentence case; no uppercase tracked headings.

## Motion

Tokens in `src/styles/motion.css`; helpers in `src/utils/motion.ts`.

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 150 ms | hover, press, colour, toggle knob |
| `--motion-base` | 260 ms | fades, section and step crossfades, window entrance |
| `--motion-move` | 320 ms | sliding highlights, FLIP reorders, progress fills |
| `--motion-push` | 360 ms | push / pop of a view, the What's new hero reveal |
| `--motion-expand` | 340 ms | grid-row expansion |
| `--ease-out` / `--ease-std` / `--ease-in` | `cubic-bezier(.16,1,.3,1)` / `(.2,.8,.2,1)` / `(.4,0,1,1)` | enter / move / leave |

Reduced motion (the OS setting or Settings → Appearance → Reduce motion, which puts `.reduce-motion` on `<html>`) sets every `--motion-*` to 0.01 ms and stops loops; `motionOK()` gates FLIP, View Transitions and the section crossfade. Apart from loading states, nothing animates on its own except running checks and the sync spinner.

## Theme in every window

`src/utils/theme.ts` owns the theme for all windows:
- `applyTheme(settings | { theme, reduceMotion })` sets `.dark`, `.reduce-motion` and `color-scheme` on `<html>` and writes `localStorage['borgdock-theme']` (the setting) and `['borgdock-reduce-motion']`.
- `resolveTheme(setting)` turns `system` into light or dark through `matchMedia`; `watchSystemTheme(cb)` follows OS changes.
- `startWindowTheme()` runs once in every tool-window entry (`*-main.tsx`): applies the saved settings, re-applies on `settings:ui-changed` from any window, follows the OS while the theme is `system`.
- `public/theme-boot.js` is the pre-paint script every HTML entry loads in `<head>`; it reads the two keys with the same rules, so no window flashes the other theme.
- The main window uses `hooks/useTheme.ts`, a thin hook over the same helper.

## Brand

The Workbench mark: a geometric B made of a vertical rail and two docked panels, flat indigo (the accent colour), no gradient. In the app it is `BorgDockLogo` (`fill: var(--color-accent)`). The tray icon is drawn at runtime in `src-tauri/src/platform/tray.rs`: a flat red, amber or green square with the open-PR count in dark ink, or the mark on indigo when there is nothing to count. Assets, sizes and rebuild steps: `design/brand/workbench/README.md`.

## Rules

1. Colours come from tokens. No hex, `rgb()`/`hsl()` or Tailwind `*-black` / `*-white` utilities in `src/components/**` (`src/styles/__tests__/component-colors.test.ts` fails on any; there are no exceptions). The palette reset makes `text-white` and `bg-black/50` render nothing anyway. Missing a token? Add it to `:root` and `.dark` in `index.css`.
2. Reuse the primitives in `components/shared/primitives/` and the chrome in `components/shared/` (`WindowTitleBar`, `chrome/WindowStatusBar`) before writing a new control.
3. Lists use the row grammar: `.bd-wb-row` in the main window, `.bd-list-row` in tool windows (hover wash, accent bar on `data-selected="true"`, tabular numerals).
4. Every transition uses a motion token and collapses under reduced motion.
5. Check a change in Storybook in both themes (`globals: { theme: 'dark' }`, or `BothThemes` from `src/test-support/story-themes.tsx` for side by side).

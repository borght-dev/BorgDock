Design Philosophy

  Purple-slate aesthetic with soft, translucent surfaces. The
  palette avoids harsh blacks/whites in favor of deep
  purple-tinted neutrals. Both themes use the same hue family
  (violet/purple) for brand consistency, shifting luminance for
  dark mode rather than inverting.

  ---
  Color Palette

  Primary Brand — Violet

  ┌───────────────┬───────────────────┬───────────────────┐
  │     Role      │       Light       │       Dark        │
  ├───────────────┼───────────────────┼───────────────────┤
  │ Accent        │ #6655D4           │ #7C6AF6           │
  ├───────────────┼───────────────────┼───────────────────┤
  │ Purple        │ #6655D4           │ #9384F7           │
  ├───────────────┼───────────────────┼───────────────────┤
  │ Logo gradient │ #6655D4 → #7C6AF6 │ #7C6AF6 → #9384F7 │
  └───────────────┴───────────────────┴───────────────────┘

  Backgrounds

  ┌──────────────┬────────────────────┬─────────────────────┐
  │     Role     │       Light        │        Dark         │
  ├──────────────┼────────────────────┼─────────────────────┤
  │ Page         │ #F7F5FB (lavender  │ #110F1A (deep       │
  │ background   │ white)             │ indigo)             │
  ├──────────────┼────────────────────┼─────────────────────┤
  │ Card /       │ #ffffff            │ #1A1726             │
  │ Surface      │                    │                     │
  ├──────────────┼────────────────────┼─────────────────────┤
  │ Sidebar      │ #F7F5FB → #EDEAF4  │ #110F1A → #1A1726   │
  │ gradient     │                    │                     │
  ├──────────────┼────────────────────┼─────────────────────┤
  │ Surface      │ rgba(90,86,112,    │ rgba(138,133,160,   │
  │ raised       │ 0.03)              │ 0.03)               │
  ├──────────────┼────────────────────┼─────────────────────┤
  │ Surface      │ rgba(90,86,112,    │ rgba(138,133,160,   │
  │ hover        │ 0.05)              │ 0.05)               │
  └──────────────┴────────────────────┴─────────────────────┘

  Text Hierarchy — Purple Slate

  ┌───────────┬─────────┬─────────┐
  │   Level   │  Light  │  Dark   │
  ├───────────┼─────────┼─────────┤
  │ Primary   │ #1A1726 │ #EDEAF4 │
  ├───────────┼─────────┼─────────┤
  │ Secondary │ #3A3550 │ #C8C4D6 │
  ├───────────┼─────────┼─────────┤
  │ Tertiary  │ #5A5670 │ #8A85A0 │
  ├───────────┼─────────┼─────────┤
  │ Muted     │ #8A85A0 │ #5A5670 │
  ├───────────┼─────────┼─────────┤
  │ Faint     │ #B8B0C8 │ #3A3650 │
  ├───────────┼─────────┼─────────┤
  │ Ghost     │ #D8D4E3 │ #2A2640 │
  └───────────┴─────────┴─────────┘

  Status Colors

  ┌──────────────────┬──────────────────────┬─────────┐
  │      Status      │        Light         │  Dark   │
  ├──────────────────┼──────────────────────┼─────────┤
  │ Green (success)  │ #3BA68E (aquamarine) │ #7DD3C0 │
  ├──────────────────┼──────────────────────┼─────────┤
  │ Red (error)      │ #C7324F (ruby)       │ #E54065 │
  ├──────────────────┼──────────────────────┼─────────┤
  │ Yellow (warning) │ #B07D09 (amber)      │ #F5B73B │
  ├──────────────────┼──────────────────────┼─────────┤
  │ Gray (neutral)   │ #8A85A0              │ #5A5670 │
  ├──────────────────┼──────────────────────┼─────────┤
  │ Merged (purple)  │ #8250DF              │ #A371F7 │
  └──────────────────┴──────────────────────┴─────────┘

  Review States

  ┌───────────────────┬─────────┬─────────┐
  │       State       │  Light  │  Dark   │
  ├───────────────────┼─────────┼─────────┤
  │ Approved          │ #3BA68E │ #7DD3C0 │
  ├───────────────────┼─────────┼─────────┤
  │ Changes requested │ #C7324F │ #E54065 │
  ├───────────────────┼─────────┼─────────┤
  │ Review required   │ #B07D09 │ #F5B73B │
  ├───────────────────┼─────────┼─────────┤
  │ Commented         │ #5A5670 │ #8A85A0 │
  └───────────────────┴─────────┴─────────┘

  ---
  Borders & Separators

  All borders use the purple-slate base with low opacity rather
  than gray:
  - Subtle: rgba(90,86,112, 0.08) / rgba(138,133,160, 0.08)
  - Strong: rgba(90,86,112, 0.14) / rgba(138,133,160, 0.14)
  - Card (own PR): rgba(124,106,246, 0.22) (accent-tinted left
  border)

  ---
  Badge System

  Badges use a consistent pattern: tinted background + solid
  foreground + subtle border, all derived from the status color
  at low opacity (4-10% bg, 12-25% border).

  ┌─────────┬────────────────────────────────────────────────┐
  │  Type   │                    Pattern                     │
  ├─────────┼────────────────────────────────────────────────┤
  │ Success │ Green bg 0.07 / Green fg / Green border 0.18   │
  ├─────────┼────────────────────────────────────────────────┤
  │ Warning │ Yellow bg 0.06 / Yellow fg / Yellow border     │
  │         │ 0.14                                           │
  ├─────────┼────────────────────────────────────────────────┤
  │ Error   │ Red bg 0.06 / Red fg / Red border 0.14         │
  ├─────────┼────────────────────────────────────────────────┤
  │ Neutral │ Purple bg 0.06 / Purple fg / Purple border     │
  │         │ 0.14                                           │
  ├─────────┼────────────────────────────────────────────────┤
  │ Draft   │ Gray bg 0.05 / Muted fg / Gray border 0.14     │
  └─────────┴────────────────────────────────────────────────┘

  ---
  Typography

  - Code font: "Cascadia Code", "Cascadia Mono", "Consolas",
  "Courier New", monospace
  - Body text uses Tailwind defaults (system font stack)

  Syntax Highlighting

  ┌──────────┬─────────┬─────────┐
  │  Token   │  Light  │  Dark   │
  ├──────────┼─────────┼─────────┤
  │ Keyword  │ #6655D4 │ #B8B0F8 │
  ├──────────┼─────────┼─────────┤
  │ String   │ #3BA68E │ #7DD3C0 │
  ├──────────┼─────────┼─────────┤
  │ Comment  │ #8A85A0 │ #5A5670 │
  ├──────────┼─────────┼─────────┤
  │ Number   │ #B07D09 │ #F5B73B │
  ├──────────┼─────────┼─────────┤
  │ Type     │ #C7324F │ #E54065 │
  ├──────────┼─────────┼─────────┤
  │ Function │ #3A3550 │ #C8C4D6 │
  └──────────┴─────────┴─────────┘

  ---
  Theme Mechanism

  - Light is the default (:root variables)
  - Dark is activated by adding .dark class to <html>
  - Supports "system" mode (follows OS preference), "dark", or
  "light"
  - CSS framework: Tailwind CSS v4 via @import "tailwindcss"
  with custom CSS variables

  ---
  Animations

  Toast notifications use spring-style physics:
  - Slide in: translateX(120%) → overshoot to -4% → settle at 0
  (bouncy entrance)
  - Slide out: translateX(0) → translateX(120%) (quick exit)
  - Icon pop: scale(0) → scale(1.2) → scale(1)
  - Glow pulse: opacity oscillates 0.6 → 1 → 0.6
  - Merged shimmer: diagonal gradient sweep for merged PR toasts

  ---
  Surface Pattern

  The app uses a layered glass approach:
  - Title bar: semi-transparent (0.88 light / 0.8 dark)
  - Status bar: semi-transparent (0.88 light / 0.6 dark)
  - Floating badge: near-opaque (0.97)
  - Modal overlay: rgba(0,0,0, 0.35) light / rgba(0,0,0, 0.65)
  dark
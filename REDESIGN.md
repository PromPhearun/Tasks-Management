# UI/UX redesign — what changed and why

Baseline: commit `d9783b1`. This document records the design decisions behind the redesign so the
reasoning is reviewable, not just the diff.

## 1. Problems with the previous UI

| Area | Before | Problem |
| --- | --- | --- |
| Layout | Everything stacked in one 900px column: composer → calendar → tasks | The calendar (a secondary tool) pushed the task list below the fold. |
| Task rows | Checkbox + text + a text "Delete" button | No way to edit; no visual priority; deleting was instant and unrecoverable. |
| Feedback | A hidden live region | Sighted users got no confirmation; mistakes were permanent. |
| Filters | `role="tablist"` with `aria-pressed` buttons | Invalid ARIA combination — tabs must use `role="tab"`/`aria-selected`. |
| Focus | Full `innerHTML` re-render on every change | Ticking a checkbox dropped keyboard focus to `<body>`. |
| Calendar | `role="grid"` on a flat list of buttons, keyed by creation date | No rows/gridcells as the role requires, no keyboard navigation, and it ignored due dates. |
| Theme | Dark-first with a `:root[data-theme="light"]` override and a theme script at the end of `body` | Visible flash of the wrong theme on load; light mode relied on many scattered overrides. |
| Semantics | `<div class="container">` used as a layout wrapper for everything | Generic markup, duplicated styles for each panel. |

## 2. Design direction

"Calm and focused": a quiet, low-chrome surface with one accent gradient, generous spacing, and
information revealed only when it matters.

- **Design tokens first.** All colour, space, radius, elevation and font values are CSS custom
  properties in `:root`. The light theme overrides **only** colour/elevation tokens — the spacing
  and radius scales are shared, so the two themes cannot drift apart.
- **Semantic colour.** Tokens are named for meaning (`--danger`, `--success`, `--accent-text`), and
  every soft/tint token has a matching text token with enough contrast on both themes.
- **Two-column layout at ≥980px** (`minmax(0, 1.55fr) minmax(20rem, 1fr)`): tasks on the left where
  the eye lands, calendar as a sticky `aside` on the right. Below 980px it collapses to one column
  in reading order (composer → tasks → calendar).
- **A single row rhythm** for tasks: 4px priority accent bar, checkbox, text, then badges, then icon
  actions. On narrow screens the badges wrap under the text via `grid-template-areas`, so nothing
  is hidden.

## 3. UX changes

1. **Composer with context** — task, priority and due date in one row (stacked on mobile), a visible
   label per field, a `kbd` hint line, and a reset back to defaults after adding.
2. **Inline editing** — a pencil button turns the row into an input with Save/Cancel; `Enter` saves,
   `Esc` cancels, and an empty value is rejected with an explanation instead of silently deleting.
3. **Undo instead of confirm dialogs** — deletes and "Clear completed" raise a toast with an Undo
   action (8s, paused while hovered or focused). Undo restores a snapshot, so it is exact.
4. **Search, sort and an overdue filter** — the three things you want once a list grows past a
   screenful. Search results are announced after a short debounce.
5. **Progress at a glance** — total / active / done / overdue pills plus a `progressbar`.
6. **Contextual empty states** — "No tasks yet", "Nothing on this day", "All caught up!", etc.,
   each with a hint that tells you what to do next.
7. **An active-filter banner** that states exactly what is being hidden and offers one-click Clear.
8. **Calendar that earns its place** — keyed by due date (falling back to creation date, so existing
   data still shows up), arrow-key navigation with month roll-over, a Today button, and dots that
   go red when a day contains overdue work.

## 4. Accessibility changes

- Filters are now a labelled `role="group"` of `aria-pressed` toggles — valid ARIA, and no roving
  tabindex needed.
- The calendar is a real `<table>` with `<th scope="col">`, a `<caption>`, per-day `aria-label`s that
  include the weekday, task count and overdue count, `aria-current="date"` for today, and a single
  tab stop (roving `tabindex` + arrow keys).
- Checkboxes get their accessible name from their wrapping `<label>` and an `aria-describedby` that
  points at the badge row ("High priority", "Due today"), instead of overriding the name with
  "Mark X as completed".
- **Focus preservation**: each interactive element carries a `data-focus` key; renders capture the
  focused key first and restore it afterwards. Destructive actions move focus to the task list
  instead, so the position is always predictable.
- The skip link is the first tab stop; icon-only buttons have `aria-label`s; progress exposes
  `aria-valuetext` ("1 of 2 tasks complete").
- `prefers-reduced-motion` disables transitions; `forced-colors` keeps selected chips and primary
  buttons visible.
- The theme is applied by a tiny inline script in `<head>`, so there is no flash of the wrong theme.

## 5. Deliberate non-goals

- No build step, no framework, no dependencies — the app is still three files opened from disk.
- No server, accounts or sync; `localStorage` remains the source of truth.
- The storage key `tasks-v1` is unchanged. Older records (`{id, text, completed}`) are normalised on
  load: `createdAt` is derived from the id timestamp, priority defaults to `normal`, `due` to `null`.

## 6. Review round (independent audit, applied)

The redesign was audited by a separate reviewer before merge. Findings and their resolutions:

| Finding | Severity | Resolution |
| --- | --- | --- |
| `[hidden]` was defeated by component `display` rules, so the empty state, the active-filter bar and the "0 overdue" pill were always rendered | blocker | Added `[hidden] { display: none !important; }` plus a regression test that asserts computed `display: none` |
| Stale "Showing …" text was never cleared | medium | `renderActiveFilters` now always writes the text, empty when nothing is filtered |
| Month navigation left a day filter pointing at another month (regression vs. the old build) | high | `shiftMonth` clears the day filter and re-renders the list |
| Filter chip and stat counts were global while the list was day/search-scoped | medium | Counts are computed from the same scope as the list (`scopedTasks`) |
| Light-theme `--text-subtle` and the badge tones failed WCAG AA | high | Darkened `--text-subtle` (4.7:1), `--warning` (5.6:1), `--success` (5.1:1), `--danger` (5.3:1) |
| White on the dark accent fill was 4.35:1 | high | Darkened `--accent`/`--accent-hover` to 5.64:1 / 4.98:1 |
| `aria-describedby` sat on an unnamed `<form>` and was likely ignored | medium | Moved to `#task-input` |
| Theme toggle combined an action label with `aria-pressed` | low | Dropped `aria-pressed`; the label states the action |
| Skip-link target was not focusable | low | `tabindex="-1"` on `<main>` |
| `#cal-month-label` was a live region re-written on every render (repeat announcements) | low | Removed `aria-live`; month changes are announced once via the status region |
| Selected calendar day was only signalled visually | low | Day buttons now expose `aria-pressed` |
| Calendar dots encoded state by colour alone | low | Overdue is a square, "all completed" is hollow |
| Progressbar duplicated its own count through `aria-labelledby` + `aria-valuetext` | low | Named with `aria-label="Task progress"` |
| No print styles; the dark default printed near-white text on white | medium | Added an `@media print` block that forces light tokens and hides chrome |
| `background-attachment: fixed` (iOS jank) | low | Removed |
| Search icon used a hard-coded colour in a data URI | low | Replaced with a `mask` + `currentColor` icon that follows the theme |
| `PageUp`/`PageDown` could roll over into an unexpected month | low | The target day is clamped to the target month's length |
| `badge--plain` modifier was emitted but never defined | low | Defined explicitly |
| Unused `--space-7` token | low | Removed |
| Toasts beyond the cap vanished without animation | low | The oldest toast is now dismissed through the normal path |

Verification for this round: a 148-assertion jsdom suite (rendering, CRUD, filters, search, sort, inline
edit, delete/undo, calendar navigation, persistence, migration, theme, ARIA wiring, and one test per
finding above) plus a scripted WCAG AA contrast audit over both token sets. All assertions and all
text-contrast pairs pass.

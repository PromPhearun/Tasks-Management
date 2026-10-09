# Task Manager (accessible web app)

A small, dependency-free task manager: capture tasks, give them a priority and a due date, then
find them again with filters, search, sorting and a calendar view. Semantic HTML, responsive CSS,
full keyboard support, and persistence in `localStorage`.

Files
- [index.html](index.html) — markup
- [styles.css](styles.css) — design tokens and styles
- [app.js](app.js) — behaviour (persistence key: `tasks-v1`)
- [REDESIGN.md](REDESIGN.md) — what changed in the UI/UX redesign and why

How to run

Open `index.html` in your browser. For a simple local server (recommended):

```bash
# Python 3
python3 -m http.server 8000

# then open http://localhost:8000 in your browser
```

Features

- **Add a task** with an optional priority (low / normal / high) and due date.
- **Complete, edit and delete** tasks; deletes and bulk clears can be **undone** from the toast.
- **Filters** with live counts: All, Active, Completed, Overdue.
- **Search** by text, and **sort** by newest, oldest, priority, due date or A–Z.
- **Progress** summary: totals, active/done/overdue counts and a progress bar.
- **Calendar** of tasks by date (due date, falling back to the creation date). Select a day to
  filter the list; dots mark days with work and turn red when something is overdue.
- **Light and dark themes**, following the system preference on first visit and remembering your
  choice afterwards.

Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | Focus the new-task field |
| `/` | Focus search |
| `Esc` | Clear filters / cancel an inline edit |
| `Enter` | Save an inline edit |
| Arrow keys, `Home`/`End`, `PageUp`/`PageDown` | Move between days in the calendar |

Accessibility notes

- Semantic structure: `header`/`main`/`section`/`aside`/`footer`, a skip link, and real
  `label`/`for` pairs for every control.
- The calendar is a `<table>` with column headers and a caption, per-day buttons with descriptive
  `aria-label`s, `aria-current="date"` for today, and a roving `tabindex` so it is a single tab stop.
- Filter chips are toggle buttons (`aria-pressed`) inside a labelled `role="group"`.
- Progress uses `role="progressbar"` with `aria-valuenow`/`aria-valuetext`.
- Status messages use an `aria-live` region; toasts (with their Undo buttons) are announced too.
- Focus is preserved across re-renders, so ticking a checkbox or deleting a row does not throw the
  keyboard user back to the top of the page.
- Honours `prefers-reduced-motion`, `forced-colors` and print; every text/background pair in
  both themes meets WCAG AA (4.5:1).

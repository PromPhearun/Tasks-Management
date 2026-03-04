# Task Manager (Accessible Web App)

Simple task manager with add, delete, and mark-as-complete features. Uses semantic HTML, modern responsive CSS, keyboard-friendly interactions, and persistence via `localStorage`.

Files
- [index.html](index.html) — main markup
- [styles.css](styles.css) — styles
- [app.js](app.js) — behavior (persistence key: `tasks-v1`)

How to run

Open `index.html` in your browser. For a simple local server (recommended):

```bash
# Python 3
python3 -m http.server 8000

# then open http://localhost:8000 in your browser
```

Accessibility notes
- Form uses proper label and aria-describedby.
- Status messages use an `aria-live` region.
- Buttons have descriptive `aria-label`s.

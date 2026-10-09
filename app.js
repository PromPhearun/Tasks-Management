'use strict';

/* ==========================================================================
   Task Manager — behaviour
   --------------------------------------------------------------------------
   Structure:
     1. Constants & state
     2. Small utilities (storage, dates, text)
     3. Theme
     4. Derived data (filtering, sorting, counts)
     5. Rendering (tasks, calendar, stats, empty state)
     6. Feedback (live region, toasts, undo)
     7. Events & initialisation
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Constants & state
   -------------------------------------------------------------------------- */

const STORAGE_KEY = 'tasks-v1'; // unchanged so existing saved tasks keep working
const THEME_KEY = 'theme-v1';
const TOAST_DURATION = 8000;
const MAX_TOASTS = 3;
const DAY_MS = 86400000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PRIORITIES = ['low', 'normal', 'high'];
const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High' };
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

const FILTER_LABELS = {
  all: 'All tasks',
  active: 'Active tasks',
  completed: 'Completed tasks',
  overdue: 'Overdue tasks',
};

const SORT_LABELS = {
  'created-desc': 'newest first',
  'created-asc': 'oldest first',
  priority: 'priority',
  due: 'due date',
  alpha: 'A to Z',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const byId = (id) => document.getElementById(id);

const dom = {
  form: byId('task-form'),
  input: byId('task-input'),
  priority: byId('task-priority'),
  due: byId('task-due'),
  list: byId('task-list'),
  status: byId('status'),
  emptyState: byId('empty-state'),
  emptyIcon: byId('empty-icon'),
  emptyMsg: byId('empty-msg'),
  emptyHint: byId('empty-hint'),
  search: byId('search-input'),
  sort: byId('sort-select'),
  clearCompleted: byId('clear-completed'),
  filterButtons: {
    all: byId('filter-all'),
    active: byId('filter-active'),
    completed: byId('filter-completed'),
    overdue: byId('filter-overdue'),
  },
  filterCounts: {
    all: byId('count-all'),
    active: byId('count-active'),
    completed: byId('count-completed'),
    overdue: byId('count-overdue'),
  },
  activeFilters: byId('active-filters'),
  activeFiltersText: byId('active-filters-text'),
  clearFilters: byId('clear-filters'),
  statTotal: byId('stat-total'),
  statActive: byId('stat-active'),
  statCompleted: byId('stat-completed'),
  statOverdue: byId('stat-overdue'),
  statOverdueItem: byId('stat-overdue-item'),
  progressBar: byId('progress-bar'),
  progressFill: byId('progress-fill'),
  progressLabel: byId('progress-label'),
  themeToggle: byId('theme-toggle'),
  calendarBody: byId('calendar-body'),
  calendarTable: byId('calendar'),
  calendarLabel: byId('cal-month-label'),
  calPrev: byId('cal-prev'),
  calNext: byId('cal-next'),
  calToday: byId('cal-today'),
  toastRegion: byId('toast-region'),
};

let tasks = [];

const view = {
  filter: 'all', // 'all' | 'active' | 'completed' | 'overdue'
  query: '',
  sort: 'created-desc',
  day: null, // selected calendar day as a YYYY-MM-DD key
};

const calendarState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
};

let editingId = null; // id of the task currently being edited inline
/* --------------------------------------------------------------------------
   2. Utilities
   -------------------------------------------------------------------------- */

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    /* Storage can be full or blocked (private mode) — the app still works in memory. */
  }
}

const pad2 = (value) => String(value).padStart(2, '0');

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function todayKey() {
  return toDateKey(new Date());
}

function daysBetween(fromKey, toKey) {
  return Math.round((fromDateKey(toKey) - fromDateKey(fromKey)) / DAY_MS);
}

function formatDate(date, { withYear = false } = {}) {
  const base = `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
  return withYear ? `${base} ${date.getFullYear()}` : base;
}

function truncate(text, max = 42) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Human summary of a task's due date, used for badges and screen readers. */
function dueInfo(task) {
  if (!task.due) return null;

  const due = fromDateKey(task.due);
  const diff = daysBetween(todayKey(), task.due);
  const withYear = due.getFullYear() !== new Date().getFullYear();
  const absolute = `Due ${formatDate(due, { withYear })}`;

  if (task.completed) return { label: absolute, tone: 'done', title: absolute };

  if (diff < 0) {
    const label = diff === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(diff)} days`;
    return { label, tone: 'overdue', title: `${absolute} — ${label.toLowerCase()}` };
  }
  if (diff === 0) return { label: 'Due today', tone: 'today', title: absolute };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'today', title: absolute };
  if (diff <= 7) return { label: `Due in ${diff} days`, tone: 'soon', title: absolute };
  return { label: absolute, tone: 'plain', title: absolute };
}

function isOverdue(task) {
  return Boolean(task.due) && !task.completed && task.due < todayKey();
}

/** The date a task belongs to on the calendar: its due date, else when it was created. */
function taskDateKey(task) {
  return task.due || toDateKey(new Date(task.createdAt));
}

/** Bring older or partial records up to the current shape without losing data. */
function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id === undefined || raw.id === null ? String(Date.now()) : String(raw.id);
  const parsedId = Number.parseInt(id, 10);
  const text = raw.text === undefined || raw.text === null ? '' : String(raw.text);

  return {
    id,
    text: text.trim(),
    completed: Boolean(raw.completed),
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'normal',
    due: typeof raw.due === 'string' && DATE_KEY_PATTERN.test(raw.due) ? raw.due : null,
    createdAt: Number.isFinite(parsedId) ? parsedId : Date.now(),
  };
}

function loadTasks() {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTask).filter((task) => task && task.text);
  } catch (error) {
    return [];
  }
}

function saveTasks() {
  writeStorage(STORAGE_KEY, JSON.stringify(tasks));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function snapshotTasks() {
  return tasks.map((task) => Object.assign({}, task));
}

/* --------------------------------------------------------------------------
   3. Theme
   -------------------------------------------------------------------------- */

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme, { persist = true } = {}) {
  const isLight = theme === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');

  const icon = dom.themeToggle.querySelector('.theme-icon');
  if (icon) icon.textContent = isLight ? '🌙' : '☀️';
  dom.themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');

  if (persist) writeStorage(THEME_KEY, isLight ? 'light' : 'dark');
}

function initTheme() {
  const stored = readStorage(THEME_KEY);
  const prefersLight = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches;
  const fallback = prefersLight ? 'light' : 'dark';
  applyTheme(stored === 'light' || stored === 'dark' ? stored : fallback, { persist: false });
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  announce(`Switched to ${next} mode`);
}

/* --------------------------------------------------------------------------
   4. Derived data
   -------------------------------------------------------------------------- */

function matchesFilter(task) {
  switch (view.filter) {
    case 'active':
      return !task.completed;
    case 'completed':
      return task.completed;
    case 'overdue':
      return isOverdue(task);
    default:
      return true;
  }
}

function matchesQuery(task) {
  return view.query === '' || task.text.toLowerCase().includes(view.query);
}

function matchesDay(task) {
  return view.day === null || taskDateKey(task) === view.day;
}

function sortTasks(list) {
  const sorted = list.slice();

  switch (view.sort) {
    case 'created-asc':
      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case 'priority':
      return sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        || b.createdAt - a.createdAt);
    case 'due':
      return sorted.sort((a, b) => {
        if (!a.due && !b.due) return b.createdAt - a.createdAt;
        if (!a.due) return 1; // tasks without a due date sink to the bottom
        if (!b.due) return -1;
        return a.due.localeCompare(b.due) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      });
    case 'alpha':
      return sorted.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
}

function scopedTasks() {
  return tasks.filter((task) => matchesDay(task) && matchesQuery(task));
}

function visibleTasks() {
  return sortTasks(scopedTasks().filter(matchesFilter));
}

/** Counts for the current day/search scope, so chips always match the list. */
function countByFilter() {
  const scope = scopedTasks();
  return {
    all: scope.length,
    active: scope.filter((task) => !task.completed).length,
    completed: scope.filter((task) => task.completed).length,
    overdue: scope.filter(isOverdue).length,
  };
}

function dayLabel(key) {
  const date = fromDateKey(key);
  return formatDate(date, { withYear: date.getFullYear() !== new Date().getFullYear() });
}

/* --------------------------------------------------------------------------
   5. Rendering
   -------------------------------------------------------------------------- */

const ICONS = {
  edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
};

/** Remember which control had focus so a re-render does not dump the user at the top. */
function captureFocusKey() {
  const active = document.activeElement;
  if (!active || !active.dataset) return null;
  return active.dataset.focus || null;
}

function restoreFocus(key) {
  if (!key) return false;
  const target = document.querySelector(`[data-focus="${key}"]`);
  if (target && typeof target.focus === 'function') {
    target.focus();
    return true;
  }
  return false;
}

function renderAll({ focus = null } = {}) {
  renderStats();
  renderTasks(focus);
  renderCalendar(focus);
}

function renderStats() {
  const counts = countByFilter();
  const total = counts.all;
  const completed = counts.completed;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  dom.statTotal.textContent = String(total);
  dom.statActive.textContent = String(counts.active);
  dom.statCompleted.textContent = String(completed);
  dom.statOverdue.textContent = String(counts.overdue);
  dom.statOverdueItem.hidden = counts.overdue === 0;

  Object.keys(dom.filterCounts).forEach((key) => {
    dom.filterCounts[key].textContent = String(counts[key]);
  });

  dom.progressFill.style.width = `${percent}%`;
  dom.progressBar.setAttribute('aria-valuenow', String(percent));
  dom.progressBar.setAttribute('aria-valuetext', total === 0
    ? 'No tasks yet'
    : `${completed} of ${total} tasks complete`);
  dom.progressLabel.textContent = total === 0
    ? 'No tasks yet — add one to start tracking progress.'
    : `${completed} of ${total} complete (${percent}%)`;

  dom.clearCompleted.disabled = completed === 0;

  Object.keys(dom.filterButtons).forEach((key) => {
    dom.filterButtons[key].setAttribute('aria-pressed', String(view.filter === key));
  });

  renderActiveFilters();
}

function renderActiveFilters() {
  const parts = [];
  if (view.filter !== 'all') parts.push(FILTER_LABELS[view.filter].toLowerCase());
  if (view.day) parts.push(`due ${dayLabel(view.day)}`);
  if (view.query) parts.push(`matching “${view.query}”`);

  dom.activeFilters.hidden = parts.length === 0;
  dom.activeFiltersText.textContent = parts.length > 0 ? `Showing ${parts.join(' · ')}` : '';
}

function renderEmptyState() {
  let title = 'No tasks yet';
  let hint = 'Add your first task above to get started.';
  let icon = '🗒️';

  if (tasks.length > 0) {
    if (view.query) {
      title = 'No matching tasks';
      hint = `Nothing matches “${view.query}”. Try a different search.`;
      icon = '🔍';
    } else if (view.day) {
      title = 'Nothing on this day';
      hint = `No tasks are scheduled for ${dayLabel(view.day)}.`;
      icon = '📅';
    } else if (view.filter === 'completed') {
      title = 'Nothing completed yet';
      hint = 'Tick a task and it will show up here.';
    } else if (view.filter === 'overdue') {
      title = 'Nothing overdue';
      hint = 'Every task is on or ahead of schedule.';
      icon = '✅';
    } else if (view.filter === 'active') {
      title = 'All caught up!';
      hint = 'Every task is complete. Enjoy the quiet.';
      icon = '🎉';
    }
  }

  dom.emptyIcon.textContent = icon;
  dom.emptyMsg.textContent = title;
  dom.emptyHint.textContent = hint;
  dom.emptyState.hidden = false;
}

function renderTasks(focus = null) {
  const focusKey = focus || captureFocusKey();

  dom.list.innerHTML = '';
  const visible = visibleTasks();

  if (visible.length === 0) {
    renderEmptyState();
  } else {
    dom.emptyState.hidden = true;
    visible.forEach((task) => dom.list.appendChild(buildTaskItem(task)));
  }

  if (focusKey) restoreFocus(focusKey);
}

function buildBadge(label, modifier, title) {
  const badge = document.createElement('span');
  badge.className = `badge ${modifier}`;
  badge.textContent = label;
  if (title) badge.title = title;
  return badge;
}

function buildTaskItem(task) {
  const item = document.createElement('li');
  item.className = `task-item is-${task.priority}`;
  item.dataset.id = task.id;
  if (task.completed) item.classList.add('is-completed');

  if (editingId === task.id) {
    item.classList.add('is-editing');
    item.appendChild(buildTaskEditor(task));
    return item;
  }

  const checkboxId = `task-${task.id}`;
  const metaId = `meta-${task.id}`;

  const label = document.createElement('label');
  label.className = 'task-item__label';
  label.htmlFor = checkboxId;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-item__checkbox';
  checkbox.id = checkboxId;
  checkbox.checked = task.completed;
  checkbox.dataset.focus = `toggle:${task.id}`;

  const text = document.createElement('span');
  text.className = 'task-item__text';
  text.textContent = task.text;

  label.append(checkbox, text);

  // Meta badges double as the checkbox's accessible description.
  const meta = document.createElement('div');
  meta.className = 'task-item__meta';
  meta.id = metaId;

  if (task.priority !== 'normal') {
    meta.appendChild(buildBadge(`${PRIORITY_LABELS[task.priority]} priority`, `badge--priority-${task.priority}`));
  }

  const due = dueInfo(task);
  if (due) meta.appendChild(buildBadge(due.label, `badge--${due.tone}`, due.title));

  if (meta.children.length > 0) {
    checkbox.setAttribute('aria-describedby', metaId);
  }

  const actions = document.createElement('div');
  actions.className = 'task-item__actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'icon-button icon-button--sm';
  editButton.innerHTML = ICONS.edit;
  editButton.title = 'Edit task';
  editButton.dataset.focus = `edit:${task.id}`;
  editButton.setAttribute('aria-label', `Edit task: ${task.text}`);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'icon-button icon-button--sm icon-button--danger';
  deleteButton.innerHTML = ICONS.trash;
  deleteButton.title = 'Delete task';
  deleteButton.dataset.focus = `delete:${task.id}`;
  deleteButton.setAttribute('aria-label', `Delete task: ${task.text}`);

  actions.append(editButton, deleteButton);

  checkbox.addEventListener('change', () => {
    task.completed = checkbox.checked;
    saveTasks();
    renderAll();
    announce(task.completed ? `Completed: ${task.text}` : `Reopened: ${task.text}`);
  });

  editButton.addEventListener('click', () => startEdit(task.id));
  deleteButton.addEventListener('click', () => deleteTask(task.id));

  item.append(label, meta, actions);
  return item;
}

function buildTaskEditor(task) {
  const wrapper = document.createElement('div');
  wrapper.className = 'task-item__edit';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.id = `edit-${task.id}`;
  input.value = task.text;
  input.autocomplete = 'off';
  input.dataset.focus = `edit:${task.id}`;
  input.setAttribute('aria-label', `Edit task text for ${task.text}`);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button button--primary button--sm';
  save.textContent = 'Save';
  save.dataset.focus = `save:${task.id}`;
  save.addEventListener('click', () => commitEdit(task.id, input.value));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button button--ghost button--sm';
  cancel.textContent = 'Cancel';
  cancel.dataset.focus = `cancel:${task.id}`;
  cancel.addEventListener('click', () => cancelEdit());

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit(task.id, input.value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  });

  wrapper.append(input, save, cancel);
  return wrapper;
}

function startEdit(id) {
  editingId = id;
  renderTasks(`edit:${id}`);
}

function cancelEdit(message = 'Edit cancelled') {
  const id = editingId;
  editingId = null;
  renderTasks(id ? `edit:${id}` : null);
  announce(message);
}

function commitEdit(id, value) {
  const task = tasks.find((item) => item.id === id);
  const text = value.trim();

  if (!task) {
    editingId = null;
    renderAll();
    return;
  }

  if (text === '') {
    cancelEdit('A task needs some text, so the edit was cancelled.');
    return;
  }

  task.text = text;
  editingId = null;
  saveTasks();
  renderAll({ focus: `edit:${id}` });
  announce(`Updated: ${text}`);
}

/* --------------------------------------------------------------------------
   5b. Calendar
   -------------------------------------------------------------------------- */

function tasksByDate() {
  const map = {};
  tasks.forEach((task) => {
    const key = taskDateKey(task);
    if (!map[key]) map[key] = [];
    map[key].push(task);
  });
  return map;
}

function renderCalendar(focus = null) {
  const focusKey = focus || captureFocusKey();
  const { year, month } = calendarState;
  const monthPrefix = `${year}-${pad2(month + 1)}`;
  const today = todayKey();
  const grouped = tasksByDate();

  dom.calendarLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Roving tabindex: the selected day, else today, else the 1st of the month.
  const selectedInMonth = view.day && view.day.startsWith(monthPrefix) ? view.day : null;
  const todayInMonth = today.startsWith(monthPrefix) ? today : null;
  const rovingDate = selectedInMonth || todayInMonth || `${monthPrefix}-01`;

  dom.calendarBody.innerHTML = '';
  let row = document.createElement('tr');

  for (let i = 0; i < firstWeekday; i += 1) {
    row.appendChild(document.createElement('td'));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    if (row.children.length === 7) {
      dom.calendarBody.appendChild(row);
      row = document.createElement('tr');
    }

    const dateKey = `${monthPrefix}-${pad2(day)}`;
    const dayTasks = grouped[dateKey] || [];
    const date = new Date(year, month, day);
    const weekday = date.getDay();
    const isToday = dateKey === today;

    const cell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cal-day';
    button.dataset.date = dateKey;
    button.dataset.focus = `day:${dateKey}`;
    button.textContent = String(day);
    button.tabIndex = dateKey === rovingDate ? 0 : -1;

    if (weekday === 0 || weekday === 6) button.classList.add('is-weekend');
    if (isToday) {
      button.classList.add('is-today');
      button.setAttribute('aria-current', 'date');
    }
    const isSelected = view.day === dateKey;
    button.setAttribute('aria-pressed', String(isSelected));
    if (isSelected) button.classList.add('is-selected');

    let label = `${WEEKDAY_NAMES[weekday]} ${day} ${MONTH_NAMES[month]} ${year}`;
    if (isToday) label += ', today';

    if (dayTasks.length > 0) {
      button.classList.add('has-tasks');
      const overdueCount = dayTasks.filter(isOverdue).length;
      const allCompleted = dayTasks.every((task) => task.completed);

      if (overdueCount > 0) button.classList.add('has-overdue');
      else if (allCompleted) button.classList.add('has-completed');

      const pending = dayTasks.filter((task) => !task.completed).length;
      label += `, ${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}`;
      if (overdueCount > 0) label += `, ${overdueCount} overdue`;
      else if (pending === 0) label += ', all completed';
    }

    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => selectDay(dateKey));

    cell.appendChild(button);
    row.appendChild(cell);
  }

  if (row.children.length > 0) dom.calendarBody.appendChild(row);

  if (focusKey) restoreFocus(focusKey);
}

function selectDay(dateKey) {
  view.day = view.day === dateKey ? null : dateKey;
  renderAll({ focus: `day:${dateKey}` });
  announce(view.day
    ? `Filtered to tasks on ${dayLabel(view.day)}`
    : 'Day filter cleared');
}

function shiftMonth(delta) {
  const date = new Date(calendarState.year, calendarState.month + delta, 1);
  calendarState.year = date.getFullYear();
  calendarState.month = date.getMonth();

  // A day filter pointing at another month would hide the list with no visible cause.
  if (view.day) {
    view.day = null;
    renderAll();
  } else {
    renderCalendar();
  }

  announce(`${MONTH_NAMES[calendarState.month]} ${calendarState.year}`);
}

function goToToday() {
  const today = new Date();
  calendarState.year = today.getFullYear();
  calendarState.month = today.getMonth();
  view.day = todayKey();
  renderAll({ focus: `day:${view.day}` });
  announce('Showing today');
}

/** Move focus between days (and months) with the arrow keys, ARIA grid style. */
function handleCalendarKeydown(event) {
  const button = event.target.closest('.cal-day');
  if (!button) return;

  const date = fromDateKey(button.dataset.date);
  const year = date.getFullYear();
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  let next = null;

  switch (event.key) {
    case 'ArrowLeft':
      next = new Date(year, month, dayOfMonth - 1);
      break;
    case 'ArrowRight':
      next = new Date(year, month, dayOfMonth + 1);
      break;
    case 'ArrowUp':
      next = new Date(year, month, dayOfMonth - 7);
      break;
    case 'ArrowDown':
      next = new Date(year, month, dayOfMonth + 7);
      break;
    case 'Home':
      next = new Date(year, month, dayOfMonth - date.getDay());
      break;
    case 'End':
      next = new Date(year, month, dayOfMonth + (6 - date.getDay()));
      break;
    case 'PageUp':
    case 'PageDown': {
      const step = event.key === 'PageUp' ? -1 : 1;
      const targetMonth = month + step;
      const lastDay = new Date(year, targetMonth + 1, 0).getDate();
      next = new Date(year, targetMonth, Math.min(dayOfMonth, lastDay));
      break;
    }
    default:
      return;
  }

  event.preventDefault();
  focusDate(next);
}

function focusDate(date) {
  const key = toDateKey(date);

  if (date.getFullYear() !== calendarState.year || date.getMonth() !== calendarState.month) {
    calendarState.year = date.getFullYear();
    calendarState.month = date.getMonth();
    renderCalendar();
  }

  const target = dom.calendarBody.querySelector(`.cal-day[data-date="${key}"]`);
  if (!target) return;

  dom.calendarBody.querySelectorAll('.cal-day').forEach((button) => {
    button.tabIndex = -1;
  });
  target.tabIndex = 0;
  target.focus();
}

/* --------------------------------------------------------------------------
   6. Feedback: live region, toasts, undo
   -------------------------------------------------------------------------- */

function announce(message) {
  dom.status.textContent = message;
}

function dismissToast(toast) {
  if (!toast || toast.dataset.dismissed === 'true') return;
  toast.dataset.dismissed = 'true';
  toast.classList.remove('is-visible');
  window.setTimeout(() => toast.remove(), 250);
}

function nextFrame(callback) {
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
  else window.setTimeout(callback, 16);
}

function showToast(message, { actionLabel = null, onAction = null } = {}) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  const text = document.createElement('p');
  text.className = 'toast__text';
  text.textContent = message;
  toast.appendChild(text);

  if (actionLabel && typeof onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast__action';
    action.textContent = actionLabel;
    action.addEventListener('click', () => {
      onAction();
      dismissToast(toast);
    });
    toast.appendChild(action);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.innerHTML = '&times;';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.addEventListener('click', () => dismissToast(toast));
  toast.appendChild(close);

  dom.toastRegion.appendChild(toast);
  const queued = Array.from(dom.toastRegion.children);
  queued.slice(0, Math.max(0, queued.length - MAX_TOASTS)).forEach(dismissToast);

  nextFrame(() => toast.classList.add('is-visible'));

  // Auto-dismiss, but give people time to read (and pause while they interact).
  let timer = window.setTimeout(() => dismissToast(toast), TOAST_DURATION);
  const pause = () => window.clearTimeout(timer);
  const resume = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => dismissToast(toast), TOAST_DURATION);
  };

  toast.addEventListener('mouseenter', pause);
  toast.addEventListener('mouseleave', resume);
  toast.addEventListener('focusin', pause);
  toast.addEventListener('focusout', resume);

  return toast;
}

function restoreSnapshot(snapshot, message) {
  tasks = snapshot.map(normalizeTask).filter((task) => task && task.text);
  editingId = null;
  saveTasks();
  renderAll();
  announce(message);
}

function addTask(text, priority, due) {
  const task = {
    id: createId(),
    text,
    completed: false,
    priority: PRIORITIES.includes(priority) ? priority : 'normal',
    due: DATE_KEY_PATTERN.test(due) ? due : null,
    createdAt: Date.now(),
  };

  tasks.unshift(task);

  // Make sure the brand-new task cannot be hidden by the current view.
  view.day = null;
  if (view.filter === 'completed' || (view.filter === 'overdue' && !isOverdue(task))) {
    view.filter = 'all';
  }

  saveTasks();
  renderAll();
  announce(`Added: ${text}`);
}

function deleteTask(id) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return;

  const previous = snapshotTasks();
  const [removed] = tasks.splice(index, 1);
  if (editingId === id) editingId = null;

  saveTasks();
  renderAll({ focus: 'list' });

  showToast(`Deleted “${truncate(removed.text)}”`, {
    actionLabel: 'Undo',
    onAction: () => restoreSnapshot(previous, `Restored: ${removed.text}`),
  });
}

function clearCompleted() {
  const completed = tasks.filter((task) => task.completed);
  if (completed.length === 0) return;

  const previous = snapshotTasks();
  tasks = tasks.filter((task) => !task.completed);
  editingId = null;

  saveTasks();
  renderAll({ focus: 'list' });

  showToast(`Cleared ${completed.length} completed task${completed.length === 1 ? '' : 's'}`, {
    actionLabel: 'Undo',
    onAction: () => restoreSnapshot(previous, 'Completed tasks restored'),
  });
}

function setFilter(filter) {
  view.filter = filter;
  renderAll();
  announce(`Showing ${FILTER_LABELS[filter].toLowerCase()}`);
}

function clearFilters() {
  view.filter = 'all';
  view.query = '';
  view.day = null;
  dom.search.value = '';
  renderAll();
  announce('Filters cleared');
}

/* --------------------------------------------------------------------------
   7. Events
   -------------------------------------------------------------------------- */

let searchAnnounceTimer = null;

function handleSubmit(event) {
  event.preventDefault();

  const text = dom.input.value.trim();
  if (text === '') {
    // Defensive: `required` blocks this in the UI, but not for programmatic submits.
    dom.input.focus();
    announce('Please type a task before adding it.');
    return;
  }

  addTask(text, dom.priority.value, dom.due.value);

  // Reset the composer, keeping the keyboard in the task field for fast entry.
  dom.input.value = '';
  dom.due.value = '';
  dom.priority.value = 'normal';
  dom.input.focus();
}

function handleSearch() {
  view.query = dom.search.value.trim().toLowerCase();
  renderAll();

  window.clearTimeout(searchAnnounceTimer);
  searchAnnounceTimer = window.setTimeout(() => {
    if (view.query === '') return;
    const count = visibleTasks().length;
    announce(`${count} task${count === 1 ? '' : 's'} match “${view.query}”`);
  }, 400);
}

function handleSort() {
  view.sort = dom.sort.value;
  renderAll();
  announce(`Sorted by ${SORT_LABELS[view.sort]}`);
}

/** Global shortcuts: N for a new task, / to search, Esc to clear filters. */
function handleShortcut(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

  const target = event.target;
  const tag = target && target.tagName ? target.tagName : '';
  const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    || (target && target.isContentEditable);

  if (typing) return;

  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    dom.input.focus();
  } else if (event.key === '/') {
    event.preventDefault();
    dom.search.focus();
  } else if (event.key === 'Escape') {
    const hasFilters = view.filter !== 'all' || view.day !== null || view.query !== '';
    if (hasFilters) {
      event.preventDefault();
      clearFilters();
    }
  }
}

function bindEvents() {
  dom.form.addEventListener('submit', handleSubmit);

  Object.keys(dom.filterButtons).forEach((key) => {
    dom.filterButtons[key].addEventListener('click', () => setFilter(key));
  });

  dom.search.addEventListener('input', handleSearch);
  dom.sort.addEventListener('change', handleSort);
  dom.clearCompleted.addEventListener('click', clearCompleted);
  dom.clearFilters.addEventListener('click', clearFilters);
  dom.themeToggle.addEventListener('click', toggleTheme);

  dom.calPrev.addEventListener('click', () => shiftMonth(-1));
  dom.calNext.addEventListener('click', () => shiftMonth(1));
  dom.calToday.addEventListener('click', goToToday);
  dom.calendarTable.addEventListener('keydown', handleCalendarKeydown);

  document.addEventListener('keydown', handleShortcut);
}

/* --------------------------------------------------------------------------
   8. Initialise
   -------------------------------------------------------------------------- */

function init() {
  initTheme();

  tasks = loadTasks();
  dom.search.value = view.query;
  dom.sort.value = view.sort;

  bindEvents();
  renderAll();

  announce(tasks.length === 0
    ? 'Task manager ready. No tasks yet.'
    : `Task manager ready with ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`);
}

init();


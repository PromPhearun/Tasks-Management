const STORAGE_KEY = 'tasks-v1';
const THEME_KEY = 'theme-v1';

const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const list = document.getElementById('task-list');
const status = document.getElementById('status');
const emptyMsg = document.getElementById('empty-msg');
const filterAllBtn = document.getElementById('filter-all');
const filterActiveBtn = document.getElementById('filter-active');
const filterCompletedBtn = document.getElementById('filter-completed');
const themeToggle = document.getElementById('theme-toggle');

let filter = 'all'; // 'all' | 'active' | 'completed'

// Theme management
function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const theme = stored || preferred;
    setTheme(theme);
}

function setTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggle.textContent = '🌙';
    } else {
        document.documentElement.removeAttribute('data-theme');
        themeToggle.textContent = '☀️';
    }
    localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    announce(`Switched to ${next} mode`);
}

themeToggle.addEventListener('click', toggleTheme);

let tasks = [];

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        tasks = raw ? JSON.parse(raw) : [];
    } catch (e) {
        tasks = [];
    }
}

function announce(message) {
    status.textContent = message;
}

function render() {
    list.innerHTML = '';
    const visible = tasks.filter(t => {
        if (filter === 'active') return !t.completed;
        if (filter === 'completed') return !!t.completed;
        return true;
    });

    if (visible.length === 0) {
        emptyMsg.style.display = 'block';
        emptyMsg.textContent = tasks.length === 0 ? 'No tasks yet — add your first task above.' : 'No tasks match this filter.';
        announce('No tasks');
        return;
    }
    emptyMsg.style.display = 'none';

    visible.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.dataset.id = task.id;

        const labelWrap = document.createElement('label');
        labelWrap.className = 'label';
        labelWrap.htmlFor = `chk-${task.id}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `chk-${task.id}`;
        checkbox.checked = !!task.completed;
        checkbox.setAttribute('aria-label', `Mark ${task.text} as completed`);

        const span = document.createElement('span');
        span.className = 'task-text' + (task.completed ? ' completed' : '');
        span.textContent = task.text;

        labelWrap.appendChild(checkbox);
        labelWrap.appendChild(span);

        const meta = document.createElement('div');
        meta.className = 'meta';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon delete-btn';
        deleteBtn.type = 'button';
        deleteBtn.innerText = 'Delete';
        deleteBtn.setAttribute('aria-label', `Delete task ${task.text}`);

        meta.appendChild(deleteBtn);

        li.appendChild(labelWrap);
        li.appendChild(meta);
        list.appendChild(li);

        // Events
        checkbox.addEventListener('change', () => {
            task.completed = checkbox.checked;
            save();
            render();
            announce(task.completed ? `Completed: ${task.text}` : `Marked active: ${task.text}`);
        });

        deleteBtn.addEventListener('click', () => {
            tasks = tasks.filter(t => t.id !== task.id);
            save();
            render();
            announce(`Deleted: ${task.text}`);
        });
    });
}

function updateFilterButtons() {
    filterAllBtn.setAttribute('aria-pressed', filter === 'all');
    filterActiveBtn.setAttribute('aria-pressed', filter === 'active');
    filterCompletedBtn.setAttribute('aria-pressed', filter === 'completed');
}

filterAllBtn.addEventListener('click', () => {
    filter = 'all';
    updateFilterButtons();
    render();
    announce('Showing all tasks');
});

filterActiveBtn.addEventListener('click', () => {
    filter = 'active';
    updateFilterButtons();
    render();
    announce('Showing active tasks');
});

filterCompletedBtn.addEventListener('click', () => {
    filter = 'completed';
    updateFilterButtons();
    render();
    announce('Showing completed tasks');
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const task = { id: Date.now().toString(), text, completed: false };
    tasks.unshift(task);
    save();
    render();
    announce(`Added: ${text}`);
    input.value = '';
    input.focus();
});

// Initialize
initTheme();
load();
render();

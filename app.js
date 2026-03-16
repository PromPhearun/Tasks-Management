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
const calGrid = document.getElementById('calendar-grid');
const calMonthLabel = document.getElementById('cal-month-label');
const calPrevBtn = document.getElementById('cal-prev');
const calNextBtn = document.getElementById('cal-next');
const calDayTasks = document.getElementById('cal-day-tasks');

let filter = 'all'; // 'all' | 'active' | 'completed'
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;

// Theme management
function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const theme = stored || preferred;
    setTheme(theme);
}

function setTheme(theme) {
    const icon = themeToggle.querySelector('.theme-icon');
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (icon) icon.textContent = '🌙';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (icon) icon.textContent = '☀️';
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
            renderCalendar();
            announce(task.completed ? `Completed: ${task.text}` : `Marked active: ${task.text}`);
        });

        deleteBtn.addEventListener('click', () => {
            tasks = tasks.filter(t => t.id !== task.id);
            save();
            render();
            renderCalendar();
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
    renderCalendar();
    announce(`Added: ${text}`);
    input.value = '';
    input.focus();
});

// ── Calendar ──

function getTaskDateKey(task) {
    const d = new Date(parseInt(task.id, 10));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTasksByDate() {
    const map = {};
    tasks.forEach(t => {
        const key = getTaskDateKey(t);
        if (!map[key]) map[key] = [];
        map[key].push(t);
    });
    return map;
}

function renderCalendar() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    calMonthLabel.textContent = `${monthNames[calMonth]} ${calYear}`;

    calGrid.innerHTML = '';

    // Day-of-week headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(name => {
        const cell = document.createElement('div');
        cell.className = 'cal-header-cell';
        cell.textContent = name;
        calGrid.appendChild(cell);
    });

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();
    const tasksByDate = getTasksByDate();

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        calGrid.appendChild(empty);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-day';
        btn.textContent = day;

        const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Today highlight
        if (calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate()) {
            btn.classList.add('today');
        }

        // Selected highlight
        if (calSelectedDate === dateKey) {
            btn.classList.add('selected');
        }

        // Tasks indicator
        const dayTasks = tasksByDate[dateKey];
        if (dayTasks && dayTasks.length > 0) {
            btn.classList.add('has-tasks');
            const allCompleted = dayTasks.every(t => t.completed);
            if (allCompleted) {
                btn.classList.add('has-completed');
            }
        }

        btn.setAttribute('aria-label', `${day} ${monthNames[calMonth]} ${calYear}${dayTasks ? `, ${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''}` : ''}`);

        btn.addEventListener('click', () => {
            calSelectedDate = calSelectedDate === dateKey ? null : dateKey;
            renderCalendar();
        });

        calGrid.appendChild(btn);
    }

    // Render selected day tasks
    renderCalDayTasks(tasksByDate);
}

function renderCalDayTasks(tasksByDate) {
    calDayTasks.innerHTML = '';

    if (!calSelectedDate) return;

    const parts = calSelectedDate.split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const dateLabel = `${parseInt(parts[2], 10)} ${monthNames[parseInt(parts[1], 10) - 1]} ${parts[0]}`;

    const header = document.createElement('div');
    header.className = 'cal-day-tasks-header';
    header.textContent = `Tasks for ${dateLabel}`;
    calDayTasks.appendChild(header);

    const dayTasks = tasksByDate[calSelectedDate] || [];

    if (dayTasks.length === 0) {
        const noTasks = document.createElement('p');
        noTasks.className = 'cal-no-tasks';
        noTasks.textContent = 'No tasks on this day.';
        calDayTasks.appendChild(noTasks);
        return;
    }

    dayTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'cal-task-item';

        const statusIcon = document.createElement('span');
        statusIcon.className = 'cal-task-status';
        statusIcon.textContent = task.completed ? '✅' : '⬜';

        const text = document.createElement('span');
        text.className = 'cal-task-text' + (task.completed ? ' completed' : '');
        text.textContent = task.text;

        item.appendChild(statusIcon);
        item.appendChild(text);
        calDayTasks.appendChild(item);
    });
}

calPrevBtn.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) {
        calMonth = 11;
        calYear--;
    }
    calSelectedDate = null;
    renderCalendar();
});

calNextBtn.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) {
        calMonth = 0;
        calYear++;
    }
    calSelectedDate = null;
    renderCalendar();
});

// Initialize
initTheme();
load();
render();
renderCalendar();

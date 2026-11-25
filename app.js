// --- App state ---
let currentUser = null;
let todos = [];
let authMode = 'login';
let activeFilter = 'all';

const USERS_KEY = 'todo_users';
const SESSION_KEY = 'currentUser';
const tasksKey = (username) => `tasks_${username}`;

// --- Selectors ---
const authShell = document.getElementById('auth-shell');
const appShell = document.getElementById('app-shell');
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleAuthMode = document.getElementById('toggle-auth-mode');
const logoutBtn = document.getElementById('logout-btn');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const priorityInput = document.getElementById('priority-input');
const dueDateInput = document.getElementById('due-date-input');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');

// --- Storage ---
function loadTodos(username) {
    try {
        const storedTasks = localStorage.getItem(tasksKey(username));
        const parsedTasks = storedTasks ? JSON.parse(storedTasks) : [];
        return Array.isArray(parsedTasks) ? parsedTasks : [];
    } catch (error) {
        console.error('Không thể đọc danh sách công việc:', error);
        return [];
    }
}

function saveTodos() {
    if (!currentUser) return;

    try {
        localStorage.setItem(tasksKey(currentUser), JSON.stringify(todos));
    } catch (error) {
        console.error('Không thể lưu danh sách công việc:', error);
        alert('Không thể lưu công việc vào trình duyệt của bạn.');
    }
}

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    } catch (error) {
        return {};
    }
}

async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createSalt() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    authForm.addEventListener('submit', handleAuth);
    toggleAuthMode.addEventListener('click', toggleAuthenticationMode);
    logoutBtn.addEventListener('click', logout);
    todoForm.addEventListener('submit', addTodo);
    searchInput.addEventListener('input', renderTodos);
    sortSelect.addEventListener('change', renderTodos);

    document.querySelectorAll('.filter-tab').forEach((button) => {
        button.addEventListener('click', () => {
            activeFilter = button.dataset.filter;
            document.querySelectorAll('.filter-tab').forEach((tab) => {
                tab.classList.toggle('is-active', tab === button);
            });
            renderTodos();
        });
    });

    restoreSession();
});

function toggleAuthenticationMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    authSubmitBtn.textContent = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký';
    toggleAuthMode.textContent = authMode === 'login'
        ? 'Chưa có tài khoản? Đăng ký'
        : 'Đã có tài khoản? Đăng nhập';
}

function restoreSession() {
    const savedUser = localStorage.getItem(SESSION_KEY);
    const users = getUsers();

    if (savedUser && users[savedUser]) {
        startSession(savedUser);
    }
}

function startSession(username) {
    currentUser = username;
    todos = loadTodos(username);
    localStorage.setItem(SESSION_KEY, username);

    authShell.style.display = 'none';
    appShell.style.display = 'block';
    document.getElementById('current-user-badge').textContent = `User: ${username}`;
    renderTodos();
}

// --- Authentication ---
async function handleAuth(event) {
    event.preventDefault();

    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;
    if (!username || !password) return;

    const users = getUsers();
    if (authMode === 'register') {
        if (users[username]) {
            alert('Người dùng đã tồn tại!');
            return;
        }

        const salt = createSalt();
        users[username] = {
            createdAt: new Date().toISOString(),
            salt,
            passwordHash: await hashPassword(password, salt)
        };
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        startSession(username);
        return;
    }

    if (!users[username]) {
        alert('Tên đăng nhập không tồn tại. Hãy đăng ký tài khoản trước.');
        return;
    }

    // Tài khoản tạo bởi bản trước chưa có mật khẩu: thiết lập mật khẩu ở lần đăng nhập đầu tiên.
    if (!users[username].passwordHash) {
        const salt = createSalt();
        users[username].salt = salt;
        users[username].passwordHash = await hashPassword(password, salt);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        alert('Mật khẩu cho tài khoản cũ đã được thiết lập.');
        startSession(username);
        return;
    }

    const passwordHash = await hashPassword(password, users[username].salt);
    if (passwordHash !== users[username].passwordHash) {
        alert('Sai mật khẩu!');
        return;
    }

    startSession(username);
}

// --- Todo logic ---
function addTodo(event) {
    event.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;

    todos.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        completed: false,
        priority: priorityInput.value,
        dueDate: dueDateInput.value,
        createdAt: new Date().toISOString()
    });

    todoInput.value = '';
    priorityInput.value = 'medium';
    dueDateInput.value = '';
    saveTodos();
    renderTodos();
}

function toggleTodo(id) {
    const todo = todos.find((item) => item.id === id);
    if (!todo) return;

    todo.completed = !todo.completed;
    saveTodos();
    renderTodos();
}

function deleteTodo(id) {
    todos = todos.filter((item) => item.id !== id);
    saveTodos();
    renderTodos();
}

function getVisibleTodos() {
    const query = searchInput.value.trim().toLocaleLowerCase('vi');
    const priorityRank = { high: 0, medium: 1, low: 2 };

    return todos
        .filter((todo) => {
            const matchesFilter = matchesActiveFilter(todo);
            const matchesSearch = !query || todo.text.toLocaleLowerCase('vi').includes(query);
            return matchesFilter && matchesSearch;
        })
        .slice()
        .sort((first, second) => {
            if (sortSelect.value === 'priority') {
                return (priorityRank[first.priority] ?? priorityRank.medium)
                    - (priorityRank[second.priority] ?? priorityRank.medium);
            }
            if (sortSelect.value === 'due-date') {
                return (first.dueDate || '9999-12-31').localeCompare(second.dueDate || '9999-12-31');
            }
            if (sortSelect.value === 'newest') {
                return new Date(second.createdAt || 0) - new Date(first.createdAt || 0);
            }
            return 0;
        });
}

function matchesActiveFilter(todo) {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'completed') return todo.completed;
    if (activeFilter === 'active') return !todo.completed;
    if (activeFilter === 'overdue') return isOverdue(todo);
    if (activeFilter === 'high') return !todo.completed && todo.priority === 'high';
    return true;
}

function getStartOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function getDueDateValue(dueDate) {
    if (!dueDate) return null;

    const date = new Date(`${dueDate}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getDaysUntilDue(dueDate) {
    const due = getDueDateValue(dueDate);
    if (!due) return null;

    return Math.round((due - getStartOfToday()) / 86_400_000);
}

function isOverdue(todo) {
    const daysUntilDue = getDaysUntilDue(todo.dueDate);
    return !todo.completed && daysUntilDue !== null && daysUntilDue < 0;
}

function getDeadlineDetails(todo) {
    const daysUntilDue = getDaysUntilDue(todo.dueDate);
    if (daysUntilDue === null) return null;

    const dateLabel = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(getDueDateValue(todo.dueDate));

    if (todo.completed) return { label: `Hạn: ${dateLabel}`, status: 'completed' };
    if (daysUntilDue < 0) {
        const daysOverdue = Math.abs(daysUntilDue);
        return { label: `Quá hạn ${daysOverdue} ngày`, status: 'overdue' };
    }
    if (daysUntilDue === 0) return { label: 'Hạn hôm nay', status: 'today' };
    if (daysUntilDue === 1) return { label: 'Hạn ngày mai', status: 'upcoming' };
    return { label: `Còn ${daysUntilDue} ngày · ${dateLabel}`, status: 'upcoming' };
}

function renderTodos() {
    const visibleTodos = getVisibleTodos();
    todoList.replaceChildren();

    visibleTodos.forEach((todo) => {
        const item = document.createElement('li');
        item.className = `todo-item${todo.completed ? ' is-completed' : ''}${isOverdue(todo) ? ' is-overdue' : ''}`;

        const main = document.createElement('div');
        main.className = 'todo-main';

        const label = document.createElement('label');
        label.className = 'todo-checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = todo.completed;
        checkbox.setAttribute('aria-label', `Đánh dấu hoàn thành: ${todo.text}`);
        checkbox.addEventListener('change', () => toggleTodo(todo.id));
        const checkmark = document.createElement('span');
        checkmark.className = 'checkmark';
        checkmark.textContent = '✓';
        label.append(checkbox, checkmark);

        const content = document.createElement('div');
        content.className = 'todo-content';
        const text = document.createElement('p');
        text.className = 'todo-text';
        text.textContent = todo.text;
        content.append(text);

        const meta = document.createElement('div');
        meta.className = 'todo-meta';
        const priority = document.createElement('span');
        priority.className = `priority-badge priority-${todo.priority || 'medium'}`;
        priority.textContent = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }[todo.priority] || 'Trung bình';
        meta.append(priority);

        if (todo.dueDate) {
            const deadline = getDeadlineDetails(todo);
            if (deadline) {
                const dueDate = document.createElement('span');
                dueDate.className = `due-badge is-${deadline.status}`;
                dueDate.textContent = `📅 ${deadline.label}`;
                dueDate.title = `Hạn chót: ${todo.dueDate}`;
                meta.append(dueDate);
            }
        }

        content.append(meta);
        main.append(label, content);

        const actions = document.createElement('div');
        actions.className = 'todo-actions';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'icon-btn delete-btn';
        removeButton.textContent = '🗑️';
        removeButton.setAttribute('aria-label', `Xóa công việc: ${todo.text}`);
        removeButton.addEventListener('click', () => deleteTodo(todo.id));
        actions.append(removeButton);

        item.append(main, actions);
        todoList.append(item);
    });

    emptyState.style.display = visibleTodos.length ? 'none' : 'block';
    updateStatistics();
}

function updateStatistics() {
    const total = todos.length;
    const completed = todos.filter((todo) => todo.completed).length;
    const active = total - completed;
    const highPriority = todos.filter((todo) => !todo.completed && todo.priority === 'high').length;
    const dueToday = todos.filter((todo) => !todo.completed && getDaysUntilDue(todo.dueDate) === 0).length;
    const overdue = todos.filter(isOverdue).length;
    const percentage = total ? Math.round((completed / total) * 100) : 0;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-done').textContent = completed;
    document.getElementById('stat-high').textContent = highPriority;
    document.getElementById('stat-today').textContent = dueToday;
    document.getElementById('stat-overdue').textContent = overdue;
    document.getElementById('progress-percent').textContent = `${percentage}%`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;
}

function logout() {
    currentUser = null;
    todos = [];
    localStorage.removeItem(SESSION_KEY);
    authForm.reset();
    authShell.style.display = 'flex';
    appShell.style.display = 'none';
}
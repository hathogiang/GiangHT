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
function handleAuth(event) {
    event.preventDefault();

    const username = document.getElementById('username-input').value.trim();
    if (!username) return;

    const users = getUsers();
    if (authMode === 'register') {
        if (users[username]) {
            alert('Người dùng đã tồn tại!');
            return;
        }

        users[username] = { createdAt: new Date().toISOString() };
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        startSession(username);
        return;
    }

    if (!users[username]) {
        alert('Tên đăng nhập không tồn tại. Hãy đăng ký tài khoản trước.');
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
            const matchesFilter = activeFilter === 'all'
                || (activeFilter === 'completed' ? todo.completed : !todo.completed);
            const matchesSearch = !query || todo.text.toLocaleLowerCase('vi').includes(query);
            return matchesFilter && matchesSearch;
        })
        .slice()
        .sort((first, second) => {
            if (sortSelect.value === 'priority') {
                return priorityRank[first.priority] - priorityRank[second.priority];
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

function renderTodos() {
    const visibleTodos = getVisibleTodos();
    todoList.replaceChildren();

    visibleTodos.forEach((todo) => {
        const item = document.createElement('li');
        item.className = `todo-item${todo.completed ? ' is-completed' : ''}`;

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
            const dueDate = document.createElement('span');
            dueDate.className = 'due-badge';
            dueDate.textContent = `Hạn: ${todo.dueDate}`;
            meta.append(dueDate);
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
    const percentage = total ? Math.round((completed / total) * 100) : 0;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-done').textContent = completed;
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
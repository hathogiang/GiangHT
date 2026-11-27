// --- App state ---
let currentUser = null;
let todos = [];
let authMode = 'login';
let activeFilter = 'all';
let supabaseClient = null;
let loadingUserId = null;

const LEGACY_TASK_PREFIX = 'tasks_';

// --- Selectors ---
const authShell = document.getElementById('auth-shell');
const appShell = document.getElementById('app-shell');
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleAuthMode = document.getElementById('toggle-auth-mode');
const logoutBtn = document.getElementById('logout-btn');
const exitBtn = document.getElementById('exit-btn');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const priorityInput = document.getElementById('priority-input');
const dueDateInput = document.getElementById('due-date-input');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const appStatus = document.getElementById('app-status');
const syncStatus = document.getElementById('sync-status');
const legacyImport = document.getElementById('legacy-import');
const legacySource = document.getElementById('legacy-source');
const importLegacyButton = document.getElementById('import-legacy-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    authForm.addEventListener('submit', handleAuth);
    toggleAuthMode.addEventListener('click', toggleAuthenticationMode);
    logoutBtn.addEventListener('click', logout);
    exitBtn.addEventListener('click', exitApp);
    todoForm.addEventListener('submit', addTodo);
    searchInput.addEventListener('input', renderTodos);
    sortSelect.addEventListener('change', renderTodos);
    importLegacyButton.addEventListener('click', importLegacyTodos);

    document.querySelectorAll('.filter-tab').forEach((button) => {
        button.addEventListener('click', () => {
            activeFilter = button.dataset.filter;
            document.querySelectorAll('.filter-tab').forEach((tab) => {
                tab.classList.toggle('is-active', tab === button);
            });
            renderTodos();
        });
    });

    const config = window.SUPABASE_CONFIG;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        showConfigError('Không tải được thư viện Supabase từ CDN. Hãy kiểm tra kết nối mạng hoặc CDN.');
        return;
    }
    if (!config || typeof config.url !== 'string' || typeof config.anonKey !== 'string'
        || !config.url || !config.anonKey
        || config.url.includes('YOUR_') || config.anonKey.includes('YOUR_')) {
        showConfigError('Chưa cấu hình Supabase. Hãy điền project URL và anon/publishable key trong supabase-config.js.');
        return;
    }
    try {
        const projectUrl = new URL(config.url);
        if (!['https:', 'http:'].includes(projectUrl.protocol)) throw new Error('URL không hợp lệ.');
        supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    } catch (error) {
        showConfigError(`Cấu hình Supabase không hợp lệ: ${error.message}`);
        return;
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => setAuthenticatedUser(session ? session.user : null), 0);
    });
    restoreSession();
}

function showConfigError(message) {
    authSubmitBtn.disabled = true;
    toggleAuthMode.disabled = true;
    showStatus(appStatus, message, true);
}

function showStatus(element, message, isError) {
    element.textContent = message;
    element.classList.toggle('is-error', Boolean(isError));
    element.classList.toggle('is-visible', Boolean(message));
}

function toggleAuthenticationMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    authSubmitBtn.textContent = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký';
    document.getElementById('password-input').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    toggleAuthMode.textContent = authMode === 'login'
        ? 'Chưa có tài khoản? Đăng ký'
        : 'Đã có tài khoản? Đăng nhập';
    showStatus(appStatus, '', false);
}

async function restoreSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        showStatus(appStatus, `Không thể khôi phục phiên Supabase: ${error.message}`, true);
        return;
    }
    await setAuthenticatedUser(data.session ? data.session.user : null);
}

async function setAuthenticatedUser(user, forceReload) {
    if (!user) {
        if (!currentUser) return;
        currentUser = null;
        todos = [];
        loadingUserId = null;
        authShell.style.display = 'flex';
        appShell.style.display = 'none';
        legacyImport.hidden = true;
        return;
    }
    if (currentUser && currentUser.id === user.id
        && (loadingUserId === user.id || (!forceReload && loadingUserId === null))) return;

    currentUser = user;
    loadingUserId = user.id;
    todos = [];
    authShell.style.display = 'none';
    appShell.style.display = 'block';
    document.getElementById('current-user-badge').textContent = user.email || '';
    todoForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = true; });
    showStatus(syncStatus, 'Đang tải công việc từ Supabase…', false);
    renderTodos();

    const { data, error } = await supabaseClient
        .from('todos')
        .select('id, text, completed, priority, due_date, created_at')
        .order('created_at', { ascending: true });
    if (!currentUser || currentUser.id !== user.id) return;
    if (error) {
        loadingUserId = null;
        emptyState.style.display = 'none';
        showStatus(syncStatus, `Không tải được dữ liệu. Kiểm tra bảng/RLS trong Supabase rồi tải lại trang: ${error.message}`, true);
        return;
    }
    todos = data.map((row) => ({
        id: row.id,
        text: row.text,
        completed: row.completed,
        priority: row.priority,
        dueDate: row.due_date || '',
        createdAt: row.created_at
    }));
    todoForm.querySelectorAll('input, select, button').forEach((control) => { control.disabled = false; });
    loadingUserId = null;
    showStatus(syncStatus, 'Đã đồng bộ với Supabase.', false);
    renderTodos();
    prepareLegacyImport();
}

// --- Authentication ---
async function handleAuth(event) {
    event.preventDefault();
    if (!supabaseClient) return;

    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;
    authSubmitBtn.disabled = true;
    showStatus(appStatus, authMode === 'login' ? 'Đang đăng nhập…' : 'Đang tạo tài khoản…', false);

    const result = authMode === 'login'
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    authSubmitBtn.disabled = false;
    if (result.error) {
        showStatus(appStatus, `Không thể ${authMode === 'login' ? 'đăng nhập' : 'đăng ký'}: ${result.error.message}`, true);
        return;
    }
    if (authMode === 'register' && !result.data.session) {
        showStatus(appStatus, 'Đăng ký thành công. Hãy xác nhận email theo thư Supabase gửi đến bạn, rồi đăng nhập.', false);
    } else {
        showStatus(appStatus, '', false);
    }
}

async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) showStatus(syncStatus, `Không thể đăng xuất: ${error.message}`, true);
}

function getLegacyTasks(storageKey) {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(parsed) ? parsed.filter((task) => task && typeof task.text === 'string' && task.text.trim()) : [];
    } catch (error) {
        console.error('Không thể đọc dữ liệu cũ:', error);
        return [];
    }
}

function prepareLegacyImport() {
    legacySource.replaceChildren();
    let keys = [];
    try {
        keys = Object.keys(localStorage).filter((key) => key.startsWith(LEGACY_TASK_PREFIX));
    } catch (error) {
        showStatus(syncStatus, 'Trình duyệt không cho phép đọc dữ liệu cũ để nhập.', true);
        return;
    }
    let options = [];
    try {
        options = keys.map((key) => ({ key, tasks: getLegacyTasks(key) }))
            .filter((source) => source.tasks.length && !localStorage.getItem(`todo_imported_${currentUser.id}_${source.key}`));
    } catch (error) {
        showStatus(syncStatus, 'Không thể kiểm tra trạng thái nhập dữ liệu cũ trong bộ nhớ trình duyệt.', true);
        return;
    }
    options.forEach((source) => {
        const option = document.createElement('option');
        option.value = source.key;
        option.textContent = `${source.key.slice(LEGACY_TASK_PREFIX.length)} (${source.tasks.length} công việc)`;
        legacySource.append(option);
    });
    legacyImport.hidden = options.length === 0;
}

async function importLegacyTodos() {
    if (!currentUser || !legacySource.value) return;
    const storageKey = legacySource.value;
    const oldName = storageKey.slice(LEGACY_TASK_PREFIX.length);
    const tasks = getLegacyTasks(storageKey);
    if (!tasks.length) {
        showStatus(syncStatus, 'Danh sách cũ không có công việc hợp lệ để nhập.', true);
        return;
    }
    if (!window.confirm(`Nhập ${tasks.length} công việc từ danh sách “${oldName}” vào tài khoản ${currentUser.email}? Dữ liệu cũ sẽ được giữ nguyên trên trình duyệt này.`)) return;

    importLegacyButton.disabled = true;
    const rows = tasks.map((task) => ({
        user_id: currentUser.id,
        text: task.text.trim(),
        completed: Boolean(task.completed),
        priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || '') ? task.dueDate : null,
        created_at: task.createdAt && !Number.isNaN(Date.parse(task.createdAt)) ? task.createdAt : new Date().toISOString()
    }));
    const { error } = await supabaseClient.from('todos').insert(rows);
    importLegacyButton.disabled = false;
    if (error) {
        showStatus(syncStatus, `Không nhập được dữ liệu cũ: ${error.message}`, true);
        return;
    }
    try {
        localStorage.setItem(`todo_imported_${currentUser.id}_${storageKey}`, 'true');
    } catch (storageError) {
        console.error('Không thể ghi dấu dữ liệu đã nhập:', storageError);
        showStatus(syncStatus, 'Đã nhập dữ liệu nhưng không lưu được dấu nhập trên trình duyệt. Tránh nhập lại để không tạo bản sao.', true);
    }
    await setAuthenticatedUser(currentUser, true);
}

// --- Todo logic ---
async function addTodo(event) {
    event.preventDefault();
    const text = todoInput.value.trim();
    if (!text || !currentUser || loadingUserId) return;

    const row = {
        user_id: currentUser.id,
        text,
        completed: false,
        priority: priorityInput.value,
        due_date: dueDateInput.value || null
    };
    const submitButton = todoForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    const { data, error } = await supabaseClient.from('todos').insert(row)
        .select('id, text, completed, priority, due_date, created_at').single();
    submitButton.disabled = false;
    if (error) {
        showStatus(syncStatus, `Không lưu được công việc: ${error.message}`, true);
        return;
    }

    todos.push({
        id: data.id,
        text: data.text,
        completed: data.completed,
        priority: data.priority,
        dueDate: data.due_date || '',
        createdAt: data.created_at
    });
    todoInput.value = '';
    priorityInput.value = 'medium';
    dueDateInput.value = '';
    showStatus(syncStatus, 'Đã lưu và đồng bộ công việc.', false);
    renderTodos();
}

async function toggleTodo(id) {
    const todo = todos.find((item) => item.id === id);
    if (!todo || !currentUser) return;

    const completed = !todo.completed;
    const { error } = await supabaseClient.from('todos')
        .update({ completed })
        .eq('id', id)
        .eq('user_id', currentUser.id);
    if (error) {
        showStatus(syncStatus, `Không cập nhật được công việc: ${error.message}`, true);
        renderTodos();
        return;
    }
    todo.completed = completed;
    showStatus(syncStatus, 'Đã đồng bộ thay đổi.', false);
    renderTodos();
}

async function deleteTodo(id) {
    if (!currentUser) return;
    const { error } = await supabaseClient.from('todos')
        .delete()
        .eq('id', id)
        .eq('user_id', currentUser.id);
    if (error) {
        showStatus(syncStatus, `Không xóa được công việc: ${error.message}`, true);
        return;
    }
    todos = todos.filter((item) => item.id !== id);
    showStatus(syncStatus, 'Đã xóa và đồng bộ công việc.', false);
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

function exitApp() {
    if (!window.confirm('Bạn có muốn thoát khỏi trang không?')) return;

    window.close();

    // Trình duyệt thường không cho đóng tab do người dùng tự mở.
    // Khi đó, thay trang bằng trang trống để người dùng thoát khỏi ứng dụng.
    window.setTimeout(() => {
        if (!document.hidden) {
            window.location.replace('about:blank');
        }
    }, 100);
}
// --- App State ---
let currentUser = null;
let encryptionKey = null;
let todos = [];
let authMode = 'login'; // 'login' or 'register'

// --- Selectors ---
const authShell = document.getElementById('auth-shell');
const appShell = document.getElementById('app-shell');
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleAuthMode = document.getElementById('toggle-auth-mode');
const logoutBtn = document.getElementById('logout-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Basic Auth UI setup
    authForm.addEventListener('submit', handleAuth);
    toggleAuthMode.addEventListener('click', () => {
        authMode = authMode === 'login' ? 'register' : 'login';
        authSubmitBtn.textContent = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký';
        toggleAuthMode.textContent = authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
    });
    logoutBtn.addEventListener('click', logout);
});

// --- Crypto Service (Simplistic implementation) ---
// --- Crypto Service (Full Implementation) ---
async function encryptData(data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        encryptionKey,
        encodedData
    );
    return {
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
}

async function decryptData(encryptedPayload) {
    const iv = new Uint8Array(atob(encryptedPayload.iv).split("").map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(encryptedPayload.ciphertext).split("").map(c => c.charCodeAt(0)));
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        encryptionKey,
        ciphertext
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
}

async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// --- Auth Logic ---
async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('username-input').value.trim();
    const password = document.getElementById('password-input').value;

    if (authMode === 'register') {
        const users = JSON.parse(localStorage.getItem('todo_users') || '{}');
        if (users[username]) {
            alert('Người dùng đã tồn tại!');
            return;
        }
        users[username] = { salt: Math.random().toString(36).substring(7) };
        localStorage.setItem('todo_users', JSON.stringify(users));
        alert('Đăng ký thành công! Hãy đăng nhập.');
        authMode = 'login';
        return;
    }

    const users = JSON.parse(localStorage.getItem('todo_users') || '{}');
    if (!users[username]) {
        alert('Sai tên đăng nhập hoặc mật khẩu!');
        return;
    }

    try {
        encryptionKey = await deriveKey(password, users[username].salt);
        const encrypted = JSON.parse(localStorage.getItem(`todo_data_${username}`));
        
        if (encrypted) {
            todos = await decryptData(encrypted);
        } else {
            todos = [];
        }

        currentUser = username;
        authShell.style.display = 'none';
        appShell.style.display = 'block';
        document.getElementById('current-user-badge').textContent = `User: ${username}`;
        renderTodos();
    } catch (err) {
        alert('Sai mật khẩu!');
    }
}

// Helper to save encrypted data
async function saveTodos() {
    if (!currentUser || !encryptionKey) return;
    const encrypted = await encryptData(todos);
    localStorage.setItem(`todo_data_${currentUser}`, JSON.stringify(encrypted));
}

// --- Todo Logic ---
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');

todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;
    
    todos.push({
        id: Date.now(),
        text: text,
        completed: false
    });
    todoInput.value = '';
    saveTodos();
    renderTodos();
});

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodos();
        renderTodos();
    }
}

function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    renderTodos();
}

function renderTodos() {
    todoList.innerHTML = todos.map(t => `
        <li class="todo-item ${t.completed ? 'is-completed' : ''}">
            <div class="todo-main">
                <label class="todo-checkbox">
                    <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTodo(${t.id})">
                    <span class="checkmark"></span>
                </label>
                <span class="todo-text">${t.text}</span>
            </div>

// --- Option 3: Security Features (Auto-Lock) ---
let autoLockTimer;

function resetAutoLockTimer() {
    clearTimeout(autoLockTimer);
    // Tự động đăng xuất sau 15 phút (900,000 ms)
    autoLockTimer = setTimeout(logout, 15 * 60 * 1000);
}

// Theo dõi các tương tác người dùng
['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
    document.addEventListener(event, resetAutoLockTimer);
});

            <button class="icon-btn delete-btn" onclick="deleteTodo(${t.id})">🗑️</button>
        </li>
    `).join('');
}



function logout() {
    currentUser = null;
    encryptionKey = null;
    todos = [];
    authShell.style.display = 'block';
    appShell.style.display = 'none';
    document.getElementById('username-input').value = '';
    document.getElementById('password-input').value = '';
}

function renderTodos() {
    const list = document.getElementById('todo-list');
    list.innerHTML = todos.map((t, i) => `<li>${t.text}</li>`).join('');
}

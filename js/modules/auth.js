import { getSupabase } from './supabase-client.js';

export let currentUser = null;

export async function checkUserSession(onUserChanged) {
    const supabase = getSupabase();
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            await supabase.auth.signOut();
            currentUser = null;
        } else {
            currentUser = session ? session.user : null;
        }

        onUserChanged(currentUser);
    } catch (err) {
        console.error("Gagal memproses sesi:", err.message);
        currentUser = null;
        onUserChanged(null);
    }
}

function internalToggleMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) {
        menu.classList.toggle('display-none');
    }
}

export function updateAuthUI(user, toggleUserMenu, handleLogout, handleLogin) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    let authBtn = document.getElementById('auth-nav-btn');
    if (!authBtn) {
        authBtn = document.createElement('div');
        authBtn.id = 'auth-nav-btn';
        authBtn.className = 'nav-translate';
        nav.appendChild(authBtn);
    }

    if (user) {
        const isAdmin = user.user_metadata?.role === 'admin';
        authBtn.innerHTML = `
            <div class="user-profile-nav" id="profile-trigger">
                <img src="${user.user_metadata?.avatar_url || 'https://placehold.co/30'}" class="nav-avatar">
                <span class="notification-badge display-none" id="noti-badge"></span>
            </div>
            <div id="user-menu" class="user-menu-dropdown display-none">
                <p>Halo, <strong>${user.user_metadata?.full_name || 'User'}</strong></p>
                <hr>
                ${isAdmin ? '<a href="admin.html"><i class="fas fa-user-shield"></i> Dashboard Admin</a>' : ''}
                <a href="#" id="logout-link"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </div>
        `;
        document.getElementById('profile-trigger')?.addEventListener('click', internalToggleMenu);
        document.getElementById('logout-link')?.addEventListener('click', handleLogout);
    } else {
        authBtn.innerHTML = `<button id="login-btn" class="btn-read text-xs p-5 px-15">Login</button>`;
        document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    }
}

export async function login() {
    const redirectUrl = window.location.origin + window.location.pathname;
    await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl }
    });
}

export async function logout() {
    await getSupabase().auth.signOut();
}
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

export function updateAuthUI(user, handleLogout, handleLogin) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const notifWrapper = document.getElementById('notif-wrapper');
    let loginBtn = document.getElementById('login-btn');

    if (!loginBtn) {
        loginBtn = document.createElement('button');
        loginBtn.id = 'login-btn';
        loginBtn.className = 'btn-read text-xs p-5 px-15';
        loginBtn.innerText = 'Login';
        nav.querySelector('.nav-right-actions')?.appendChild(loginBtn);
    }

    if (user) {
        notifWrapper?.classList.remove('display-none');
        loginBtn.classList.add('display-none');
    } else {
        notifWrapper?.classList.add('display-none');
        loginBtn.classList.remove('display-none');
        loginBtn.onclick = handleLogin;
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
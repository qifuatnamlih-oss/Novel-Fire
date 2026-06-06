import { initSupabase } from './modules/supabase-client.js';
import * as AuthService from './modules/auth.js';
import * as DataService from './modules/data-service.js';

// Inisialisasi Google Translate tetap global agar SDK Google bisa memanggilnya
window.googleTranslateElementInit = function() {
    new google.translate.TranslateElement({
        pageLanguage: 'id',
        includedLanguages: 'en,zh-CN,ja,id',
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
    }, 'google_translate_element');
}

// Utilitas Caching Sederhana
const AppCache = {
    set(key, data, ttlMinutes = 15) {
        const expiry = Date.now() + (ttlMinutes * 60 * 1000);
        localStorage.setItem(`cache_${key}`, JSON.stringify({ data, expiry }));
    },
    get(key) {
        const itemStr = localStorage.getItem(`cache_${key}`);
        if (!itemStr) return null;
        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }
        return item.data;
    },
    clearAll() {
        Object.keys(localStorage)
            .filter(key => key.startsWith('cache_'))
            .forEach(key => localStorage.removeItem(key));
        console.log('AppCache: Local storage cache dibersihkan.');
    }
};

async function bootstrap() {
    const initialized = await initSupabase();
    if (!initialized) return;

    // Manajemen Sesi
    await AuthService.checkUserSession((user) => {
        AuthService.updateAuthUI(
            user, 
            AuthService.toggleUserMenu, 
            AuthService.logout, 
            AuthService.login
        );
    });

    // Load Data Awal
    await DataService.loadGlobalData();

    // PWA & UI Global
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    // Deteksi Halaman & Inisialisasi UI Spesifik
    initRouter();
}

function initRouter() {
    const path = window.location.pathname;
    
    // Panggil modul rendering sesuai route
    if (document.getElementById('novel-grid')) {
        console.log("Inisialisasi Home Page...");
        // Panggil fungsi rendering home dari modul rendering
    }
    
    if (document.getElementById('novel-detail')) {
        console.log("Inisialisasi Detail Page...");
        const urlParams = new URLSearchParams(window.location.search);
        const novelId = urlParams.get('id');
        
        // Contoh penggunaan cache:
        const cachedNovel = AppCache.get(`novel_${novelId}`);
        if (cachedNovel) {
            console.log("Memuat detail novel dari cache...");
            // renderNovelDetail(cachedNovel); // Panggil fungsi render Anda
        }
    }

    if (document.getElementById('read-container')) {
        console.log("Inisialisasi Reader Page...");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

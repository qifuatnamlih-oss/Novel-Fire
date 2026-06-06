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

const state = {
    currentCategory: 'all'
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

    // Setup UI Global
    setupCategoryFilters();

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
        renderHome();
    }
    
    const detailContainer = document.getElementById('novel-detail');
    if (detailContainer) {
        console.log("Inisialisasi Detail Page...");
        const urlParams = new URLSearchParams(window.location.search);
        const novelId = parseInt(urlParams.get('id'));
        if (novelId) loadAndRenderDetail(novelId);
    }

    const readContainer = document.getElementById('read-container');
    if (readContainer) {
        console.log("Inisialisasi Reader Page...");
        loadAndRenderReader();
    }
}

function renderHome() {
    const grid = document.getElementById('novel-grid');
    if (!grid) return;

    // Bersihkan kontainer (menghapus skeleton/loading jika ada)
    grid.innerHTML = '';

    let novelsToRender = DataService.getNovels();
    if (state.currentCategory !== 'all') {
        novelsToRender = novelsToRender.filter(n => n.category === state.currentCategory);
    }

    if (!novelsToRender || novelsToRender.length === 0) {
        grid.innerHTML = '<p style="text-align:center; width:100%; padding:20px;">Tidak ada novel yang ditemukan.</p>';
        return;
    }

    // Generate HTML untuk setiap novel
    grid.innerHTML = novelsToRender.map(novel => `
        <div class="novel-card" onclick="location.href='detail.html?id=${novel.id}'">
            <button class="fav-btn" onclick="event.stopPropagation();">
                <i class="far fa-heart"></i>
            </button>
            <img src="${novel.image || 'https://via.placeholder.com/150x200'}" alt="${novel.title}" loading="lazy">
            <h3>${novel.title}</h3>
            <p class="author-link">${novel.author || 'Anonim'}</p>
            <div class="rating">
                <i class="fas fa-star"></i> 4.5
            </div>
        </div>
    `).join('');
}

async function loadAndRenderDetail(id) {
    const detailContainer = document.getElementById('novel-detail');
    if (!detailContainer) return;

    const novel = await DataService.fetchNovelDetail(id);
    if (!novel) {
        detailContainer.innerHTML = '<p>Novel tidak ditemukan.</p>';
        return;
    }

    detailContainer.innerHTML = `
        <div class="detail-header">
            <img src="${novel.image || 'https://via.placeholder.com/250x350'}" alt="${novel.title}">
            <div class="detail-info">
                <h1>${novel.title}</h1>
                <span class="tag">${novel.category}</span>
                <p><strong>Penulis:</strong> ${novel.author || 'Anonim'}</p>
                <div class="rating"><i class="fas fa-star"></i> 4.5</div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button class="btn-read" onclick="location.href='read.html?id=${novel.id}&ch=0'">Mulai Membaca</button>
                </div>
            </div>
        </div>
        <div class="chapter-section">
            <h3>Daftar Bab</h3>
            <ul class="chapter-list">
                ${(novel.chapters || []).map((ch, index) => `
                    <li class="chapter-item" onclick="location.href='read.html?id=${novel.id}&ch=${index}'">
                        <span>${ch.title}</span>
                        <i class="fas fa-chevron-right"></i>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

async function loadAndRenderReader() {
    const container = document.getElementById('read-container');
    const urlParams = new URLSearchParams(window.location.search);
    const novelId = parseInt(urlParams.get('id'));
    const chapterIdx = parseInt(urlParams.get('ch') || 0);

    const novel = await DataService.fetchNovelDetail(novelId);
    if (!novel || !novel.chapters || !novel.chapters[chapterIdx]) return;

    const chapter = novel.chapters[chapterIdx];
    container.innerHTML = `
        <div class="read-header">
            <h2>${novel.title}</h2>
            <h3>${chapter.title}</h3>
        </div>
        <div class="read-content">
            ${chapter.content.split('\n').map(p => `<p>${p}</p>`).join('')}
        </div>
    `;
}

function setupCategoryFilters() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            state.currentCategory = e.currentTarget.dataset.category;
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderHome();
        });
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);

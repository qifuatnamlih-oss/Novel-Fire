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
        try {
        const expiry = Date.now() + (ttlMinutes * 60 * 1000);
        localStorage.setItem(`cache_${key}`, JSON.stringify({ data, expiry }));
        } catch (e) { console.warn("AppCache: Gagal menulis ke localStorage (mungkin diblokir browser)"); }
    },
    get(key) {
        try {
        const itemStr = localStorage.getItem(`cache_${key}`);
        if (!itemStr) return null;
        const item = JSON.parse(itemStr);
        if (Date.now() > item.expiry) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }
        return item.data;
        } catch (e) { return null; }
    },
    clearAll() {
        Object.keys(localStorage)
            .filter(key => key.startsWith('cache_'))
            .forEach(key => localStorage.removeItem(key));
        console.log('AppCache: Local storage cache dibersihkan.');
    }
};

// Ekspos AppCache ke global agar bisa digunakan oleh admin-logic.js
window.AppCache = AppCache;

const state = {
    currentCategory: 'all'
};

async function bootstrap() {
    console.log("Bootstrap: Starting initialization...");
    const initialized = await initSupabase();
    if (!initialized) {
        console.error("Bootstrap: Supabase initialization failed. Exiting bootstrap.");
        return;
    }
    console.log("Bootstrap: Supabase initialized successfully.");

    // Manajemen Sesi
    await AuthService.checkUserSession((user) => {
        AuthService.updateAuthUI(
            user,
            AuthService.toggleUserMenu,
            AuthService.logout,
            AuthService.login
        );
        console.log("Bootstrap: User session checked. User:", user ? user.id : "Guest");
    });

    // Load Data Awal
    console.log("Bootstrap: Loading global data...");
    await DataService.loadGlobalData();
    const novelsLoaded = DataService.getNovels();
    console.log(`Bootstrap: Global data loaded. Found ${novelsLoaded ? novelsLoaded.length : 0} novels.`);

    // Setup UI Global
    setupCategoryFilters();

    // Accessibility: Fix missing titles in third-party iframes (Translate/Ads)
    observeIframeAccessibility();
    setupReadingProgress();

    // PWA & UI Global
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }
    console.log("Bootstrap: Service Worker registration attempted.");

    // Deteksi Halaman & Inisialisasi UI Spesifik
    console.log("Bootstrap: Initializing router...");
    initRouter();
    console.log("Bootstrap: Bootstrap complete.");
}

function initRouter() {
    const path = window.location.pathname;
    console.log(`Router: Current path is ${path}`);
    let routeMatched = false;

    // Panggil modul rendering sesuai route
    if (document.getElementById('novel-grid')) {
        console.log("Router: 'novel-grid' element found. Initializing Home Page...");
        renderHome();
        routeMatched = true;
    } else {
        console.log("Router: 'novel-grid' element NOT found.");
    }

    const detailContainer = document.getElementById('novel-detail');
    if (detailContainer) {
        console.log("Router: 'novel-detail' element found. Initializing Detail Page...");
        const urlParams = new URLSearchParams(window.location.search);
        const novelId = parseInt(urlParams.get('id'));
        if (novelId) {
            console.log(`Router: Novel ID for detail page is ${novelId}.`);
            loadAndRenderDetail(novelId);
        } else {
            console.warn("Router: Novel ID not found in URL for detail page. Displaying placeholder.");
            detailContainer.innerHTML = '<p style="text-align:center; padding:20px;">ID Novel tidak ditemukan di URL.</p>';
        }
        routeMatched = true;
    } else {
        console.log("Router: 'novel-detail' element NOT found.");
    }

    const readContainer = document.getElementById('read-container');
    if (readContainer) {
        console.log("Router: 'read-container' element found. Initializing Reader Page...");
        loadAndRenderReader();
        routeMatched = true;
    } else {
        console.log("Router: 'read-container' element NOT found.");
    }

    if (!routeMatched) {
        console.warn(`Router: No specific UI element (novel-grid, novel-detail, read-container) found for path ${path}.`);
    }
}

function renderHome() {
    const grid = document.getElementById('novel-grid');
    if (!grid) {
        console.error("renderHome: novel-grid element not found.");
        return;
    }
    console.log("renderHome: Starting to render home page content.");

    // Bersihkan kontainer (menghapus skeleton/loading jika ada)
    grid.innerHTML = '';

    let novelsToRender = DataService.getNovels();
    console.log(`renderHome: Found ${novelsToRender ? novelsToRender.length : 0} novels from DataService.`);
    if (state.currentCategory !== 'all') {
        novelsToRender = novelsToRender.filter(n => n.category === state.currentCategory);
    }

    if (!novelsToRender || novelsToRender.length === 0) {
        grid.innerHTML = '<p class="text-center w-full p-20">Tidak ada novel yang ditemukan.</p>';
        console.warn("renderHome: No novels to render after filtering.");
        return;
    }

    // Generate HTML untuk setiap novel
    grid.innerHTML = novelsToRender.map(novel => `
        <a href="detail.html?id=${novel.id}" class="novel-card-link">
            <div class="novel-card">
                <button class="fav-btn" onclick="event.preventDefault(); event.stopPropagation();" title="Tambah ke Favorit" aria-label="Tambah ke Favorit">
                    <i class="far fa-heart"></i>
                </button>
                <img src="${novel.image || 'https://via.placeholder.com/150x200'}" alt="${novel.title}" width="150" height="200">
                <h3>${novel.title}</h3>
                <p class="author-link">${novel.author || 'Anonim'}</p>
                <div class="rating">
                    <i class="fas fa-star"></i> 4.5
                </div>
            </div>
        </a>
    `).join('');
    console.log(`renderHome: Successfully rendered ${novelsToRender.length} novel cards.`);
}

async function loadAndRenderDetail(id) {
    const detailContainer = document.getElementById('novel-detail');
    if (!detailContainer) {
        console.error("loadAndRenderDetail: novel-detail element not found.");
        return;
    }
    console.log(`loadAndRenderDetail: Fetching detail for novel ID: ${id}`);

    const novel = await DataService.fetchNovelDetail(id);
    if (!novel) {
        detailContainer.innerHTML = '<p>Novel tidak ditemukan.</p>';
        return;
    }
    console.log(`loadAndRenderDetail: Successfully fetched novel detail for "${novel.title}".`);

    detailContainer.innerHTML = `
        <div class="detail-header">
            <img src="${novel.image || 'https://via.placeholder.com/250x350'}" alt="${novel.title}">
            <div class="detail-info">
                <h1>${novel.title}</h1>
                <span class="tag">${novel.category}</span>
                <p><strong>Penulis:</strong> ${novel.author || 'Anonim'}</p>
                <div class="rating"><i class="fas fa-star"></i> 4.5</div>
                <div class="flex gap-10 mt-20">
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
    console.log(`loadAndRenderDetail: Successfully rendered detail for "${novel.title}".`);
}

async function loadAndRenderReader() {
    const container = document.getElementById('read-container');
    if (!container) {
        console.error("loadAndRenderReader: read-container element not found.");
        return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const novelId = parseInt(urlParams.get('id'));
    const chapterIdx = parseInt(urlParams.get('ch') || 0);
    console.log(`loadAndRenderReader: Attempting to load novel ID ${novelId}, chapter index ${chapterIdx}.`);

    const novel = await DataService.fetchNovelDetail(novelId);
    if (!novel || !novel.chapters || !novel.chapters[chapterIdx]) { 
        console.warn(`loadAndRenderReader: Novel (ID: ${novelId}) or chapter (Index: ${chapterIdx}) not found.`);
        container.innerHTML = '<div class="error-msg"><p>Maaf, bab ini tidak tersedia atau gagal dimuat.</p><button onclick="history.back()" class="btn-read">Kembali</button></div>';
        return; 
    }

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

    // Render tombol navigasi
    const navContainer = document.getElementById('reader-nav');
    if (navContainer) {
        navContainer.innerHTML = `
            <button class="btn-read" ${chapterIdx === 0 ? 'disabled' : `onclick="location.href='read.html?id=${novelId}&ch=${chapterIdx - 1}'"`} title="Bab Sebelumnya">
                <i class="fas fa-arrow-left"></i> Sebelumnya
            </button>
            <button class="btn-read" onclick="location.href='detail.html?id=${novelId}'" title="Kembali ke Daftar Bab">
                <i class="fas fa-list"></i> Daftar Bab
            </button>
            <button class="btn-read" ${chapterIdx >= novel.chapters.length - 1 ? 'disabled' : `onclick="location.href='read.html?id=${novelId}&ch=${chapterIdx + 1}'"`} title="Bab Selanjutnya">
                Selanjutnya <i class="fas fa-arrow-right"></i>
            </button>
        `;
    }

    console.log(`loadAndRenderReader: Successfully rendered chapter "${chapter.title}" from novel "${novel.title}".`);
}

function setupReadingProgress() {
    const progressBar = document.getElementById('reading-progress');
    if (!progressBar) return;
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        progressBar.style.width = scrolled + "%";
    });
}

function setupCategoryFilters() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            state.currentCategory = e.currentTarget.dataset.category;
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
            console.log(`setupCategoryFilters: Category changed to '${state.currentCategory}'. Re-rendering home.`);
            renderHome();
        });
    });
    console.log("setupCategoryFilters: All nav-links have click listeners.");
}

/**
 * Memastikan semua iframe (seperti dari Google Translate/Ads) memiliki atribut title
 * agar memenuhi standar aksesibilitas (WCAG).
 */
function observeIframeAccessibility() {
    const observer = new MutationObserver(() => {
        const iframes = document.querySelectorAll('iframe:not([title])');
        iframes.forEach(iframe => {
            iframe.setAttribute('title', 'Konten Pihak Ketiga');
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', bootstrap);

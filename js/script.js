import { initSupabase } from './modules/supabase-client.js';
import * as AuthService from './modules/auth.js';
import * as DataService from './modules/data-service.js';
import * as HistoryManager from './modules/history-manager.js';

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

// Utilitas Sanitasi HTML Sederhana
const sanitize = (str) => {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};

const state = {
    currentCategory: 'all',
    currentNovelData: null,
    chaptersPerPage: 10,
    chapterSortOrder: 'asc', // 'asc' untuk Terlama, 'desc' untuk Terbaru
    chapterSearchQuery: ''
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
    applyBranding();
    const novelsLoaded = DataService.getNovels();
    console.log(`Bootstrap: Global data loaded. Found ${novelsLoaded ? novelsLoaded.length : 0} novels.`);

    // Setup UI Global
    setupCategoryFilters();
    setupSearch();
    renderHistory();
    loadGlobalSettings();
    setupTheme();

    // Accessibility: Fix missing titles in third-party iframes (Translate)
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

/**
 * Mengambil URL logo dari penyimpanan dan menerapkannya ke header
 */
function applyBranding(logoUrl) {
    // Mengambil logo dari localStorage (atau nantinya dari Supabase settings)
    const url = logoUrl || localStorage.getItem('site_logo_url');
    const headerLink = document.querySelector('header h1 a');
    
    if (url && headerLink) {
        // Mengganti teks logo dengan elemen gambar jika logo tersedia
        headerLink.innerHTML = `<img src="${url}" alt="NovelFire Logo" class="header-logo">`;
    }
}

/**
 * Memuat pengaturan global dari database dan menerapkannya
 */
async function loadGlobalSettings() {
    const supabase = (await import('./modules/supabase-client.js')).getSupabase();
    const { data } = await supabase.from('settings').select('*');
    
    if (!data) return;

    // Terapkan Branding
    const config = data.find(s => s.key === 'site_config')?.value;
    if (config?.logo_url) applyBranding(config.logo_url);

    // Terapkan Link Sosial di Footer
    const social = data.find(s => s.key === 'social_links')?.value;
    if (social) {
        if (social.facebook) document.getElementById('footer-fb').href = social.facebook;
        if (social.twitter) document.getElementById('footer-tw').href = social.twitter;
        if (social.instagram) document.getElementById('footer-ig').href = social.instagram;
        if (social.discord) document.getElementById('footer-ds').href = social.discord;
    }

    // Terapkan Statistik Kunjungan
    const stats = data.find(s => s.key === 'site_stats')?.value;
    if (stats) {
        const vc = document.getElementById('visit-count');
        const vrc = document.getElementById('visitor-count');
        if (vc) vc.innerText = stats.total_visits || 0;
        if (vrc) vrc.innerText = stats.unique_visitors || 0;
    }
}

/**
 * Mengatur fitur pencarian novel
 */
function setupSearch() {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-button');
    if (!input || !btn) return;

    const handleSearch = () => {
        const query = input.value.toLowerCase().trim();
        if (!query) {
            renderHome();
            return;
        }
        console.log(`Search: Finding novels with term '${query}'`);
        const allNovels = DataService.getNovels();
        const filtered = allNovels.filter(n => 
            n.title.toLowerCase().includes(query) || 
            (n.author && n.author.toLowerCase().includes(query)) ||
            (n.category && n.category.toLowerCase().includes(query))
        );
        renderHome(filtered);
        document.getElementById('novel-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    btn.addEventListener('click', handleSearch);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });
}

/**
 * Mengatur logika perpindahan tema (Dark Mode) dan efek visual terkait.
 */
function setupTheme() {
    const body = document.body;

    // Muat preferensi tema dari localStorage
    if (localStorage.getItem('theme') === 'dark') {
        body.classList.add('dark-mode');
    }

    document.addEventListener('click', (e) => {
        const themeBtn = e.target.closest('.nav-dark-mode, #dark-mode-toggle');
        if (!themeBtn) return;

        const isDark = !body.classList.contains('dark-mode');
        
        // 1. Set koordinat klik untuk efek 'reveal' di CSS
        body.style.setProperty('--click-x', e.clientX + 'px');
        body.style.setProperty('--click-y', e.clientY + 'px');
        
        // 2. Toggle class dan simpan preferensi
        if (isDark) body.classList.add('dark-mode');
        else body.classList.remove('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');

        // 3. Efek Ikon (Rotasi)
        const icon = themeBtn.querySelector('i');
        if (icon) {
            icon.classList.add('rotate-icon');
            setTimeout(() => icon.classList.remove('rotate-icon'), 500);
        }

        // 4. Buat Partikel Cahaya (Sesuai gaya di style.css)
        for (let i = 0; i < 8; i++) {
            const p = document.createElement('div');
            p.className = 'theme-particle';
            p.style.left = e.clientX + 'px';
            p.style.top = e.clientY + 'px';
            
            const dx = (Math.random() - 0.5) * 200;
            const dy = (Math.random() - 0.5) * 200;
            p.style.setProperty('--dx', `${dx}px`);
            p.style.setProperty('--dy', `${dy}px`);
            
            body.appendChild(p);
            setTimeout(() => p.remove(), 800);
        }
    });
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

function renderHome(novels) {
    const grid = document.getElementById('novel-grid');
    if (!grid) {
        console.error("renderHome: novel-grid element not found.");
        return;
    }

    // Bersihkan kontainer (menghapus skeleton/loading jika ada)
    grid.innerHTML = '';

    let novelsToRender = novels || DataService.getNovels();
    
    // Hanya filter kategori jika kita tidak sedang menampilkan hasil pencarian kustom
    if (!novels && state.currentCategory !== 'all') {
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
                <img src="${novel.image || 'https://via.placeholder.com/150x200'}" alt="${sanitize(novel.title)}" width="150" height="200">
                <h3>${sanitize(novel.title)}</h3>
                <p class="author-link">${sanitize(novel.author || 'Anonim')}</p>
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
            <img src="${novel.image || 'https://via.placeholder.com/250x350'}" alt="${sanitize(novel.title || 'Novel Cover')}">
            <div class="detail-info">
                <h1>${sanitize(novel.title)}</h1>
                <span class="tag">${novel.category}</span>
                <p><strong>Penulis:</strong> ${sanitize(novel.author || 'Anonim')}</p>
                <div class="rating"><i class="fas fa-star"></i> 4.5</div>
                <div class="flex gap-10 mt-20">
                    <button class="btn-read" onclick="location.href='read.html?id=${novel.id}&ch=${state.chapterSortOrder === 'asc' ? 0 : (novel.chapters?.length - 1 || 0)}'">Mulai Membaca</button>
                </div>
            </div>
        </div>
        <div class="synopsis admin-card mt-20">
            <h3>Sinopsis</h3>
            <p class="synopsis-content" id="synopsis-text">${sanitize(novel.synopsis || 'Tidak ada sinopsis.')}</p>
            <button class="read-more-btn" onclick="toggleSynopsis()">Baca Selengkapnya</button>
        </div>
        <div class="chapter-section">
            <div class="flex justify-between align-center mb-15">
                <div style="flex: 1;">
                    <h3>Daftar Bab</h3>
                    <input type="text" id="chapter-search-input" placeholder="Cari nomor atau judul bab..." 
                        oninput="handleChapterSearch(this.value)" style="width: 100%; max-width: 300px; padding: 8px; margin-top: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--light-bg); color: var(--text-color);">
                </div>
                <div class="sort-controls">
                    <button id="sort-asc" class="btn-action ${state.chapterSortOrder === 'asc' ? 'active' : ''}" 
                        onclick="toggleChapterSort('asc')" style="font-size: 0.8rem; padding: 5px 10px;">
                        <i class="fas fa-sort-amount-down-alt"></i> Terlama
                    </button>
                    <button id="sort-desc" class="btn-action ${state.chapterSortOrder === 'desc' ? 'active' : ''}" 
                        onclick="toggleChapterSort('desc')" style="font-size: 0.8rem; padding: 5px 10px;">
                        <i class="fas fa-sort-amount-up"></i> Terbaru
                    </button>
                </div>
            </div>
            <ul class="chapter-list" id="chapter-list-container">
                <!-- Bab akan dimuat di sini oleh renderDetailChapters -->
            </ul>
        </div>
    `;

    state.currentNovelData = novel;
    renderDetailChapters(1);
    console.log(`loadAndRenderDetail: Successfully rendered detail for "${novel.title}".`);
}

/**
 * Toggle ekspansi sinopsis
 */
window.toggleSynopsis = function() {
    const synopsis = document.getElementById('synopsis-text');
    const btn = document.querySelector('.read-more-btn');
    if (!synopsis || !btn) return;

    const isExpanded = synopsis.classList.toggle('expanded');
    btn.innerText = isExpanded ? 'Sembunyikan' : 'Baca Selengkapnya';
};

/**
 * Mengubah urutan bab (Terbaru/Terlama)
 */
window.toggleChapterSort = function(order) {
    if (state.chapterSortOrder === order) return;
    
    state.chapterSortOrder = order;
    
    // Update visual tombol
    document.getElementById('sort-asc').classList.toggle('active', order === 'asc');
    document.getElementById('sort-desc').classList.toggle('active', order === 'desc');
    
    renderDetailChapters(1);
};

/**
 * Menangani pencarian bab
 */
window.handleChapterSearch = function(query) {
    state.chapterSearchQuery = query.toLowerCase().trim();
    // Selalu kembali ke halaman 1 saat mencari
    renderDetailChapters(1);
};

/**
 * Merender daftar bab dengan paginasi di halaman detail
 */
window.renderDetailChapters = function(page) {
    const novel = state.currentNovelData;
    const container = document.getElementById('chapter-list-container');
    const paginationContainer = document.getElementById('chapter-pagination-detail');
    
    if (!novel || !container) return;

    // 1. Map bab dengan index aslinya agar link baca tetap akurat
    let chapters = (novel.chapters || []).map((ch, idx) => ({ ...ch, originalIndex: idx }));

    // 2. Terapkan Filter Pencarian
    if (state.chapterSearchQuery) {
        chapters = chapters.filter(ch => 
            ch.title.toLowerCase().includes(state.chapterSearchQuery)
        );
    }

    // 3. Terapkan Pengurutan
    if (state.chapterSortOrder === 'desc') {
        chapters.reverse();
    }

    const start = (page - 1) * state.chaptersPerPage;
    const end = start + state.chaptersPerPage;
    const paginatedChapters = chapters.slice(start, end);

    if (paginatedChapters.length === 0) {
        container.innerHTML = `<li class="chapter-item">${state.chapterSearchQuery ? 'Bab tidak ditemukan.' : 'Belum ada bab tersedia.'}</li>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    container.innerHTML = paginatedChapters.map((ch) => {
        return `
                    <li class="chapter-item" onclick="location.href='read.html?id=${novel.id}&ch=${ch.originalIndex}'">
                        <span>${sanitize(ch.title)}</span>
                        <i class="fas fa-chevron-right"></i>
                    </li>
        `;
    }).join('');

    renderPaginationUI('chapter-pagination-detail', chapters.length, state.chaptersPerPage, page, 'renderDetailChapters');
};

/**
 * Fungsi utilitas untuk merender UI Paginasi
 */
function renderPaginationUI(containerId, totalItems, perPage, currentPage, callbackName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.ceil(totalItems / perPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    if (currentPage > 1) {
        html += `<button class="btn-page" onclick="${callbackName}(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
    }

    const range = [];
    const delta = 1; // Jumlah halaman yang ditampilkan di kiri/kanan halaman aktif

    range.push(1);
    if (currentPage > delta + 2) range.push('...');

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i);
    }

    if (currentPage < totalPages - (delta + 1)) range.push('...');
    if (totalPages > 1) range.push(totalPages);

    range.forEach(p => {
        if (p === '...') {
            html += `<span class="btn-page" style="border:none; background:transparent; cursor:default;">...</span>`;
        } else {
            html += `<button class="btn-page ${p === currentPage ? 'active' : ''}" onclick="${callbackName}(${p})">${p}</button>`;
        }
    });

    // Tombol Next
    if (currentPage < totalPages) {
        html += `<button class="btn-page" onclick="${callbackName}(${currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
    }

    container.innerHTML = html;
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

    // Simpan ke Riwayat (Bookmark Otomatis)
    HistoryManager.saveToHistory(novel, chapterIdx);

    const chapter = novel.chapters[chapterIdx];
    container.innerHTML = `
        <div class="read-header">
            <h2>${novel.title}</h2>
            <h3>${chapter.title}</h3>
            <div class="read-actions">
                <button class="btn-action" onclick="changeFontSize('small')" title="Font Kecil">A-</button>
                <button class="btn-action" onclick="changeFontSize('medium')" title="Font Normal">A</button>
                <button class="btn-action" onclick="changeFontSize('large')" title="Font Besar">A+</button>
                <button class="btn-action" id="tts-btn" onclick="toggleTTS()" title="Baca Bersuara"><i class="fas fa-volume-up"></i></button>
            </div>
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

    console.log(`loadAndRenderReader: Rendered chapter "${chapter.title}".`);
}

/**
 * Fungsi Kontrol Pembaca (Font & TTS)
 */
window.changeFontSize = (size) => {
    const content = document.querySelector('.read-content');
    if (!content) return;
    content.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge');
    content.classList.add(`font-${size}`);
    localStorage.setItem('reader_font_size', size);
};

let ttsInstance = null;
window.toggleTTS = () => {
    const content = document.querySelector('.read-content');
    const btn = document.getElementById('tts-btn');
    
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
        return;
    }

    const text = content.innerText;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.onend = () => {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    };

    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-stop"></i>';
    window.speechSynthesis.speak(utterance);
};

/** 
 * Template untuk item riwayat (reusable UI component)
 */
const historyItemTemplate = (item) => `
    <div class="novel-card-wrapper" id="history-item-${item.id}">
        <a href="read.html?id=${item.id}&ch=${item.lastChapterIdx}" class="novel-card-link">
            <div class="novel-card">
                <img src="${item.image || 'https://via.placeholder.com/150x200'}" alt="${sanitize(item.title)}">
                <h3>${sanitize(item.title)}</h3>
                <p class="text-small text-primary">Lanjut: ${sanitize(item.lastChapterTitle)}</p>
            </div>
        </a>
        <button class="btn-delete-history" onclick="handleRemoveHistory(${item.id})" title="Remove from history">
            <i class="fas fa-times"></i>
        </button>
    </div>
`;

function renderHistory() {
    const historyGrid = document.getElementById('history-grid');
    const historySection = document.getElementById('history-section');
    if (!historyGrid) return;

    const history = HistoryManager.getHistory();
    if (history.length === 0) {
        historySection.classList.add('display-none');
        return;
    }

    historySection.classList.remove('display-none');
    historyGrid.innerHTML = history.map(historyItemTemplate).join('');
}

window.handleRemoveHistory = (id) => {
    HistoryManager.removeFromHistory(id);
    renderHistory();
};

window.clearHistory = () => {
    if (confirm('Apakah Anda yakin ingin menghapus semua riwayat membaca?')) {
        HistoryManager.clearAllHistory();
        renderHistory();
    }
}

function setupReadingProgress() {
    const progressBar = document.getElementById('reading-progress');
    const backToTop = document.getElementById('back-to-top');
    
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        
        if (progressBar) progressBar.style.width = scrolled + "%";
        
        // Update visibility tombol back-to-top
        if (backToTop) {
            if (winScroll > 400) backToTop.classList.add('show');
            else backToTop.classList.remove('show');
        }
    });

    backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
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
 * Memastikan semua iframe (seperti dari Google Translate) memiliki atribut title
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

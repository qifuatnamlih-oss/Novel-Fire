// Fungsi Inisialisasi Google Translate
window.googleTranslateElementInit = function() {
    new google.translate.TranslateElement({
        pageLanguage: 'id', // Bahasa asal website
        includedLanguages: 'en,zh-CN,ja,id', // Menghapus bahasa Korea dari daftar terjemahan
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
    }, 'google_translate_element');
}

// Data novel dalam bentuk Array of Objects
if (typeof window.novels === 'undefined') window.novels = [];

window.chapterSortOrder = window.chapterSortOrder || 'asc';

let supabaseInitPromise = null;

// Fungsi Inisialisasi Supabase secara Async
async function initSupabase() {
    if (supabaseInitPromise) return supabaseInitPromise;

    supabaseInitPromise = (async () => {
        try {
            // Cek jika sudah diinisialisasi sebagai instance
            if (window.supabase && typeof window.supabase.from === 'function' && typeof window.supabase.createClient !== 'function') {
                return true;
            }

            // Mengambil konfigurasi dari serverless function Vercel
            const response = await fetch('/api/get-config');
            if (!response.ok) throw new Error("Gagal mengambil konfigurasi dari server");
            const config = await response.json();
            
            const SUPABASE_URL = config.url;
            const SUPABASE_ANON_KEY = config.key;

            const lib = typeof supabase !== 'undefined' ? supabase : window.supabase;
            if (lib && typeof lib.createClient === 'function') {
                window.supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { // Use the directly provided config
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
                return true;
            }
        } catch (error) {
            console.error("Gagal menginisialisasi Supabase:", error);
            supabaseInitPromise = null; // Reset agar bisa dicoba lagi
        }
        return false;
    })();

    return supabaseInitPromise;
}

// --- LOGIKA AUTH & PROFIL ---
let currentUser = null;

async function checkUserSession() {
    try {
        const { data: { session }, error } = await window.supabase.auth.getSession();
        
        if (error) {
            // Jika terjadi error pada token (seperti Invalid Refresh Token), 
            // paksa sign out untuk membersihkan storage yang rusak.
            console.warn("Sesi tidak valid, membersihkan data login...");
            await window.supabase.auth.signOut();
            currentUser = null;
        } else {
            currentUser = session ? session.user : null;
        }

        updateAuthUI();
        if (currentUser) {
            listenToNotifications();
            fetchNotifications();
        }
    } catch (err) {
        console.error("Gagal memproses sesi:", err.message);
        currentUser = null;
        updateAuthUI();
    }
}

function updateAuthUI() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    let authBtn = document.getElementById('auth-nav-btn');
    if (!authBtn) {
        authBtn = document.createElement('div');
        authBtn.id = 'auth-nav-btn';
        authBtn.className = 'nav-translate';
        const translateElem = document.getElementById('google_translate_element');
        if (translateElem && translateElem.parentNode === nav) {
            nav.insertBefore(authBtn, translateElem);
        } else {
            nav.appendChild(authBtn);
        }
    }

    if (currentUser) {
        const isAdmin = currentUser.user_metadata?.role === 'admin';
        authBtn.innerHTML = `
            <div class="user-profile-nav" onclick="toggleUserMenu()">
                <img src="${currentUser.user_metadata.avatar_url || 'https://placehold.co/30'}" class="nav-avatar">
                <span class="notification-badge" id="noti-badge" style="display:none;"></span>
            </div>
            <div id="user-menu" class="user-menu-dropdown" style="display:none;">
                <p>Halo, <strong>${currentUser.user_metadata.full_name || 'User'}</strong></p>
                <hr>
                ${isAdmin ? '<a href="admin.html"><i class="fas fa-user-shield"></i> Dashboard Admin</a>' : ''}
                <a href="#" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </div>
        `;
    } else {
        authBtn.innerHTML = `<button onclick="handleLogin()" class="btn-read" style="padding: 5px 15px; font-size: 0.8rem;">Login</button>`;
    }
}

window.handleLogin = async function() {
    // Gunakan URL absolut tanpa fragment/hash untuk redirect yang lebih kompatibel dengan Supabase
    const redirectUrl = window.location.origin + window.location.pathname;
    
    const { error } = await window.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl }
    });
    if (error) alert(error.message);
};

window.handleLogout = async function(e) {
    e.preventDefault();
    await window.supabase.auth.signOut();
    location.reload();
};

window.toggleUserMenu = () => {
    const menu = document.getElementById('user-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

// --- UTILITAS UI/UX: CUSTOM TOAST ---
window.showToast = function(message, duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

// --- LOGIKA NOTIFIKASI REAL-TIME ---
function listenToNotifications() {
    window.supabase
        .channel('schema-db-changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications', 
            filter: `receiver_id=eq.${currentUser.id}` 
        }, payload => {
            showToast("🔔 Seseorang membalas komentar Anda!");
            fetchNotifications();
        })
        .subscribe();
}

async function fetchNotifications() {
    const { data, count } = await window.supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
    
    const badge = document.getElementById('noti-badge');
    if (badge && count > 0) {
        badge.innerText = count;
        badge.style.display = 'block';
    }
}

// Fungsi untuk memuat data dari data.json (Publik)
/**
 * Memuat data novel secara efisien dengan pemilihan kolom dan paginasi.
 */
async function loadGlobalData(options = {}) {
    try {
        // Pastikan window.supabase adalah instance, bukan objek library CDN
        if (!window.supabase || typeof window.supabase.from !== 'function') return false;

        // Default: ambil metadata saja (tanpa chapters/description yang berat)
        const { 
            page = 0, 
            limit = 12, 
            select = 'id, title, category, genre, image, author, description, chapters' 
        } = options;

        const from = page * limit;
        const to = from + limit - 1;

        const { data, error } = await window.supabase
            .from('novels')
            .select(select)
            .range(from, to)
            .order('id', { ascending: false });
        
        if (error) throw error;
        
        // Perbaikan: Update data jika ID sudah ada, tambahkan jika belum ada
        if (data) {
            data.forEach(item => {
                const index = window.novels.findIndex(n => n.id === item.id);
                if (index !== -1) {
                    window.novels[index] = { ...window.novels[index], ...item };
                } else {
                    window.novels.push(item);
                }
            });
            window.novels.sort((a, b) => b.id - a.id); // Pastikan tetap urut ID terbaru
        }

        console.log(`[Supabase] Berhasil memuat ${data.length} novel.`);
        return true;
    } catch (error) {
        console.error("Kesalahan loadGlobalData:", error.message);
        return false;
    }
}

/**
 * Mengambil detail lengkap satu novel hanya saat dibutuhkan (Lazy Loading).
 */
async function fetchNovelDetail(id) {
    if (!window.novels) window.novels = [];
    
    const local = (window.novels || []).find(n => n.id === id);
    // Jika sudah ada chapters, tidak perlu fetch lagi
    if (local && local.chapters) return local;

    const { data, error } = await window.supabase
        .from('novels')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error("Gagal mengambil detail novel:", error.message);
        return null;
    }

    // Update cache global
    const index = window.novels.findIndex(n => n.id === id);
    if (index !== -1) window.novels[index] = data;
    else window.novels.push(data);

    return data;
}

// Sortir ID untuk memastikan ID unik jika admin menambah novel baru
const getNextNovelId = () => {
    const list = window.novels || [];
    return list.length > 0 ? Math.max(...list.map(n => n.id)) + 1 : 1;
};

// Helper untuk mencegah XSS (Sanitasi input user)
function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// Fungsi global untuk memfilter novel berdasarkan penulis
window.filterByAuthor = function(authorName, event) {
    if (event) event.stopPropagation(); // Mencegah klik kartu (redirect ke detail)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = authorName;
        searchInput.dispatchEvent(new Event('input')); // Memicu event input secara manual
        window.scrollTo({ top: searchInput.offsetTop - 100, behavior: 'smooth' });
    }
};

// Helper untuk merender HTML kartu novel
function renderNovelCard(novel) {
    const rating = localStorage.getItem(`rating_${novel.id}`) || 0;
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const isFav = favorites.includes(novel.id);
    
    let stars = '';
    for (let i = 1; i <= 5; i++) { // Perbaikan: Menggunakan <= 5 untuk 5 bintang
        stars += `<i class="${i <= rating ? 'fas' : 'far'} fa-star"></i>`;
    }

    const targetUrl = `detail.html?id=${novel.id}`;

    return `
        <div class="novel-card" onclick="location.href='${targetUrl}'" title="${escapeHTML(novel.title)}">
            <div style="position:relative; overflow:hidden; border-radius:8px;">
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(${novel.id}, event)" aria-label="Tambah ke Favorit">
                    <i class="fas fa-heart"></i>
                </button>
                <img src="${novel.image}" alt="Cover ${novel.title}" loading="lazy" onerror="this.src='https://placehold.co/150x200?text=No+Cover'">
            </div>
            <h3 style="font-size: 1rem; margin: 12px 0 5px; line-height: 1.3; height: 2.6em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHTML(novel.title)}</h3>
            <div style="margin-top: auto;">
                <p class="author-link" style="font-size: 0.75rem; color: var(--primary-color); font-weight: 600; margin-bottom: 5px;" onclick="filterByAuthor('${escapeHTML(novel.author || 'Anonim').replace(/'/g, "\\'")}', event)">
                    ${novel.author || 'Anonim'}
                </p>
                <div class="rating" style="font-size: 0.75rem;">${stars}</div>
            </div>
        </div>
    `;
}

// Fungsi untuk menampilkan novel ke dalam grid
function displayNovels(novelList) {
    const novelGrid = document.getElementById('novel-grid');
    if (!novelGrid) return;
    
    novelGrid.innerHTML = ''; // Kosongkan grid sebelum mengisi ulang

    if (novelList.length === 0) {
        // Tampilkan Skeletons saat loading (visual feedback lebih baik)
        for(let i=0; i<6; i++) {
            novelGrid.innerHTML += `
                <div class="novel-card">
                    <div class="skeleton" style="height: 200px; width: 100%; margin-bottom: 10px;"></div>
                    <div class="skeleton" style="height: 20px; width: 80%; margin: 5px auto;"></div>
                    <div class="skeleton" style="height: 15px; width: 60%; margin: 5px auto;"></div>
                </div>
            `;
        }
        return;
    }
    
    novelGrid.innerHTML = novelList.map(novel => renderNovelCard(novel)).join('');
    setupGridScroll('novel-grid');
}

// Fungsi untuk menampilkan update bab terbaru dengan label NEW
function displayLatestUpdates() {
    const updateGrid = document.getElementById('latest-updates-grid');
    const updateSection = document.getElementById('latest-updates-section');
    if (!updateGrid || !updateSection) return;

    let allUpdates = [];
    novels.forEach(novel => {
        if (novel.chapters && novel.chapters.length > 0) {
            const lastChapter = novel.chapters[novel.chapters.length - 1];
            allUpdates.push({
                novelId: novel.id,
                novelTitle: novel.title,
                chapterId: lastChapter.id,
                chapterTitle: lastChapter.title,
                category: novel.category,
                timestamp: lastChapter.id // ID bab baru menggunakan Date.now()
            });
        }
    });

    // Urutkan berdasarkan ID bab terbesar (terbaru)
    allUpdates.sort((a, b) => b.timestamp - a.timestamp);

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 jam dalam milidetik

    if (allUpdates.length > 0) {
        updateSection.style.display = 'block';
        updateGrid.innerHTML = allUpdates.slice(0, 6).map(upd => {
            // Tentukan apakah bab dirilis kurang dari 24 jam yang lalu
            const isNew = (now - upd.timestamp) < oneDay;
            const badgeHtml = isNew ? `<span class="badge-new">NEW</span>` : '';

            return `
                <div class="update-item" onclick="location.href='read.html?novelId=${upd.novelId}&chapterId=${upd.chapterId}'" title="Baca ${upd.chapterTitle}">
                    <div class="update-info">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="update-category">${upd.category}</span>
                            ${badgeHtml}
                        </div>
                        <h4>${upd.novelTitle}</h4>
                        <p>${upd.chapterTitle}</p>
                    </div>
                    <i class="fas fa-sync-alt" style="color: #eee;"></i>
                </div>
            `;
        }).join('');
    } else {
        updateSection.style.display = 'none';
    }
}

// Fungsi untuk menambahkan navigasi panah dan logika scroll horizontal
function setupGridScroll(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    let wrapper = grid.parentElement;
    // Jika belum dibungkus wrapper khusus, buat pembungkusnya
    if (!wrapper.classList.contains('grid-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'grid-wrapper';
        grid.parentNode.insertBefore(wrapper, grid);
        wrapper.appendChild(grid);

        const leftBtn = document.createElement('button');
        leftBtn.className = 'scroll-arrow left hidden';
        leftBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        
        const rightBtn = document.createElement('button');
        rightBtn.className = 'scroll-arrow right hidden';
        rightBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';

        wrapper.appendChild(leftBtn);
        wrapper.appendChild(rightBtn);

        let isBouncing = false;
        const applyBounce = (direction) => {
            if (isBouncing) return;
            isBouncing = true;
            grid.classList.add(`bounce-${direction}`);
            setTimeout(() => {
                grid.classList.remove(`bounce-${direction}`);
                isBouncing = false;
            }, 400);
        };

        leftBtn.onclick = () => {
            if (grid.scrollLeft <= 5) {
                applyBounce('left');
            } else {
                grid.scrollBy({ left: -300, behavior: 'smooth' });
            }
        };

        rightBtn.onclick = () => {
            if (grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 5) {
                applyBounce('right');
            } else {
                grid.scrollBy({ left: 300, behavior: 'smooth' });
            }
        };

        grid.addEventListener('scroll', () => {
            const isLeft = grid.scrollLeft <= 5;
            const isRight = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 5;
            
            leftBtn.classList.toggle('hidden', isLeft);
            rightBtn.classList.toggle('hidden', isRight);
            
            wrapper.classList.toggle('left-edge', isLeft);
            wrapper.classList.toggle('right-edge', isRight);
        });
    }

    // Periksa visibilitas panah setelah konten dimuat (jeda sedikit untuk render)
    setTimeout(() => {
        const leftBtn = wrapper.querySelector('.scroll-arrow.left');
        const rightBtn = wrapper.querySelector('.scroll-arrow.right');
        if (leftBtn && rightBtn) {
            const isLeft = grid.scrollLeft <= 5;
            const isRight = grid.scrollWidth <= grid.clientWidth;
            
            leftBtn.classList.toggle('hidden', isLeft);
            rightBtn.classList.toggle('hidden', isRight);
            
            wrapper.classList.toggle('left-edge', isLeft);
            wrapper.classList.toggle('right-edge', isRight);
        }
    }, 100);
}

// Fungsi untuk menampilkan bagian Novel Favorit
function displayFavorites() {
    const favSection = document.getElementById('favorites-section');
    const favGrid = document.getElementById('favorites-grid');
    if (!favSection || !favGrid) return;

    const favoriteIds = JSON.parse(localStorage.getItem('favorites')) || [];
    const favoriteNovels = novels.filter(n => favoriteIds.includes(n.id));

    if (favoriteNovels.length > 0) {
        favSection.style.display = 'block';
        favGrid.innerHTML = favoriteNovels.map(novel => renderNovelCard(novel)).join('');
        setupGridScroll('favorites-grid');
    } else {
        favSection.style.display = 'none';
    }
}

// Fungsi untuk menampilkan bagian Riwayat Membaca
function displayHistory() {
    const historySection = document.getElementById('history-section');
    const historyGrid = document.getElementById('history-grid');
    if (!historySection || !historyGrid) return;

    const historyIds = JSON.parse(localStorage.getItem('reading_history')) || [];
    const historyNovels = historyIds.map(id => novels.find(n => n.id === id)).filter(n => n);

    if (historyNovels.length > 0) {
        historySection.style.display = 'block';
        historyGrid.innerHTML = historyNovels.map(novel => renderNovelCard(novel)).join('');
        setupGridScroll('history-grid');
    } else {
        historySection.style.display = 'none';
    }
}

// Fungsi untuk memfilter novel berdasarkan kategori
function setupFilters() {
    const navLinks = document.querySelectorAll('.nav-link');
    const nav = document.querySelector('nav');
    const toggle = document.getElementById('menu-toggle');
    if (navLinks.length === 0) return;

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const category = link.getAttribute('data-category');
            const novelGrid = document.getElementById('novel-grid');

            // Jika tidak di halaman index (tidak ada grid), arahkan ke index dengan parameter kategori
            if (!novelGrid) {
                window.location.href = `index.html?category=${category}`;
                return;
            }

            e.preventDefault();

            // Hapus kelas active dari semua link dan tambah ke yang diklik
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const filtered = category === 'all' 
                ? novels 
                : novels.filter(novel => novel.category === category);
            
            displayNovels(filtered);

            // Tutup menu otomatis di mobile setelah kategori diklik
            if (nav && nav.classList.contains('mobile-active')) {
                nav.classList.remove('mobile-active');
                if (toggle) {
                    const icon = toggle.querySelector('i');
                    if (icon) {
                        icon.classList.replace('fa-times', 'fa-bars');
                    }
                }
            }
        });
    });
}

// Fungsi untuk menangani pencarian real-time
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const navLinks = document.querySelectorAll('.nav-link');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        // Reset status active pada kategori saat mencari (kembali ke 'All')
        navLinks.forEach(link => link.classList.remove('active'));
        document.querySelector('[data-category="all"]').classList.add('active');

        // Filter berdasarkan judul, genre, atau penulis
        const filtered = novels.filter(novel => 
            (novel.title || "").toLowerCase().includes(searchTerm) || 
            (novel.genre || "").toLowerCase().includes(searchTerm) ||
            (novel.author || "").toLowerCase().includes(searchTerm)
        );

        displayNovels(filtered);
    });
}

// Fungsi untuk menampilkan detail novel di halaman detail.html
async function displayNovelDetail() {
    const detailContainer = document.getElementById('novel-detail');
    if (!detailContainer) return;

    const params = new URLSearchParams(window.location.search);
    const novelId = parseInt(params.get('id'));

    // UI/UX: Tampilkan Skeleton UI saat memuat detail novel
    detailContainer.innerHTML = `
        <section class="novel-hero" style="border-bottom:none; background:transparent;">
            <div class="container hero-content">
                <div class="hero-cover">
                    <div class="skeleton" style="width: 180px; height: 270px; border-radius: 12px;"></div>
                </div>
                <div class="hero-info" style="flex: 1;">
                    <div class="skeleton" style="height: 1rem; width: 120px; margin-bottom: 10px;"></div>
                    <div class="skeleton" style="height: 3rem; width: 80%; margin-bottom: 15px;"></div>
                    <div class="skeleton" style="height: 1.2rem; width: 40%; margin-bottom: 30px;"></div>
                    <div style="display: flex; gap: 12px;">
                        <div class="skeleton" style="height: 50px; width: 180px; border-radius: 8px;"></div>
                        <div class="skeleton" style="height: 50px; width: 180px; border-radius: 8px;"></div>
                    </div>
                </div>
            </div>
        </section>
    `;

    const novel = await fetchNovelDetail(novelId);

    if (novel) {
        const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
        const isFav = favorites.includes(novel.id);
        const readChapters = JSON.parse(localStorage.getItem(`read_chapters_${novel.id}`)) || [];

        // Logika Penanda Bab Terakhir untuk tombol utama
        const lastChapterId = localStorage.getItem(`bookmark_${novel.id}`);
        const chapters = novel.chapters || [];
        
        const sortedChapters = [...chapters];
        if (window.chapterSortOrder === 'desc') sortedChapters.reverse();

        const startChapterId = lastChapterId || (chapters.length > 0 ? chapters[0].id : null);
        const readBtnText = lastChapterId ? 'Lanjutkan Membaca' : 'Mulai Membaca';

        detailContainer.innerHTML = `
            <section class="novel-hero">
                <div class="container hero-content">
                    <div class="hero-cover">
                        <img src="${novel.image}" alt="${novel.title}">
                    </div>
                    <div class="hero-info">
                        <div style="display: flex; gap: 8px; margin-bottom: 10px; justify-content: inherit;">
                            <span class="tag">${novel.category}</span>
                            <span class="tag" style="background: var(--nav-bg);">${novel.genre}</span>
                        </div>
                        <h1>${novel.title}</h1>
                        <p style="font-size: 1.1rem; opacity: 0.8;">Oleh: <strong>${novel.author || 'Anonim'}</strong></p>
                        
                        <div style="display: flex; gap: 12px; margin-top: 25px; justify-content: flex-start; flex-wrap: wrap;">
                            <button class="btn-read" onclick="location.href='read.html?novelId=${novel.id}&chapterId=${startChapterId}'">
                                <i class="fas fa-play"></i> ${readBtnText}
                            </button>
                            <button class="btn-fav-detail ${isFav ? 'active' : ''}" onclick="toggleFavorite(${novel.id})">
                                <i class="fas fa-heart"></i> ${isFav ? 'Dafavorit' : 'Tambah Favorit'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <div class="container detail-layout">
                <div class="main-column">
                    <section class="info-card">
                        <h3><i class="fas fa-book-open" style="color:var(--primary-color)"></i> Sinopsis</h3>
                        <p id="synopsis-content" class="synopsis-content">${escapeHTML(novel.description || "").replace(/\n/g, '<br>')}</p>
                        <button id="read-more-btn" class="read-more-btn" style="display: none;">Baca Selengkapnya</button>
                    </section>

                    <section class="chapter-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 style="margin: 0;"><i class="fas fa-list-ul"></i> Daftar Bab</h3>
                            <button id="sort-chapters-btn" class="btn-action">
                                <i class="fas ${window.chapterSortOrder === 'asc' ? 'fa-sort-amount-down-alt' : 'fa-sort-amount-up'}"></i>
                            </button>
                        </div>
                        <ul class="chapter-grid-modern">
                            ${sortedChapters.map(ch => {
                                const isRead = readChapters.includes(ch.id);
                                return `
                                    <li class="chapter-item ${isRead ? 'read' : ''}" onclick="location.href='read.html?novelId=${novel.id}&chapterId=${ch.id}'">
                                        <span style="font-size: 0.9rem; font-weight: 600;">${ch.title}</span>
                                        ${isRead ? '<i class="fas fa-check-circle" style="color:#27ae60"></i>' : '<i class="fas fa-chevron-right" style="opacity:0.3"></i>'}
                                    </li>
                                `;
                            }).join('')}
                        </ul>
                    </section>
                </div>

                <aside class="sidebar-column">
                    <div class="author-card">
                        <p style="font-size: 0.7rem; font-weight: bold; color: #888; text-transform: uppercase; margin-bottom: 15px;">Tentang Penulis</p>
                        <div class="author-profile">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(novel.author || 'A')}&background=random" class="author-avatar">
                            <div>
                                <p style="margin: 0; font-weight: 800;">${novel.author || 'Anonim'}</p>
                                <p style="margin: 0; font-size: 0.75rem; color: var(--primary-color);">Verified Creator</p>
                            </div>
                        </div>
                        <button class="btn-action" style="width: 100%; margin-top: 10px;">Ikuti Penulis</button>
                    </div>

                    <div class="info-card">
                        <p style="font-size: 0.7rem; font-weight: bold; color: #888; text-transform: uppercase; margin-bottom: 15px;">Statistik Novel</p>
                        <div class="stars-input" id="stars-input" style="justify-content: center; margin-bottom: 15px;">
                            ${[1,2,3,4,5].map(v => `<button class="star-btn" data-value="${v}"><i class="fas fa-star"></i></button>`).join('')}
                        </div>
                        <div class="stats-grid">
                            <div>
                                <p style="margin:0; font-size: 0.7rem; color: #888;">PEMBACA</p>
                                <p style="margin:0; font-weight: bold;">${(novel.reading_count || 0).toLocaleString('id-ID')}</p>
                            </div>
                            <div>
                                <p style="margin:0; font-size: 0.7rem; color: #888;">RATING</p>
                                <p style="margin:0; font-weight: bold;">4.8/5.0</p>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        `;

        // Setup interaksi rating
        setupRating(novelId);

        // Setup tombol urutan bab
        const sortBtn = document.getElementById('sort-chapters-btn');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => {
                window.chapterSortOrder = window.chapterSortOrder === 'asc' ? 'desc' : 'asc';
                displayNovelDetail();
            });
        }

        // Setup tombol Baca Selengkapnya jika teks terlalu panjang
        const synopsisContent = document.getElementById('synopsis-content');
        const readMoreBtn = document.getElementById('read-more-btn');
        if (synopsisContent && readMoreBtn) {
            // Cek apakah konten benar-benar meluap (lebih dari 3 baris)
            if (synopsisContent.scrollHeight > synopsisContent.offsetHeight) {
                readMoreBtn.style.display = 'inline-block';
            }
            readMoreBtn.addEventListener('click', () => {
                const isExpanded = synopsisContent.classList.toggle('expanded');
                readMoreBtn.textContent = isExpanded ? 'Sembunyikan' : 'Baca Selengkapnya';
            });
        }
    } else {
        detailContainer.innerHTML = "<h2>Novel tidak ditemukan.</h2>";
    }
}

// Fungsi untuk menampilkan isi bacaan bab di read.html
async function displayReadingContent() {
    const readContainer = document.getElementById('read-container');
    if (!readContainer) return;

    const params = new URLSearchParams(window.location.search);
    const novelId = parseInt(params.get('novelId'));
    const chapterId = parseInt(params.get('chapterId'));

    // UI/UX: Tampilkan Skeleton Content saat memuat isi bab
    readContainer.innerHTML = `
        <div class="read-header" style="border:none;">
            <div class="skeleton" style="height: 1.5rem; width: 50%; margin: 0 auto 10px;"></div>
            <div class="skeleton" style="height: 2rem; width: 70%; margin: 0 auto 20px;"></div>
        </div>
        <div class="read-content">
            <div class="skeleton" style="height: 1.2rem; width: 100%; margin-bottom: 1.2rem;"></div>
            <div class="skeleton" style="height: 1.2rem; width: 95%; margin-bottom: 1.2rem;"></div>
            <div class="skeleton" style="height: 1.2rem; width: 98%; margin-bottom: 1.2rem;"></div>
            <div class="skeleton" style="height: 1.2rem; width: 90%; margin-bottom: 1.2rem;"></div>
            <div class="skeleton" style="height: 1.2rem; width: 93%; margin-bottom: 1.2rem;"></div>
        </div>
    `;

    // Hentikan suara yang sedang berjalan jika user berpindah bab dengan cepat
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const novel = await fetchNovelDetail(novelId);
    if (!novel) return;

    const chapters = novel.chapters || [];
    const chapterIndex = chapters.findIndex(ch => ch.id === chapterId);
    const chapter = chapters[chapterIndex];

    if (chapter) {
        // Increment reading_count menggunakan RPC (lebih efisien & aman)
        const { error: rpcError } = await window.supabase.rpc('increment_reading_count', { novel_id: novelId });
        if (rpcError) {
            console.error("Gagal memperbarui jumlah bacaan:", rpcError.message);
        }

        const prevChapter = chapters[chapterIndex - 1];
        const nextChapter = chapters[chapterIndex + 1];

        const navButtons = `
            ${prevChapter ? `<button onclick="location.href='read.html?novelId=${novel.id}&chapterId=${prevChapter.id}'" title="Bab Sebelumnya"><i class="fas fa-arrow-left"></i> Bab Sebelumnya</button>` : '<div></div>'}
            <button onclick="location.href='detail.html?id=${novel.id}'" title="Daftar Bab"><i class="fas fa-list"></i> Daftar Bab</button>
            ${nextChapter ? `<button onclick="location.href='read.html?novelId=${novel.id}&chapterId=${nextChapter.id}'" title="Bab Selanjutnya">Bab Selanjutnya <i class="fas fa-arrow-right"></i></button>` : '<div></div>'}
        `;

        // Hitung estimasi waktu baca (asumsi rata-rata 200 kata per menit)
        const words = (chapter.content || "").trim().split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        const readingTime = Math.ceil(wordCount / 200);

        // Simpan ke Riwayat Membaca
        addToHistory(novelId);

        // Simpan Penanda Bab Terakhir (Save Point)
        localStorage.setItem(`bookmark_${novelId}`, chapterId);

        // Tambahkan ke daftar bab yang sudah dibaca
        let readChapters = JSON.parse(localStorage.getItem(`read_chapters_${novelId}`)) || [];
        if (!readChapters.includes(chapterId)) {
            readChapters.push(chapterId);
            localStorage.setItem(`read_chapters_${novelId}`, JSON.stringify(readChapters));
        }

        readContainer.innerHTML = `
            <div class="read-header">
                <h2>${novel.title}</h2>
                <h3>${chapter.title}</h3>
            </div>
            <div class="read-actions" style="background: var(--light-bg); padding: 15px; border-radius: 12px; margin-bottom: 30px; border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 8px;">
                    <button id="font-size-decrease" class="btn-action" title="Perkecil Font">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button id="font-size-increase" class="btn-action" title="Perbesar Font">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <button id="dark-mode-toggle" class="btn-action" title="Ganti Tema">
                    <i class="fas fa-moon"></i> Tema
                </button>
                <div class="tts-controls">
                    <select id="tts-voice-select" class="btn-action" title="Pilih Suara" style="max-width: 120px; margin-right: 5px; display: none;"></select>
                    <select id="tts-speed-select" class="btn-action" title="Kecepatan Baca">
                        <option value="0.75">0.75x</option>
                        <option value="1.0" selected>1.0x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2.0">2.0x</option>
                    </select>
                    <select id="tts-sleep-timer" class="btn-action" title="Sleep Timer" style="margin-left: 5px;">
                        <option value="0" selected>⏱️ Off</option>
                        <option value="5">5 Min</option>
                        <option value="15">15 Min</option>
                        <option value="30">30 Min</option>
                        <option value="60">60 Min</option>
                    </select>
                </div>
                <button id="tts-toggle" class="btn-action" title="Dengarkan Novel">
                    <i class="fas fa-play"></i> Audio
                </button>
            </div>
            <div class="read-content">
                ${(chapter.content || "").split(/\r?\n/)
                    .filter(line => line.trim() !== "")
                    .map((p, index) => `<p data-paragraph-index="${index}">${p.trim()}</p>`)
                    .join('')}
            </div>
            <div class="read-navigation">
                ${navButtons}
            </div>

            <div class="comment-section">
                <h3><i class="fas fa-comments"></i> Komentar</h3>
                ${currentUser ? `
                    <form id="comment-form" class="comment-form">
                        <p style="font-size: 0.85rem; margin-bottom: 5px; opacity: 0.8;">Masuk sebagai: <strong>${currentUser.user_metadata?.full_name || currentUser.email}</strong></p>
                        <input type="hidden" id="comment-name" value="${currentUser.user_metadata?.full_name || currentUser.email}">
                        <textarea id="comment-text" placeholder="Tulis komentar..." required></textarea>
                        <button type="submit" class="btn-read">Kirim Komentar</button>
                    </form>
                ` : `
                    <div class="login-prompt" style="text-align: center; padding: 30px; background: var(--light-bg); border: 2px dashed var(--border-color); border-radius: 12px; margin-bottom: 25px;">
                        <p style="margin-bottom: 15px; font-weight: 500;">Silakan login untuk memberikan komentar.</p>
                        <button onclick="handleLogin()" class="btn-read" style="display: inline-flex; align-items: center; gap: 8px;">
                            <i class="fab fa-google"></i> Login / Gabung
                        </button>
                    </div>
                `}
                <div id="comment-list" class="comment-list">
                    <!-- Komentar akan dimuat di sini -->
                </div>
            </div>
        `;
        
        // Update judul halaman browser
        document.title = `${chapter.title} - ${novel.title}`;
        setupFontSizeControl(); // Panggil setelah konten dimuat
        setupReadingProgress(); // Inisialisasi progres membaca
        setupTTS(); // Inisialisasi fitur Text to Speech
        setupComments(novelId, chapterId); // Inisialisasi fitur komentar
    } else {
        readContainer.innerHTML = "<h2>Bab tidak ditemukan.</h2>";
    }
}

// Fungsi untuk mengelola Dark Mode
function setupDarkMode() {
    const toggleBtns = document.querySelectorAll('#dark-mode-toggle');
    // Cek di body atau localStorage
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

    if (toggleBtns.length === 0) return;

    toggleBtns.forEach(btn => {
        const icon = btn.querySelector('i');
        if (document.body.classList.contains('dark-mode') && icon) {
            icon.className = 'fas fa-sun';
        }
    });

    // Fungsi untuk membuat efek partikel cahaya
    const createParticles = (x, y, isToLight) => {
        const count = 12; // Jumlah partikel
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'theme-particle';
            
            // Efek Biru Es jika berpindah ke mode siang (dingin)
            if (isToLight) {
                particle.style.background = '#a5f3fc';
                particle.style.boxShadow = '0 0 10px #a5f3fc';
            }

            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            
            // Arah ledakan acak
            const angle = Math.random() * Math.PI * 2;
            const velocity = 50 + Math.random() * 80;
            particle.style.setProperty('--dx', Math.cos(angle) * velocity + 'px');
            particle.style.setProperty('--dy', Math.sin(angle) * velocity + 'px');
            
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 1000);
        }
    };

    const handleToggle = (e) => {
        const btn = e.currentTarget;
        // Tangkap posisi tengah tombol untuk titik pusat gradasi/penyebaran
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        document.documentElement.style.setProperty('--click-x', x + 'px');
        document.documentElement.style.setProperty('--click-y', y + 'px');

        // Tentukan apakah kita akan berpindah ke mode terang (saat ini masih di mode gelap)
        const isToLight = document.body.classList.contains('dark-mode');

        // Munculkan partikel
        createParticles(x, y, isToLight);

        // Tambahkan animasi putar
        toggleBtns.forEach(b => {
            const icon = b.querySelector('i');
            if (icon) {
                icon.classList.add('rotate-icon');
                setTimeout(() => icon.classList.remove('rotate-icon'), 500);
            }
        });

        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        // Sinkronkan semua ikon dark mode di halaman
        document.querySelectorAll('#dark-mode-toggle i').forEach(i => {
            i.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        });
    };

    toggleBtns.forEach(btn => btn.addEventListener('click', handleToggle));
}

// Fungsi untuk mengelola Komentar
async function setupComments(novelId, chapterId) {
    const form = document.getElementById('comment-form');
    const commentList = document.getElementById('comment-list');

    // Fungsi untuk memuat komentar dari Supabase
    const loadComments = async () => {
        const currentUserIsAdmin = currentUser?.user_metadata?.role === 'admin';
        const currentUserId = currentUser?.id;

        const { data: comments, error } = await window.supabase
            .from('comments')
            .select('*')
            .eq('novel_id', novelId)
            .eq('chapter_id', chapterId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Gagal memuat komentar:", error.message);
            return;
        }

        if (!comments || comments.length === 0) {
            commentList.innerHTML = '<p class="no-comments">Belum ada komentar. Jadilah yang pertama!</p>';
            return;
        }

        // Kelompokkan komentar utama dan balasan
        const parents = comments.filter(c => !c.parent_id);
        const replies = comments.filter(c => c.parent_id);

        commentList.innerHTML = parents.reverse().map(c => {
            const commentReplies = replies.filter(r => r.parent_id === c.id);
            const isOwner = currentUserId === c.user_id;
            const isAdminComment = c.role === 'admin'; // Memerlukan kolom 'role' di tabel comments

            return `
            <div class="comment-item">
                <div class="comment-meta" style="display: flex; align-items: center; gap: 10px;">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random" style="width: 32px; height: 32px; border-radius: 50%;">
                    <strong>${escapeHTML(c.name)}</strong> 
                    ${isAdminComment ? '<span class="read-badge" style="background:var(--primary-color)">ADMIN</span>' : ''}
                    • <small>${new Date(c.created_at).toLocaleString('id-ID')}</small>
                </div>
                <p>${escapeHTML(c.text)}</p>
                <div style="display:flex; gap:10px;">
                    <button class="btn-reply-toggle" data-id="${c.id}">Balas</button>
                    ${(isOwner || currentUserIsAdmin) ? `
                        <button class="btn-delete-comment" data-id="${c.id}" data-type="parent">
                            <i class="fas fa-trash"></i> Hapus
                        </button>
                    ` : ''}
                </div>
                <div class="reply-form-container" id="reply-form-${c.id}" style="display:none; margin-top: 10px;">
                    <div class="comment-form" style="margin-bottom: 0;">
                        <input type="text" class="reply-name" placeholder="Nama Anda" value="${currentUser?.user_metadata?.full_name || ''}" required>
                        <textarea class="reply-text" placeholder="Tulis balasan..." required style="height: 60px;"></textarea>
                        <button type="button" class="btn-submit-reply btn-read" data-id="${c.id}" style="padding: 8px 15px; font-size: 0.9rem;">Kirim</button>
                    </div>
                </div>
                ${commentReplies.length > 0 ? `
                    <div class="reply-list">
                        ${commentReplies.map(r => `
                            <div class="reply-item">
                                <div class="comment-meta" style="display: flex; align-items: center; gap: 10px;">
                                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.name)}&background=random" style="width: 24px; height: 24px; border-radius: 50%;">
                                    <strong>${escapeHTML(r.name)}</strong> • <small>${new Date(r.created_at).toLocaleString('id-ID')}</small>
                                </div>
                                <p>${escapeHTML(r.text)}</p>
                                ${(currentUserId === r.user_id || currentUserIsAdmin) ? `
                                    <button class="btn-delete-comment" data-id="${r.id}" data-type="reply"><i class="fas fa-trash"></i> Hapus</button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `}).join('') || '';
    };

    // Event saat form dikirim
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('comment-name');
        const textInput = document.getElementById('comment-text');
            const isAdmin = currentUser?.user_metadata?.role === 'admin';

        // Fitur Banned User: Validasi sebelum simpan komentar
        const bannedUsers = JSON.parse(localStorage.getItem('banned_users')) || [];
        if (bannedUsers.includes(nameInput.value.trim())) {
            alert('Mohon maaf, nama Anda telah diblokir oleh admin dan tidak dapat mengirim komentar.');
            return;
        }

        const { error } = await window.supabase.from('comments').insert([{
            novel_id: novelId,
            chapter_id: chapterId,
            user_id: currentUser.id, // Menambahkan ID user untuk keamanan RLS
            name: nameInput.value,
                text: textInput.value,
            role: isAdmin ? 'admin' : 'user'
        }]);

        if (error) alert("Gagal mengirim komentar: " + error.message);
        else {
            textInput.value = ''; 
            loadComments();
        }
    });

    // Event delegation untuk tombol balas dan kirim balasan
    commentList.addEventListener('click', async (e) => {
        const target = e.target;

        if (target.classList.contains('btn-reply-toggle')) {
            const commentId = target.getAttribute('data-id');
            const replyForm = document.getElementById(`reply-form-${commentId}`);
            if (replyForm) {
                replyForm.style.display = replyForm.style.display === 'none' ? 'block' : 'none';
            }
        }

        if (target.classList.contains('btn-submit-reply')) {
            const commentId = parseInt(target.getAttribute('data-id'));
            const formContainer = document.getElementById(`reply-form-${commentId}`);
            const nameIn = formContainer.querySelector('.reply-name');
            const textIn = formContainer.querySelector('.reply-text');
            const isAdmin = currentUser?.user_metadata?.role === 'admin';
            if (!nameIn || !textIn || !nameIn.value || !textIn.value) return;

            const { error } = await window.supabase.from('comments').insert([{
                novel_id: novelId,
                chapter_id: chapterId,
                user_id: currentUser.id,
                name: nameIn.value,
                text: textIn.value,
                parent_id: commentId,
                role: isAdmin ? 'admin' : 'user'
            }]);

            if (error) alert("Gagal mengirim balasan: " + error.message);
            else loadComments();
        }

        // Logika Hapus Komentar atau Balasan
        if (target.classList.contains('btn-delete-comment') || target.closest('.btn-delete-comment')) {
            const btn = target.classList.contains('btn-delete-comment') ? target : target.closest('.btn-delete-comment');
            const idToDelete = parseInt(btn.getAttribute('data-id'));

            if (confirm('Apakah Anda yakin ingin menghapus pesan ini?')) {
                const { error } = await window.supabase
                    .from('comments')
                    .delete()
                    .eq('id', idToDelete);

                if (error) {
                    alert("Gagal menghapus komentar: " + error.message);
                } else {
                    loadComments();
                }
            }
        }
    });

    loadComments();
}

// Fungsi untuk mengelola Ukuran Font
function setupFontSizeControl() {
    const readContent = document.querySelector('.read-content');
    if (!readContent) return;

    const fontSizes = ['font-small', 'font-medium', 'font-large', 'font-xlarge'];
    let currentSizeIndex = 1; // Default ke 'font-medium'

    // Bersihkan class lama sebelum menerapkan yang baru
    fontSizes.forEach(size => readContent.classList.remove(size));

    const savedFontSize = localStorage.getItem('fontSize');
    if (savedFontSize) {
        currentSizeIndex = fontSizes.indexOf(savedFontSize);
        if (currentSizeIndex === -1) currentSizeIndex = 1; // Fallback jika tidak valid
        readContent.classList.add(fontSizes[currentSizeIndex]);
    } else {
        readContent.classList.add(fontSizes[currentSizeIndex]); // Terapkan default
    }

    document.getElementById('font-size-decrease')?.addEventListener('click', () => {
        if (currentSizeIndex > 0) {
            readContent.classList.remove(fontSizes[currentSizeIndex]);
            currentSizeIndex--;
            readContent.classList.add(fontSizes[currentSizeIndex]);
            localStorage.setItem('fontSize', fontSizes[currentSizeIndex]);
        }
    });

    document.getElementById('font-size-increase')?.addEventListener('click', () => {
        if (currentSizeIndex < fontSizes.length - 1) {
            readContent.classList.remove(fontSizes[currentSizeIndex]);
            currentSizeIndex++;
            readContent.classList.add(fontSizes[currentSizeIndex]);
            localStorage.setItem('fontSize', fontSizes[currentSizeIndex]);
        }
    });
}

// Fungsi untuk menghitung progres membaca
function setupReadingProgress() {
    const progressBar = document.getElementById('reading-progress');
    if (!progressBar) return;

    window.addEventListener('scroll', () => {
        const winScroll = window.scrollY;
        const height = document.documentElement.scrollHeight - window.innerHeight;
        const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
        
        progressBar.style.width = scrolled + "%";
    });
}

// --- LOGIKA TEXT TO SPEECH (TTS) ---
function setupTTS() {
    const synth = window.speechSynthesis;
    const ttsBtn = document.getElementById('tts-toggle');
    const speedSelect = document.getElementById('tts-speed-select');
    const voiceSelect = document.getElementById('tts-voice-select');
    const sleepSelect = document.getElementById('tts-sleep-timer');
    const contentArea = document.querySelector('.read-content');
    
    if (!ttsBtn || !contentArea || !speedSelect || !voiceSelect || !sleepSelect) return;

    let voices = [];
    let isSpeaking = false;
    let isPaused = false;
    let currentParagraphIndex = 0;
    let paragraphElements = Array.from(contentArea.querySelectorAll('p[data-paragraph-index]'));
    let currentUtterance = null;
    let sleepTimeout = null;
    let wakeLock = null;

    // Fungsi untuk meminta Wake Lock agar layar tidak mati
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) { console.error("Gagal mengaktifkan Wake Lock:", err); }
        }
    };

    // Fungsi untuk melepas Wake Lock
    const releaseWakeLock = () => {
        if (wakeLock) {
            wakeLock.release().then(() => wakeLock = null);
        }
    };

    // Muat preferensi kecepatan dari LocalStorage
    const savedSpeed = localStorage.getItem('ttsSpeed');
    if (savedSpeed) speedSelect.value = savedSpeed;

    // Fungsi memuat daftar suara yang tersedia di browser
    const loadVoices = () => {
        voices = synth.getVoices();
        // Prioritaskan suara bahasa Indonesia (id-ID)
        const idVoices = voices.filter(v => v.lang.includes('id') || v.lang.includes('ID'));
        const listToUse = idVoices.length > 0 ? idVoices : voices;

        if (listToUse.length > 0) {
            voiceSelect.style.display = 'block';
            voiceSelect.innerHTML = listToUse.map(v => 
                `<option value="${v.name}">${v.name}</option>`
            ).join('');
            
            // Muat preferensi suara dari LocalStorage
            const savedVoice = localStorage.getItem('ttsVoice');
            if (savedVoice && listToUse.some(v => v.name === savedVoice)) {
                voiceSelect.value = savedVoice;
            }
        }
    };

    // Chrome membutuhkan event listener ini karena pemuatan suara bersifat asinkron
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }
    loadVoices();

    const stopTTS = () => {
        if (sleepTimeout) clearTimeout(sleepTimeout);
        releaseWakeLock();
        synth.cancel();
        isSpeaking = false;
        isPaused = false;
        paragraphElements.forEach(p => p.classList.remove('highlight'));
        updateTTSUI();
    };

    const speakCurrentParagraph = () => {
        if (currentParagraphIndex >= paragraphElements.length) {
            stopTTS();
            currentParagraphIndex = 0;
            return;
        }

        const paragraph = paragraphElements[currentParagraphIndex];
        currentUtterance = new SpeechSynthesisUtterance(paragraph.innerText);
        
        // Atur Suara yang dipilih
        const selectedVoice = voices.find(v => v.name === voiceSelect.value);
        if (selectedVoice) currentUtterance.voice = selectedVoice;
        
        currentUtterance.rate = parseFloat(speedSelect.value);
        currentUtterance.pitch = 1.0;

        currentUtterance.onstart = () => {
            isSpeaking = true;
            paragraph.classList.add('highlight');
            
            // FITUR AUTO-SCROLL: Gulir otomatis ke paragraf yang sedang dibaca
            paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            updateTTSUI();
        };

        currentUtterance.onend = () => {
            paragraph.classList.remove('highlight');
            currentParagraphIndex++;
            if (isSpeaking && !isPaused) speakCurrentParagraph();
        };

        synth.speak(currentUtterance);
    };

    const startSleepTimer = (minutes) => {
        if (sleepTimeout) clearTimeout(sleepTimeout);
        if (minutes === 0) return;

        sleepTimeout = setTimeout(() => {
            if (isSpeaking) {
                stopTTS();
                alert("Sleep Timer: TTS otomatis dihentikan.");
                sleepSelect.value = "0";
            }
        }, minutes * 60000);
    };

    window.addEventListener('beforeunload', () => synth.cancel());

    ttsBtn.addEventListener('click', () => {
        if (isSpeaking) {
            if (synth.paused) {
                requestWakeLock(); // Aktifkan kembali saat resume
                synth.resume();
                isPaused = false;
            } else {
                releaseWakeLock(); // Lepas saat pause untuk hemat baterai
                synth.pause();
                isPaused = true;
            }
        } else {
            stopTTS();
            currentParagraphIndex = 0;
            requestWakeLock(); // Aktifkan saat mulai membaca
            speakCurrentParagraph();
            
            // Mulai timer jika sudah diset sebelumnya
            if (parseInt(sleepSelect.value) > 0) {
                startSleepTimer(parseInt(sleepSelect.value));
            }
        }
        updateTTSUI();
    });

    // Simpan preferensi dan reset pembacaan jika ada perubahan
    speedSelect.addEventListener('change', () => {
        localStorage.setItem('ttsSpeed', speedSelect.value);
        if (isSpeaking) {
            synth.cancel();
            speakCurrentParagraph();
        }
    });

    voiceSelect.addEventListener('change', () => {
        localStorage.setItem('ttsVoice', voiceSelect.value);
        if (isSpeaking) {
            synth.cancel();
            speakCurrentParagraph();
        }
    });

    sleepSelect.addEventListener('change', () => {
        const minutes = parseInt(sleepSelect.value);
        if (isSpeaking) {
            if (minutes > 0) startSleepTimer(minutes);
            else if (sleepTimeout) clearTimeout(sleepTimeout);
        }
    });

    function updateTTSUI() {
        const icon = ttsBtn.querySelector('i');
        const isActuallyPlaying = isSpeaking && !isPaused;
        icon.className = isActuallyPlaying ? 'fas fa-pause' : 'fas fa-play';
        ttsBtn.classList.toggle('active', isSpeaking);
    }
}

// --- LOGIKA STATISTIK PENGUNJUNG ---
async function updateAndDisplayStats() {
    if (!window.supabase || typeof window.supabase.from !== 'function') return;

    // Pastikan hanya berjalan di halaman utama
    if (!document.getElementById('novel-grid')) return;
    const today = new Date().toLocaleDateString('en-CA'); // Format YYYY-MM-DD

    // Cek apakah ini pengunjung baru menggunakan LocalStorage
    const hasVisited = localStorage.getItem('novelfire_visited');
    const isNewVisitor = !hasVisited;

    // Ambil data statistik saat ini dari tabel 'settings' dengan key 'site_stats'
    const { data } = await window.supabase
        .from('settings')
        .select('value')
        .eq('key', 'site_stats')
        .maybeSingle();

    let stats = data?.value || { total_visits: 0, total_visitors: 0, daily: {} };
    if (!stats.daily) stats.daily = {};
    if (!stats.daily[today]) stats.daily[today] = { visits: 0, visitors: 0 };

    // Update angka (increment)
    stats.total_visits = (stats.total_visits || 0) + 1;
    stats.daily[today].visits = (stats.daily[today].visits || 0) + 1;

    if (isNewVisitor) {
        stats.total_visitors = (stats.total_visitors || 0) + 1;
        stats.daily[today].visitors = (stats.daily[today].visitors || 0) + 1;
        localStorage.setItem('novelfire_visited', 'true');
    }

    // Opsional: Bersihkan data harian yang lebih tua dari 30 hari agar JSON tidak terlalu besar
    const days = Object.keys(stats.daily).sort();
    if (days.length > 30) delete stats.daily[days[0]];

    // Simpan kembali ke Supabase secara asinkron
    await window.supabase
        .from('settings')
        .upsert({ key: 'site_stats', value: stats }, { onConflict: 'key' });

    // Tampilkan ke UI
    const visitCountElem = document.getElementById('visit-count');
    const visitorCountElem = document.getElementById('visitor-count');
    
    if (visitCountElem) visitCountElem.innerText = (stats.total_visits || 0).toLocaleString('id-ID');
    if (visitorCountElem) visitorCountElem.innerText = (stats.total_visitors || 0).toLocaleString('id-ID');
}

// --- LOGIKA FOOTER DINAMIS ---
async function loadDynamicFooter() {
    if (!window.supabase || typeof window.supabase.from !== 'function') return;
    const { data } = await window.supabase
        .from('settings')
        .select('value')
        .eq('key', 'social_links')
        .maybeSingle(); // Menggunakan maybeSingle untuk mencegah error 406 jika data kosong

    if (data && data.value) {
        const links = data.value;
        if (document.getElementById('footer-fb')) document.getElementById('footer-fb').href = links.facebook || '#';
        if (document.getElementById('footer-tw')) document.getElementById('footer-tw').href = links.twitter || '#';
        if (document.getElementById('footer-ig')) document.getElementById('footer-ig').href = links.instagram || '#';
        if (document.getElementById('footer-ds')) document.getElementById('footer-ds').href = links.discord || '#';
    }
}

// --- LOGIKA DOWNLOAD TTS (EXPERIMENTAL) ---
function setupDownloadTTS(content, title) {
    const dlBtn = document.getElementById('tts-download');
    const contentArea = document.querySelector('.read-content');
    if (!dlBtn || !contentArea) return;

    let isDownloadMode = false;

    dlBtn.addEventListener('click', () => {
        isDownloadMode = !isDownloadMode;
        
        if (isDownloadMode) {
            dlBtn.classList.add('active');
            dlBtn.innerHTML = '<i class="fas fa-times"></i> Batal';
            showToast("🎯 Mode Download: Klik ikon 📥 di akhir paragraf untuk mengunduh.");
            contentArea.classList.add('download-mode-active');
        } else {
            resetDownloadMode();
        }
    });

    function resetDownloadMode() {
        isDownloadMode = false;
        dlBtn.classList.remove('active');
        dlBtn.innerHTML = '<i class="fas fa-download"></i> MP3';
        contentArea.classList.remove('download-mode-active');
    }

    contentArea.addEventListener('click', (e) => {
        if (!isDownloadMode) return;
        
        const p = e.target.closest('p[data-paragraph-index]');
        if (p) {
            const text = p.innerText.trim();
            if (text.length === 0) return;

            // Limit Google TTS adalah ~200 karakter. Kita ambil potongan paragraf tersebut.
            const snippet = text.substring(0, 200);
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(snippet)}&tl=id&client=tw-ob`;
            
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            showToast(`📥 Memproses MP3 untuk paragraf ${parseInt(p.dataset.paragraphIndex) + 1}...`);
            resetDownloadMode();
        }
    });
}

// --- LOGIKA BRANDING (LOGO) ---
async function loadSiteConfig() {
    if (!window.supabase || typeof window.supabase.from !== 'function') return;
    const { data } = await window.supabase
        .from('settings')
        .select('value')
        .eq('key', 'site_config')
        .maybeSingle(); // Menggunakan maybeSingle untuk mencegah error 406 jika data kosong

    if (data && data.value && data.value.logo_url) {
        const logoUrl = data.value.logo_url;
        const logoLinks = document.querySelectorAll('header h1 a');
        logoLinks.forEach(link => {
            link.innerHTML = `<img src="${logoUrl}" alt="Logo" class="header-logo">`;
        });
    }
}

// Fungsi untuk mengelola tombol Back to Top
function setupBackToTop() {
    const backToTopBtn = document.getElementById('back-to-top');
    if (!backToTopBtn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Fungsi untuk mengelola Rating
function setupRating(novelId) {
    const stars = document.querySelectorAll('.star-btn');
    const storageKey = `rating_${novelId}`;
    
    const updateUI = (rating) => {
        stars.forEach(btn => {
            const val = btn.getAttribute('data-value');
            btn.classList.toggle('active', val <= rating);
        });
    };

    // Load rating yang sudah ada
    updateUI(localStorage.getItem(storageKey) || 0);

    stars.forEach(btn => {
        btn.addEventListener('click', () => {
            const rating = btn.getAttribute('data-value');
            localStorage.setItem(storageKey, rating);
            updateUI(rating);
            alert(`Terima kasih! Kamu memberikan rating ${rating} bintang.`);
        });
    });
}

// Fungsi untuk menandai bab sebagai belum dibaca
function markAsUnread(novelId, chapterId, event) {
    if (event) event.stopPropagation(); // Mencegah pindah ke halaman baca

    const listItem = event.currentTarget.closest('.chapter-item');
    listItem.classList.add('removing-read-status');

    // Berikan jeda 300ms agar animasi CSS selesai sebelum render ulang
    setTimeout(() => {
        let readChapters = JSON.parse(localStorage.getItem(`read_chapters_${novelId}`)) || [];
        readChapters = readChapters.filter(id => id !== chapterId);

        if (readChapters.length === 0) {
            localStorage.removeItem(`read_chapters_${novelId}`);
        } else {
            localStorage.setItem(`read_chapters_${novelId}`, JSON.stringify(readChapters));
        }

        // Refresh tampilan detail novel
        displayNovelDetail();
    }, 300);
}

// Fungsi untuk menambah/menghapus favorit
function toggleFavorite(id, event) {
    if (event) event.stopPropagation(); // Mencegah klik kartu (redirect ke detail)
    
    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    
    if (favorites.includes(id)) {
        favorites = favorites.filter(favId => favId !== id);
    } else {
        favorites.push(id);
    }
    
    localStorage.setItem('favorites', JSON.stringify(favorites));
    
    // Refresh tampilan
    if (document.getElementById('novel-grid')) {
        displayNovels(novels);
        displayFavorites();
    }
    if (document.getElementById('novel-detail')) {
        displayNovelDetail();
    }
}

// Fungsi untuk mengelola Menu Mobile (Hamburger)
function setupMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.querySelector('nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
        nav.classList.toggle('mobile-active');
        const icon = toggle.querySelector('i');
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-times');
    });
}

// Fungsi untuk menyimpan ke riwayat
function addToHistory(id) {
    let history = JSON.parse(localStorage.getItem('reading_history')) || [];
    
    // Hapus ID jika sudah ada agar tidak duplikat
    history = history.filter(item => item !== id);
    
    // Masukkan ke urutan paling atas
    history.unshift(id);
    
    // Batasi riwayat maksimal 5 novel
    if (history.length > 5) history.pop();
    
    localStorage.setItem('reading_history', JSON.stringify(history));
}

// Fungsi untuk menghapus riwayat
function clearHistory() {
    if (confirm('Hapus semua riwayat membaca?')) {
        localStorage.removeItem('reading_history');
        displayHistory();
    }
}

// Fungsi untuk Navigasi Pintar (Muncul saat scroll up, sembunyi saat scroll down)
function setupSmartNav() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    let lastScrollY = window.pageYOffset;

    window.addEventListener('scroll', () => {
        const currentScrollY = window.pageYOffset;

        // Jangan sembunyikan jika menu mobile sedang terbuka
        if (nav.classList.contains('mobile-active')) return;

        if (currentScrollY > lastScrollY && currentScrollY > 150) {
            // Scroll ke bawah & sudah melewati area header -> Sembunyikan
            nav.classList.add('nav-hidden');
        } else {
            // Scroll ke atas -> Tunjukkan
            nav.classList.remove('nav-hidden');
        }
        lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
    }, { passive: true });
}

// --- LOGIKA SLIDESHOW HERO SECTION ---
let heroSlideshowInterval;
let currentHeroSlideIndex = 0;
let popularNovelsForSlideshow = [];

async function startHeroSlideshow() {
    const heroBgImage = document.getElementById('hero-bg-image');
    const trendingNowButton = document.getElementById('trending-now-button');
    if (!heroBgImage || !trendingNowButton) return;

    // Ambil 5 novel teratas berdasarkan reading_count
    const { data, error } = await window.supabase
        .from('novels')
        .select('id, title, image, reading_count')
        .order('reading_count', { ascending: false, nullsFirst: false }) // Urutkan dari tertinggi, null di akhir
        .limit(5);

    if (error) {
        console.error("Gagal mengambil novel populer untuk slideshow:", error.message);
        // Fallback ke gambar statis jika gagal fetch
        heroBgImage.src = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=80&w=1200';
        heroBgImage.classList.add('active');
        trendingNowButton.href = '#'; // Tidak ada novel spesifik
        return;
    }

    popularNovelsForSlideshow = (data || []).filter(n => n.image); // Saring novel tanpa gambar

    if (popularNovelsForSlideshow.length === 0) {
        // Jika tidak ada novel populer, gunakan gambar fallback
        heroBgImage.src = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=80&w=1200';
        heroBgImage.classList.add('active');
        trendingNowButton.href = '#';
        return;
    }

    const updateSlide = () => {
        const novel = popularNovelsForSlideshow[currentHeroSlideIndex];
        
        // Preload gambar agar transisi mulus
        const img = new Image();
        img.src = novel.image;
        img.onload = () => {
            // Efek fade out singkat dengan menghapus kelas active
            heroBgImage.classList.remove('active');
            
            setTimeout(() => {
                heroBgImage.src = novel.image;
                heroBgImage.classList.add('active');
            }, 100);
        };
        img.onerror = () => {
            console.warn(`Gagal memuat gambar untuk novel ${novel.title}: ${novel.image}`);
            // Fallback ke placeholder jika gambar gagal dimuat
            heroBgImage.src = 'https://via.placeholder.com/1200x800?text=NovelFire';
            heroBgImage.classList.add('active');
        };

        trendingNowButton.href = `detail.html?id=${novel.id}`;
        
        currentHeroSlideIndex = (currentHeroSlideIndex + 1) % popularNovelsForSlideshow.length;
    };

    updateSlide(); // Jalankan slide pertama segera
    heroSlideshowInterval = setInterval(updateSlide, 5000); // Ganti setiap 5 detik
}

// Fungsi Admin: Kelola Data Global (Export/Import)
function exportAllData() {
    const data = {
        custom_novels: JSON.parse(localStorage.getItem('custom_novels')) || [],
        favorites: JSON.parse(localStorage.getItem('favorites')) || [],
        reading_history: JSON.parse(localStorage.getItem('reading_history')) || [],
        banned_users: JSON.parse(localStorage.getItem('banned_users')) || [],
        fontSize: localStorage.getItem('fontSize'),
        theme: localStorage.getItem('theme')
    };
    
    // Ambil semua kunci rating, bookmark, komentar, dan bab terbaca
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('rating_') || key.startsWith('bookmark_') || key.startsWith('comments_') || key.startsWith('read_chapters_')) {
            try {
                data[key] = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                data[key] = localStorage.getItem(key);
            }
        }
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novelfire_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function importData(jsonContent) {
    try {
        const data = JSON.parse(jsonContent);
        Object.keys(data).forEach(key => {
            const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
            localStorage.setItem(key, value);
        });
        alert('Data berhasil diimpor! Halaman akan dimuat ulang.');
        location.reload();
    } catch (e) {
        alert('Format file tidak valid!');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Inisialisasi Supabase terlebih dahulu
    const initialized = await initSupabase();
    if (!initialized) return;

    // Cek sesi user saat halaman dimuat
    await checkUserSession();
    // Muat data global terlebih dahulu
    await loadGlobalData();

    loadDynamicFooter(); // Muat tautan sosial media untuk footer
    loadSiteConfig(); // Muat logo website

    setupDarkMode(); // Harus dipanggil paling awal untuk kenyamanan visual

    if (document.getElementById('novel-grid')) {
        // Cek apakah ada parameter kategori di URL
        const params = new URLSearchParams(window.location.search);
        const catParam = params.get('category') || 'all';

        // Set status active pada nav sesuai parameter
        document.querySelectorAll('.nav-link').forEach(l => {
            l.classList.toggle('active', l.getAttribute('data-category') === catParam);
        });

        const filteredNovels = catParam === 'all' 
            ? novels 
            : novels.filter(n => n.category === catParam);

        displayNovels(filteredNovels);
        displayFavorites();
        displayHistory();
        displayLatestUpdates();
        setupSearch();
        updateAndDisplayStats(); // Jalankan statistik di halaman utama
        startHeroSlideshow(); // Mulai slideshow di halaman utama
    }
    if (document.getElementById('novel-detail')) {
        await displayNovelDetail();
    }
    if (document.getElementById('read-container')) {
        await displayReadingContent();
    }
    setupFilters(); // Panggil di semua halaman agar navigasi berfungsi
    setupMobileMenu();
    setupSmartNav();
    setupBackToTop();
});

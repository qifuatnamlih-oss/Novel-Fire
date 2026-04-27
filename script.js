// Fungsi Inisialisasi Google Translate
window.googleTranslateElementInit = function() {
    new google.translate.TranslateElement({
        pageLanguage: 'id', // Bahasa asal website
        includedLanguages: 'en,ko,zh-CN,ja,id', // Bahasa yang tersedia
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
    }, 'google_translate_element');
}

// Data novel dalam bentuk Array of Objects
window.novels = window.novels || [];
// Inisialisasi Supabase Client
const SUPABASE_CONFIG = {
    url: 'https://lvfwgvzdididpkgkjzfz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2ZndndnpkaWRpZHBrZ2tqemZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODI3MzEsImV4cCI6MjA5MjQ1ODczMX0.B5hbm_p3ZTHCFhQX4_eqzWydRbZGddnXF8KOEJrDSW4'
};

// Inisialisasi Supabase Client secara global
try {
    // Memastikan library Supabase dari CDN sudah siap
    if (typeof supabase !== 'undefined') {
        window.supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true 
            }
        });
    } else {
        console.error("Supabase Error: Library CDN tidak ditemukan.");
    }
} catch (error) {
    console.error("Gagal menginisialisasi Supabase Client:", error.message);
}

// --- LOGIKA AUTH & PROFIL ---
let currentUser = null;

async function checkUserSession() {
    const { data: { session } } = await window.supabase.auth.getSession();
    currentUser = session ? session.user : null;
    updateAuthUI();
    if (currentUser) {
        listenToNotifications();
        fetchNotifications();
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
        nav.insertBefore(authBtn, document.getElementById('google_translate_element'));
    }

    if (currentUser) {
        authBtn.innerHTML = `
            <div class="user-profile-nav" onclick="toggleUserMenu()">
                <img src="${currentUser.user_metadata.avatar_url || 'https://via.placeholder.com/30'}" class="nav-avatar">
                <span class="notification-badge" id="noti-badge" style="display:none;"></span>
            </div>
            <div id="user-menu" class="user-menu-dropdown" style="display:none;">
                <p>Halo, <strong>${currentUser.user_metadata.full_name || 'User'}</strong></p>
                <hr>
                <a href="#" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </div>
        `;
    } else {
        authBtn.innerHTML = `<button onclick="handleLogin()" class="btn-read" style="padding: 5px 15px; font-size: 0.8rem;">Login</button>`;
    }
}

window.handleLogin = async function() {
    const { error } = await window.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href }
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
            showNotificationToast("Seseorang membalas komentar Anda!");
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
async function loadGlobalData() {
    try {
        if (!window.supabase || typeof window.supabase.from !== 'function') {
            console.warn("Supabase client belum siap atau gagal dimuat.");
            return false;
        }

        const { data, error } = await window.supabase
            .from('novels') // Nama tabel novel Anda di Supabase
            .select('*'); // Ambil semua kolom
        
        if (error) {
            console.error("Error fetching novels from Supabase:", error.message);
            return false;
        }
        
        novels = data || [];
        console.log("Data novel berhasil dimuat dari Supabase Global:", novels);
        return true; // Berhasil memuat data
    } catch (error) {
        console.error("Kesalahan saat memuat data novel dari Supabase:", error);
        return false;
    }
}

// Sortir ID untuk memastikan ID unik jika admin menambah novel baru
const getNextNovelId = () => {
    return novels.length > 0 ? Math.max(...novels.map(n => n.id)) + 1 : 1;
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
        <div class="novel-card" onclick="location.href='${targetUrl}'" title="${novel.title}">
            <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(${novel.id}, event)" aria-label="Tambah ke Favorit">
                <i class="fas fa-heart"></i>
            </button>
            <img src="${novel.image}" alt="Cover ${novel.title}" loading="lazy">
            <h3>${novel.title}</h3>
            <p class="author-link" style="font-size: 0.8rem; color: var(--primary-color); margin: -5px 0 5px; cursor: pointer;" onclick="filterByAuthor('${(novel.author || 'Anonim').replace(/'/g, "\\'")}', event)">
                ${novel.author || 'Anonim'}
            </p>
            <div class="rating">${stars}</div>
            <p style="font-size: 0.85rem; color: #888;"><strong>${novel.category}</strong> • ${novel.genre}</p>
        </div>
    `;
}

// Fungsi untuk menampilkan novel ke dalam grid
function displayNovels(novelList) {
    const novelGrid = document.getElementById('novel-grid');
    if (!novelGrid) return;
    
    novelGrid.innerHTML = ''; // Kosongkan grid sebelum mengisi ulang

    if (novelList.length === 0) {
        novelGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Tidak ada novel ditemukan.</p>';
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
function displayNovelDetail() {
    const detailContainer = document.getElementById('novel-detail');
    if (!detailContainer) return;

    const params = new URLSearchParams(window.location.search);
    const novelId = parseInt(params.get('id'));
    const novel = novels.find(n => n.id === novelId);

    if (novel) {
        const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
        const isFav = favorites.includes(novel.id);
        const readChapters = JSON.parse(localStorage.getItem(`read_chapters_${novel.id}`)) || [];

        // Logika Penanda Bab Terakhir untuk tombol utama
        const lastChapterId = localStorage.getItem(`bookmark_${novel.id}`);
        const chapters = novel.chapters || [];
        const startChapterId = lastChapterId || (chapters.length > 0 ? chapters[0].id : null);
        const readBtnText = lastChapterId ? 'Lanjutkan Membaca' : 'Mulai Membaca';

        detailContainer.innerHTML = `
            <div class="detail-header">
                <img src="${novel.image}" alt="${novel.title}">
                <div class="detail-info">
                    <h1>${novel.title}</h1>
                    <p style="font-size: 1.1rem; font-weight: bold; color: var(--primary-color); margin-top: -10px;">Penulis: ${novel.author || 'Anonim'}</p>
                    <div style="margin: 10px 0;">
                        <span class="tag">${novel.category}</span>
                        <span style="margin-left: 10px; color: #888;">${novel.genre}</span>
                    </div>
                    <div class="synopsis">
                        <h3>Sinopsis</h3>
                        <p id="synopsis-content" class="synopsis-content">${novel.description}</p>
                        <button id="read-more-btn" class="read-more-btn" style="display: none;">Baca Selengkapnya</button>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-read" onclick="location.href='read.html?novelId=${novel.id}&chapterId=${startChapterId}'">
                            ${readBtnText}
                        </button>
                        <button class="btn-fav-detail ${isFav ? 'active' : ''}" onclick="toggleFavorite(${novel.id})">
                            <i class="fas fa-heart"></i> ${isFav ? 'Favorit' : 'Tambah Favorit'}
                        </button>
                    </div>

                    <div class="rating-input-container">
                        <span>Berikan Rating: </span>
                        <div class="stars-input" id="stars-input">
                            <button class="star-btn" data-value="1"><i class="fas fa-star"></i></button>
                            <button class="star-btn" data-value="2"><i class="fas fa-star"></i></button>
                            <button class="star-btn" data-value="3"><i class="fas fa-star"></i></button>
                            <button class="star-btn" data-value="4"><i class="fas fa-star"></i></button>
                            <button class="star-btn" data-value="5"><i class="fas fa-star"></i></button>
                        </div>
                    </div>

                    <div class="share-container">
                        <span>Bagikan:</span>
                        <div class="share-buttons">
                            <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(novel.title + ' - Baca di NovelFire: ' + window.location.href)}" target="_blank" class="share-btn whatsapp" title="Bagikan ke WhatsApp"><i class="fab fa-whatsapp"></i></a>
                            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent('Sedang membaca ' + novel.title)}&url=${encodeURIComponent(window.location.href)}" target="_blank" class="share-btn twitter" title="Bagikan ke Twitter"><i class="fab fa-twitter"></i></a>
                            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" target="_blank" class="share-btn facebook" title="Bagikan ke Facebook"><i class="fab fa-facebook-f"></i></a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="chapter-section">
                <h3>Daftar Bab</h3>
                <ul class="chapter-list">
                    ${chapters.map(ch => {
                        const isRead = readChapters.includes(ch.id);
                        return `
                            <li class="chapter-item ${isRead ? 'read' : ''}" onclick="location.href='read.html?novelId=${novel.id}&chapterId=${ch.id}'">
                                <span>
                                    ${ch.title} 
                                    ${isRead ? `<span class="read-badge">Sudah Dibaca</span><button class="btn-unread" onclick="markAsUnread(${novel.id}, ${ch.id}, event)" title="Tandai Belum Dibaca"><i class="fas fa-undo"></i></button>` : ''}
                                </span>
                                <i class="fas fa-chevron-right"></i>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `;

        // Setup interaksi rating
        setupRating(novelId);

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
function displayReadingContent() {
    const readContainer = document.getElementById('read-container');
    if (!readContainer) return;

    const params = new URLSearchParams(window.location.search);
    const novelId = parseInt(params.get('novelId'));
    const chapterId = parseInt(params.get('chapterId'));

    const novel = novels.find(n => n.id === novelId);
    if (!novel) return;

    const chapters = novel.chapters || [];
    const chapterIndex = chapters.findIndex(ch => ch.id === chapterId);
    const chapter = chapters[chapterIndex];

    if (chapter) {
        const prevChapter = chapters[chapterIndex - 1];
        const nextChapter = chapters[chapterIndex + 1];

        const navButtons = `
            ${prevChapter ? `<button onclick="location.href='read.html?novelId=${novel.id}&chapterId=${prevChapter.id}'" title="Bab Sebelumnya"><i class="fas fa-arrow-left"></i> Bab Sebelumnya</button>` : '<div></div>'}
            <button onclick="location.href='detail.html?id=${novel.id}'" title="Daftar Bab"><i class="fas fa-list"></i> Daftar Bab</button>
            ${nextChapter ? `<button onclick="location.href='read.html?novelId=${novel.id}&chapterId=${nextChapter.id}'" title="Bab Selanjutnya">Bab Selanjutnya <i class="fas fa-arrow-right"></i></button>` : '<div></div>'}
        `;

        // Hitung estimasi waktu baca (asumsi rata-rata 200 kata per menit)
        const wordCount = (chapter.content || "").trim().split(/\s+/).length;
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
                <p class="reading-time"><i class="far fa-clock"></i> ${readingTime} menit membaca</p>
            </div>
            <div class="read-navigation top">
                ${navButtons}
            </div>
            <div class="read-actions">
                <button id="font-size-decrease" class="btn-action" title="Perkecil Font">
                    <i class="fas fa-minus"></i> Font
                </button>
                <button id="font-size-increase" class="btn-action" title="Perbesar Font">
                    <i class="fas fa-plus"></i> Font
                </button>
                <button id="dark-mode-toggle" class="btn-action" title="Ganti Tema">
                    <i class="fas fa-moon"></i> Tema
                </button>
            </div>
            <div class="read-content">
                ${(chapter.content || "").split(/\r?\n/)
                    .filter(line => line.trim() !== "")
                    .map(p => `<p>${p.trim()}</p>`)
                    .join('')}
            </div>
            <div class="read-navigation">
                ${navButtons}
            </div>

            <div class="comment-section">
                <h3><i class="fas fa-comments"></i> Komentar</h3>
                <form id="comment-form" class="comment-form">
                    <input type="text" id="comment-name" placeholder="Nama Anda" required>
                    <textarea id="comment-text" placeholder="Tulis komentar..." required></textarea>
                    <button type="submit" class="btn-read">Kirim Komentar</button>
                </form>
                <div id="comment-list" class="comment-list">
                    <!-- Komentar akan dimuat di sini -->
                </div>
            </div>
        `;
        
        // Update judul halaman browser
        document.title = `${chapter.title} - ${novel.title}`;
        setupFontSizeControl(); // Panggil setelah konten dimuat
        setupReadingProgress(); // Inisialisasi progres membaca
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
        const { data: comments, error } = await window.supabase
            .from('comments')
            .select('*, profiles(username, avatar_url)')
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
            return `
            <div class="comment-item">
                <div class="comment-meta" style="display: flex; align-items: center; gap: 10px;">
                    <img src="${c.profiles?.avatar_url || 'https://via.placeholder.com/40'}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <strong>${c.profiles?.username || 'Anonim'}</strong> • <small>${new Date(c.created_at).toLocaleString('id-ID')}</small>
                </div>
                <p>${escapeHTML(c.text)}</p>
                <button class="btn-reply-toggle" data-id="${c.id}">Balas</button>
                <button class="btn-delete-comment" data-id="${c.id}" data-type="parent"><i class="fas fa-trash"></i> Hapus</button>
                <div class="reply-form-container" id="reply-form-${c.id}" style="display:none; margin-top: 10px;">
                    <div class="comment-form" style="margin-bottom: 0;">
                        <textarea class="reply-text" placeholder="Tulis balasan..." required style="height: 60px;"></textarea>
                        <button type="button" class="btn-submit-reply btn-read" data-id="${c.id}" style="padding: 8px 15px; font-size: 0.9rem;">Kirim</button>
                    </div>
                </div>
                ${commentReplies.length > 0 ? `
                    <div class="reply-list">
                        ${commentReplies.map(r => `
                            <div class="reply-item">
                                <div class="comment-meta" style="display: flex; align-items: center; gap: 10px;">
                                    <img src="${r.profiles?.avatar_url || 'https://via.placeholder.com/30'}" style="width: 24px; height: 24px; border-radius: 50%;">
                                    <strong>${r.profiles?.username || 'Anonim'}</strong> • <small>${new Date(r.created_at).toLocaleString('id-ID')}</small>
                                </div>
                                <p>${escapeHTML(r.text)}</p>
                                <button class="btn-delete-comment" data-id="${r.id}" data-type="reply"><i class="fas fa-trash"></i> Hapus</button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    };

    // Event saat form dikirim
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('comment-name');
        const textInput = document.getElementById('comment-text');

        // Fitur Banned User: Validasi sebelum simpan komentar
        const bannedUsers = JSON.parse(localStorage.getItem('banned_users')) || [];
        if (bannedUsers.includes(nameInput.value.trim())) {
            alert('Mohon maaf, nama Anda telah diblokir oleh admin dan tidak dapat mengirim komentar.');
            return;
        }

        const { error } = await window.supabase.from('comments').insert([{
            novel_id: novelId,
            chapter_id: chapterId,
            name: nameInput.value,
            text: textInput.value
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

            if (!nameIn.value || !textIn.value) return;

            const { error } = await window.supabase.from('comments').insert([{
                novel_id: novelId,
                chapter_id: chapterId,
                name: nameIn.value,
                text: textIn.value,
                parent_id: commentId
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
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('rating_') || key.startsWith('bookmark_') || key.startsWith('comments_') || key.startsWith('read_chapters_')) {
            data[key] = JSON.parse(localStorage.getItem(key));
        }
    }

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
    // Muat data global terlebih dahulu
    await loadGlobalData();

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
    }
    if (document.getElementById('novel-detail')) {
        displayNovelDetail();
    }
    if (document.getElementById('read-container')) {
        displayReadingContent();
    }
    setupFilters(); // Panggil di semua halaman agar navigasi berfungsi
    setupMobileMenu();
    setupSmartNav();
    setupBackToTop();
});

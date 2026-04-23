// Data novel dalam bentuk Array of Objects
window.novels = window.novels || [];

// Inisialisasi Supabase Client
// Ganti dengan URL dan Anon Key proyek Supabase Anda
window.SUPABASE_URL = 'https://lvfwgvzdididpkgkjzfz.supabase.co'; 
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2ZndndnpkaWRpZHBrZ2tqemZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODI3MzEsImV4cCI6MjA5MjQ1ODczMX0.B5hbm_p3ZTHCFhQX4_eqzWydRbZGddnXF8KOEJrDSW4'; 

if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true, // Diaktifkan agar admin tidak perlu login ulang setiap refresh
            autoRefreshToken: true,
            detectSessionInUrl: true // WAJIB TRUE untuk fitur reset password
        }
    });
}

// Fungsi untuk memuat data dari data.json (Publik)
async function loadGlobalData() {
    try {
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

// Helper untuk merender HTML kartu novel
function renderNovelCard(novel) {
    const rating = localStorage.getItem(`rating_${novel.id}`) || 0;
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const isFav = favorites.includes(novel.id);
    
    let stars = '';
    for (let i = 1; i <= 5; i++) { // Perbaikan: Menggunakan <= 5 untuk 5 bintang
        stars += `<i class="${i <= rating ? 'fas' : 'far'} fa-star"></i>`;
    }

    // Cek apakah ada penanda bab terakhir
    const lastChapterId = localStorage.getItem(`bookmark_${novel.id}`);
    const targetUrl = lastChapterId 
        ? `read.html?novelId=${novel.id}&chapterId=${lastChapterId}` 
        : `detail.html?id=${novel.id}`;

    return `
        <div class="novel-card" onclick="location.href='${targetUrl}'">
            <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(${novel.id}, event)">
                <i class="fas fa-heart"></i>
            </button>
            <img src="${novel.image}" alt="${novel.title}">
            <h3>${novel.title}</h3>
            <div class="rating">${stars}</div>
            <p><strong>${novel.category}</strong> | ${novel.genre}</p>
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
            e.preventDefault();
            
            // Hapus kelas active dari semua link dan tambah ke yang diklik
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const category = link.getAttribute('data-category');
            
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

        // Filter berdasarkan judul atau genre
        const filtered = novels.filter(novel => 
            (novel.title || "").toLowerCase().includes(searchTerm) || 
            (novel.genre || "").toLowerCase().includes(searchTerm)
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
                    <p class="tag"><strong>${novel.category}</strong></p>
                    <p><strong>Genre:</strong> ${novel.genre}</p>
                    <div class="synopsis">
                        <h3>Sinopsis</h3>
                        <p>${novel.description}</p>
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
                <div class="read-actions">
                    <button id="font-size-decrease" class="btn-action" title="Perkecil Font">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button id="font-size-increase" class="btn-action" title="Perbesar Font">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button id="dark-mode-toggle" class="btn-action" title="Ganti Tema">
                        <i class="fas fa-moon"></i>
                    </button>
                </div>
                <h2>${novel.title}</h2>
                <h3>${chapter.title}</h3>
                <p class="reading-time"><i class="far fa-clock"></i> ${readingTime} menit membaca</p>
            </div>
            <div class="read-content">
                ${(chapter.content || "").split(/\r?\n/)
                    .filter(line => line.trim() !== "")
                    .map(p => `<p>${p.trim()}</p>`)
                    .join('')}
            </div>
            <div class="read-navigation">
                ${prevChapter ? `<button onclick="location.href='read.html?novelId=${novel.id}&chapterId=${prevChapter.id}'"><i class="fas fa-arrow-left"></i> Bab Sebelumnya</button>` : '<div></div>'}
                <button onclick="location.href='detail.html?id=${novel.id}'"><i class="fas fa-list"></i> Daftar Bab</button>
                ${nextChapter ? `<button onclick="location.href='read.html?novelId=${novel.id}&chapterId=${nextChapter.id}'">Bab Selanjutnya <i class="fas fa-arrow-right"></i></button>` : '<div></div>'}
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
    const toggleBtn = document.getElementById('dark-mode-toggle');
    // Cek di body atau localStorage
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

    if (!toggleBtn) return;

    const icon = toggleBtn.querySelector('i');
    if (document.body.classList.contains('dark-mode') && icon) {
        icon.className = 'fas fa-sun';
    }

    toggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    });
}

// Fungsi untuk mengelola Komentar
function setupComments(novelId, chapterId) {
    const form = document.getElementById('comment-form');
    const commentList = document.getElementById('comment-list');
    const storageKey = `comments_${novelId}_${chapterId}`;

    // Fungsi untuk memuat komentar dari localStorage
    const loadComments = () => {
        const comments = JSON.parse(localStorage.getItem(storageKey)) || [];
        if (comments.length === 0) {
            commentList.innerHTML = '<p class="no-comments">Belum ada komentar. Jadilah yang pertama!</p>';
            return;
        }

        commentList.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-meta">
                    <strong>${c.name}</strong> • <small>${c.date}</small>
                </div>
                <p>${escapeHTML(c.text)}</p>
                <button class="btn-reply-toggle" data-id="${c.id}">Balas</button>
                <button class="btn-delete-comment" data-id="${c.id}" data-type="parent"><i class="fas fa-trash"></i> Hapus</button>
                <div class="reply-form-container" id="reply-form-${c.id}" style="display:none; margin-top: 10px;">
                    <div class="comment-form" style="margin-bottom: 0;">
                        <input type="text" class="reply-name" placeholder="Nama Anda" required>
                        <textarea class="reply-text" placeholder="Tulis balasan..." required style="height: 60px;"></textarea>
                        <button type="button" class="btn-submit-reply btn-read" data-id="${c.id}" style="padding: 8px 15px; font-size: 0.9rem;">Kirim</button>
                    </div>
                </div>
                ${c.replies && c.replies.length > 0 ? `
                    <div class="reply-list">
                        ${c.replies.map(r => `
                            <div class="reply-item">
                                <div class="comment-meta"><strong>${r.name}</strong> • <small>${r.date}</small></div>
                                <p>${escapeHTML(r.text)}</p>
                                <button class="btn-delete-comment" data-id="${r.id}" data-type="reply"><i class="fas fa-trash"></i> Hapus</button>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).reverse().join('');
    };

    // Event saat form dikirim
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('comment-name');
        const textInput = document.getElementById('comment-text');

        // Fitur Banned User: Validasi sebelum simpan komentar
        const bannedUsers = JSON.parse(localStorage.getItem('banned_users')) || [];
        if (bannedUsers.includes(nameInput.value.trim())) {
            alert('Mohon maaf, nama Anda telah diblokir oleh admin dan tidak dapat mengirim komentar.');
            return;
        }

        const newComment = {
            id: Date.now(),
            name: nameInput.value,
            text: textInput.value,
            date: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
            replies: []
        };

        const comments = JSON.parse(localStorage.getItem(storageKey)) || [];
        comments.push(newComment);
        localStorage.setItem(storageKey, JSON.stringify(comments));

        textInput.value = ''; // Reset teks saja, nama tetap tersimpan untuk kenyamanan
        loadComments();
    });

    // Event delegation untuk tombol balas dan kirim balasan
    commentList.addEventListener('click', (e) => {
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

            const comments = JSON.parse(localStorage.getItem(storageKey)) || [];
            const parentIndex = comments.findIndex(c => c.id === commentId);

            if (parentIndex !== -1) {
                if (!comments[parentIndex].replies) comments[parentIndex].replies = [];
                comments[parentIndex].replies.push({
                    id: Date.now(),
                    name: nameIn.value,
                    text: textIn.value,
                    date: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                });
                localStorage.setItem(storageKey, JSON.stringify(comments));
                loadComments();
            }
        }

        // Logika Hapus Komentar atau Balasan
        if (target.classList.contains('btn-delete-comment') || target.closest('.btn-delete-comment')) {
            const btn = target.classList.contains('btn-delete-comment') ? target : target.closest('.btn-delete-comment');
            const idToDelete = parseInt(btn.getAttribute('data-id'));
            const type = btn.getAttribute('data-type');

            if (confirm('Apakah Anda yakin ingin menghapus pesan ini?')) {
                let comments = JSON.parse(localStorage.getItem(storageKey)) || [];

                if (type === 'parent') {
                    // Hapus komentar utama beserta balasannya
                    comments = comments.filter(c => c.id !== idToDelete);
                } else {
                    // Hapus balasan spesifik di dalam komentar manapun
                    comments.forEach(c => {
                        if (c.replies) c.replies = c.replies.filter(r => r.id !== idToDelete);
                    });
                }

                localStorage.setItem(storageKey, JSON.stringify(comments));
                loadComments();
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
        displayNovels(novels);
        displayFavorites();
        displayHistory();
        setupFilters();
        setupSearch();
    }
    if (document.getElementById('novel-detail')) {
        displayNovelDetail();
    }
    if (document.getElementById('read-container')) {
        displayReadingContent();
    }
    setupMobileMenu();
    setupSmartNav();
    setupBackToTop();
});

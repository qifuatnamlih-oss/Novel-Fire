// Gunakan pengecekan untuk menghindari deklarasi ganda
if (typeof supabase === 'undefined') {
    const SUPABASE_URL = 'https://lvfwgvzdididpkgkjzfz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2ZndndnpkaWRpZHBrZ2tqemZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODI3MzEsImV4cCI6MjA5MjQ1ODczMX0.B5hbm_p3ZTHCFhQX4_eqzWydRbZGddnXF8KOEJrDSW4';

    // Inisialisasi client secara global hanya jika belum ada
    var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let novels = [];

// Gunakan supabaseClient di dalam fungsi
async function loadGlobalData() {
    try {
        const { data, error } = await supabaseClient
            .from('novels')
            .select('*');
        
        if (error) throw error;
        
        novels = data || [];
        console.log("Data berhasil dimuat:", novels);
        return true;
    } catch (error) {
        console.error("Kesalahan Supabase:", error.message);
        return false;
    }
}
let novels = [];

// 2. Perbaikan fungsi loadGlobalData (Pemisahan data custom & global)
async function loadGlobalData() {
    try {
        const { data, error } = await supabase
            .from('novels')
            .select('*'); 
        
        if (error) throw error;
        
        // Gabungkan data dari Supabase dengan data lokal buatan user (jika ada)
        const customNovels = JSON.parse(localStorage.getItem('custom_novels')) || [];
        novels = [...data, ...customNovels];
        
        console.log("Data novel berhasil dimuat:", novels);
        return true;
    } catch (error) {
        console.error("Kesalahan saat memuat data:", error.message);
        // Fallback ke data lokal jika koneksi gagal
        novels = JSON.parse(localStorage.getItem('custom_novels')) || [];
        return false;
    }
}

// 3. Perbaikan renderNovelCard (Sanitasi Event)
function renderNovelCard(novel) {
    if (!novel) return '';
    
    const rating = localStorage.getItem(`rating_${novel.id}`) || 0;
    const favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    const isFav = favorites.includes(novel.id);
    
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += `<i class="${i <= rating ? 'fas' : 'far'} fa-star"></i>`;
    }

    const lastChapterId = localStorage.getItem(`bookmark_${novel.id}`);
    const targetUrl = lastChapterId 
        ? `read.html?novelId=${novel.id}&chapterId=${lastChapterId}` 
        : `detail.html?id=${novel.id}`;

    // Gunakan stopPropagation pada tombol favorit agar tidak memicu click pada card
    return `
        <div class="novel-card" onclick="location.href='${targetUrl}'">
            <button class="fav-btn ${isFav ? 'active' : ''}" 
                    onclick="event.stopPropagation(); toggleFavorite(${novel.id})">
                <i class="fas fa-heart"></i>
            </button>
            <img src="${novel.image || 'placeholder.jpg'}" alt="${novel.title}" loading="lazy">
            <h3>${novel.title}</h3>
            <div class="rating">${stars}</div>
            <p><strong>${novel.category}</strong> | ${novel.genre}</p>
        </div>
    `;
}

// 4. Perbaikan setupSearch (Menghindari error null)
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => link.classList.remove('active'));
        const allLink = document.querySelector('[data-category="all"]');
        if (allLink) allLink.classList.add('active');

        const filtered = novels.filter(novel => 
            novel.title.toLowerCase().includes(searchTerm) || 
            novel.genre.toLowerCase().includes(searchTerm)
        );

        displayNovels(filtered);
    });
}

// 5. Perbaikan displayNovelDetail (Handling ID Bab)
function displayNovelDetail() {
    const detailContainer = document.getElementById('novel-detail');
    if (!detailContainer) return;

    const params = new URLSearchParams(window.location.search);
    const novelId = parseInt(params.get('id'));
    const novel = novels.find(n => n.id === novelId);

    if (!novel) {
        detailContainer.innerHTML = "<h2>Novel tidak ditemukan.</h2>";
        return;
    }

    // Pengecekan keamanan jika chapters kosong
    const chapters = novel.chapters || [];
    const lastChapterId = localStorage.getItem(`bookmark_${novel.id}`);
    const startChapterId = lastChapterId || (chapters.length > 0 ? chapters[0].id : null);
    
    // ... (sisa logika render detail tetap sama, pastikan tombol "Mulai Membaca" punya link valid)
}

// 6. Inisialisasi DOMContentLoaded yang lebih aman
document.addEventListener('DOMContentLoaded', async () => {
    const isLoaded = await loadGlobalData();
    
    setupDarkMode();
    setupMobileMenu();
    setupSmartNav();
    setupBackToTop();

    // Jalankan fungsi sesuai keberadaan elemen di halaman
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
});

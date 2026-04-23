// Menggunakan pengecekan agar tidak terjadi deklarasi ganda
if (typeof SUPABASE_CONFIG === 'undefined') {
    var SUPABASE_CONFIG = {
        URL: 'https://lvfwgvzdididpkgkjzfz.supabase.co',
        KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2ZndndnpkaWRpZHBrZ2tqemZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODI3MzEsImV4cCI6MjA5MjQ1ODczMX0.B5hbm_p3ZTHCFhQX4_eqzWydRbZGddnXF8KOEJrDSW4'
    };
}

// Inisialisasi variabel global secara aman
var db = window.supabase ? window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY) : null;
var novels = [];

/** * 1. FUNGSI LOAD DATA
 */
async function loadGlobalData() {
    if (!db) {
        console.error("Supabase tidak terdeteksi!");
        return false;
    }

    try {
        const { data, error } = await db.from('novels').select('*');
        if (error) throw error;
        
        // Gabungkan dengan data custom lokal jika ada (fitur admin)
        const localNovels = JSON.parse(localStorage.getItem('custom_novels')) || [];
        novels = [...data, ...localNovels];
        
        return true;
    } catch (err) {
        console.error("Gagal memuat data:", err.message);
        // Fallback jika database offline
        novels = JSON.parse(localStorage.getItem('custom_novels')) || [];
        return false;
    }
}

/** * 2. RENDERER
 */
function renderNovelCard(novel) {
    if (!novel) return '';
    const lastChapterId = localStorage.getItem(`bookmark_${novel.id}`);
    const targetUrl = lastChapterId 
        ? `read.html?novelId=${novel.id}&chapterId=${lastChapterId}` 
        : `detail.html?id=${novel.id}`;

    return `
        <div class="novel-card" onclick="location.href='${targetUrl}'">
            <button class="fav-btn" onclick="toggleFavorite(${novel.id}, event)">
                <i class="fas fa-heart"></i>
            </button>
            <img src="${novel.image || 'https://via.placeholder.com/150'}" alt="${novel.title}" loading="lazy">
            <h3>${novel.title}</h3>
            <p><strong>${novel.category}</strong> | ${novel.genre}</p>
        </div>
    `;
}

function displayNovels(list) {
    const grid = document.getElementById('novel-grid');
    if (!grid) return;
    grid.innerHTML = list.length ? list.map(n => renderNovelCard(n)).join('') : '<p>Tidak ada novel ditemukan.</p>';
}

/** * 3. FITUR SEARCH & FILTER
 */
function setupSearchAndFilters() {
    const search = document.getElementById('search-input');
    const links = document.querySelectorAll('.nav-link');

    search?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = novels.filter(n => n.title.toLowerCase().includes(term));
        displayNovels(filtered);
    });

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const cat = link.getAttribute('data-category');
            const filtered = cat === 'all' ? novels : novels.filter(n => n.category === cat);
            displayNovels(filtered);
        });
    });
}

/** * 4. RIWAYAT & FAVORIT
 */
function displayHistory() {
    const container = document.getElementById('history-section');
    const grid = document.getElementById('history-grid');
    const ids = JSON.parse(localStorage.getItem('reading_history')) || [];
    
    const items = ids.map(id => novels.find(n => n.id === id)).filter(Boolean);
    if (items.length > 0 && container && grid) {
        container.style.display = 'block';
        grid.innerHTML = items.map(n => renderNovelCard(n)).join('');
    }
}

function clearHistory() {
    if (confirm('Hapus riwayat?')) {
        localStorage.removeItem('reading_history');
        location.reload();
    }
}

function toggleFavorite(id, e) {
    if (e) e.stopPropagation();
    let favs = JSON.parse(localStorage.getItem('favorites')) || [];
    if (favs.includes(id)) favs = favs.filter(f => f !== id);
    else favs.push(id);
    localStorage.setItem('favorites', JSON.stringify(favs));
    location.reload(); // Refresh simpel untuk update UI
}

/** * 5. INISIALISASI AKHIR
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Jalankan load data
    const success = await loadGlobalData();
    
    // Setup UI
    if (document.getElementById('novel-grid')) {
        displayNovels(novels);
        setupSearchAndFilters();
        displayHistory();
    }

    // Fungsi tambahan (Dark mode, Back to top, dll)
    setupExtraUI();
});

function setupExtraUI() {
    const btt = document.getElementById('back-to-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) btt?.classList.add('show');
        else btt?.classList.remove('show');
    });
    btt?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

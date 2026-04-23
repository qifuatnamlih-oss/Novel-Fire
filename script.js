// Konfigurasi menggunakan var untuk menghindari redeclaration error
var SUPABASE_URL = 'https://lvfwgvzdididpkgkjzfz.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2ZndndnpkaWRpZHBrZ2tqemZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODI3MzEsImV4cCI6MjA5MjQ1ODczMX0.B5hbm_p3ZTHCFhQX4_eqzWydRbZGddnXF8KOEJrDSW4';

// Inisialisasi client
var _supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
var allNovels = [];

/**
 * Memuat data dari Supabase
 */
async function fetchNovels() {
    if (!_supabase) return;
    try {
        const { data, error } = await _supabase.from('novels').select('*');
        if (error) throw error;
        allNovels = data || [];
        renderNovels(allNovels);
    } catch (err) {
        console.error("Gagal ambil data:", err.message);
        document.getElementById('novel-grid').innerHTML = `<p>Gagal terhubung ke database. Coba matikan Shield browser Anda.</p>`;
    }
}

/**
 * Menampilkan kartu novel ke HTML
 */
function renderNovels(dataList) {
    const grid = document.getElementById('novel-grid');
    if (!grid) return;

    if (dataList.length === 0) {
        grid.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Novel tidak ditemukan.</p>';
        return;
    }

    grid.innerHTML = dataList.map(novel => `
        <div class="novel-card" onclick="location.href='detail.html?id=${novel.id}'">
            <img src="${novel.image || 'https://via.placeholder.com/150'}" alt="${novel.title}">
            <div class="novel-info">
                <h3>${novel.title}</h3>
                <p>${novel.category} | ${novel.genre || 'General'}</p>
            </div>
        </div>
    `).join('');
}

/**
 * Filter & Search
 */
function initFilters() {
    const searchInput = document.getElementById('search-input');
    const navLinks = document.querySelectorAll('.nav-link');

    searchInput?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allNovels.filter(n => n.title.toLowerCase().includes(term));
        renderNovels(filtered);
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const category = link.getAttribute('data-category');
            const filtered = (category === 'all') ? allNovels : allNovels.filter(n => n.category === category);
            renderNovels(filtered);
        });
    });
}

// Jalankan fungsi saat halaman siap
document.addEventListener('DOMContentLoaded', () => {
    fetchNovels();
    initFilters();
    
    // Back to top logic
    const btt = document.getElementById('back-to-top');
    window.onscroll = () => {
        if (window.scrollY > 300) btt?.classList.add('show');
        else btt?.classList.remove('show');
    };
    btt?.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
});

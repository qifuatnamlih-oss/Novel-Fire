import { initSupabase, getSupabase } from './modules/supabase-client.js';
import { loadGlobalData, fetchNovelDetail, getNovels, updateNovelChapters, deleteNovel as dataServiceDeleteNovel, updateNovelDetails, addNovel } from './modules/data-service.js';
import { AppCache } from './modules/cache.js';
import { sanitize } from './modules/utils.js';

// State management
let currentCommentPage = 1;
const commentsPerPage = 10;
let activeNovelIdForChapters = null;
let currentChapterPage = 1;
const chaptersPerPage = 10;
let allChaptersBuffer = []; // Buffer for chapters in the chapter manager UI

// DOM Elements - declared here for broader scope
let form, formTitle, submitBtn, cancelBtn, novelIdField;
let editChapterModal, editChapterForm, editChapterIndexField, editChapterTitleField, editChapterContentField;
let sortableInstance = null;
let visitorChartInstance = null;

// Fungsi untuk membersihkan cache global (SW & LocalStorage)
function invalidateCache() {
    // Bersihkan SW Cache
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'PURGE_CACHE' });
    }
    // Bersihkan AppCache
    AppCache.clearAll();
}

// --- SISTEM OTENTIKASI SUPABASE ---
async function checkSession() {
    console.log("Admin: Checking user session...");
    const supabase = getSupabase();
    if (!supabase || typeof supabase.auth === 'undefined') {
        console.error("Supabase client belum diinisialisasi.");
        return;
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    const loginSection = document.getElementById('login-section');
    const adminContent = document.getElementById('admin-content');
    
    if (!session) {
        loginSection.style.display = 'block';
        adminContent.style.display = 'none';
        return;
    }

    // Ambil role langsung dari tabel profiles untuk validasi yang lebih kuat
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (profile?.role !== 'admin') {
        console.warn("Admin: Akses ditolak: User bukan admin. Redirecting to index.html.");
        window.location.href = "index.html";
        return;
    }
    
    loginSection.style.display = 'none';
    adminContent.style.display = 'block';
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = prompt("Masukkan email admin Anda:");
    if (!email) return;
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    if (error) alert("Gagal: " + error.message);
    else alert("Tautan pemulihan terkirim!");
}

async function handleLogout() {
    await getSupabase().auth.signOut();
    checkSession();
}

// --- LOGIKA MANAJEMEN KONTEN ---
async function openChapterManager(novelId) {
    activeNovelIdForChapters = novelId;
    document.getElementById('chapter-manager-card').style.display = 'block';
    document.getElementById('chapter-admin-list').innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Memuat...</p>';
    const novel = await fetchNovelDetail(novelId);
    if (!novel) return closeChapterManager();
    document.getElementById('chapter-mgr-title').innerText = `Kelola Bab: ${novel.title}`;
    allChaptersBuffer = novel.chapters || [];
    renderChapterList(1);
    initSortable();
}

function renderChapterList(page = 1) {
    currentChapterPage = page;
    const start = (page - 1) * chaptersPerPage;
    const end = start + chaptersPerPage;
    const paginatedChapters = allChaptersBuffer.slice(start, end);
    
    const listContainer = document.getElementById('chapter-admin-list');
    let html = '';
    
    paginatedChapters.forEach((ch, index) => {
        const realIndex = start + index;
        html += `
            <div class="chapter-admin-item" data-index="${realIndex}">
                <span>${ch.title}</span>
                <div class="admin-actions">
                    <button class="btn-admin" onclick="window.editChapter(${realIndex})"><i class="fas fa-edit"></i></button>
                    <button class="btn-admin btn-danger" onclick="window.deleteChapter(${realIndex})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    });
    
    listContainer.innerHTML = html || '<p style="text-align:center;">Belum ada bab.</p>';
    renderPaginationUI('chapter-pagination-admin', allChaptersBuffer.length, chaptersPerPage, page, 'renderChapterList');
}

function renderPaginationUI(containerId, totalItems, perPage, currentPage, callbackName) {
    const totalPages = Math.ceil(totalItems / perPage);
    let html = '';
    if (totalPages <= 1) { document.getElementById(containerId).innerHTML = ''; return; }

    // Tombol Previous
    if (currentPage > 1) {
        html += `<button class="btn-page" onclick="${callbackName}(${currentPage - 1})" title="Halaman Sebelumnya"><i class="fas fa-chevron-left"></i></button>`;
    }

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="btn-page ${i === currentPage ? 'active' : ''}" onclick="${callbackName}(${i})">${i}</button>`;
    }

    // Tombol Next
    if (currentPage < totalPages) {
        html += `<button class="btn-page" onclick="${callbackName}(${currentPage + 1})" title="Halaman Berikutnya"><i class="fas fa-chevron-right"></i></button>`;
    }

    document.getElementById(containerId).innerHTML = html;
}

function initSortable() {
    const el = document.getElementById('chapter-admin-list');
    if (!el || sortableInstance) return;

    // Inisialisasi SortableJS
    sortableInstance = new Sortable(el, {
        animation: 150,
        ghostClass: 'dragging', // Class CSS saat item ditarik (sudah ada di style.css)
        onEnd: function (evt) {
            const saveBtn = document.getElementById('save-order-btn');
            if (saveBtn) saveBtn.style.display = 'block';

            // Update buffer berdasarkan urutan baru di DOM (lokal per halaman)
            const start = (currentChapterPage - 1) * chaptersPerPage;
            
            // Ambil subset bab yang sedang tampil di halaman ini
            const pageSubSet = allChaptersBuffer.slice(start, start + chaptersPerPage);
            
            // Pindahkan item di dalam array sesuai hasil drag
            const movedItem = pageSubSet.splice(evt.oldIndex, 1)[0];
            pageSubSet.splice(evt.newIndex, 0, movedItem);
            
            // Masukkan kembali subset yang sudah diurutkan ke buffer utama
            allChaptersBuffer.splice(start, pageSubSet.length, ...pageSubSet);
        }
    });
}

function editChapter(index) {
    const ch = allChaptersBuffer[index];
    if (!ch) return;
    editChapterIndexField.value = index;
    editChapterTitleField.value = ch.title;
    editChapterContentField.value = ch.content;
    editChapterModal.style.display = 'flex'; // Menggunakan flex agar rata tengah sesuai CSS modal
}

async function deleteChapter(index) {
    if (!confirm("Hapus bab ini?")) return;
    allChaptersBuffer.splice(index, 1);
    const { success, error } = await updateNovelChapters(activeNovelIdForChapters, allChaptersBuffer);
    if (success) {
        renderChapterList(currentChapterPage);
        invalidateCache();
    } else {
        alert("Gagal menghapus: " + error.message);
    }
}

function closeChapterManager() {
    document.getElementById('chapter-manager-card').style.display = 'none';
    document.getElementById('save-order-btn').style.display = 'none';
    activeNovelIdForChapters = null;
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
}

function resetChapterForm() {
    document.getElementById('chapter-form').reset();
    document.getElementById('ch-id').value = '';
    document.getElementById('ch-cancel-btn').style.display = 'none';
}

/**
 * Sembunyikan form novel dan reset state input
 */
function resetForm() {
    if (!form) return;
    form.style.display = 'none';
    form.reset();
    if (novelIdField) novelIdField.value = '';
    
    // Kembalikan teks UI ke default
    if (formTitle) formTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Tambah Novel Baru';
    if (submitBtn) submitBtn.innerText = 'Simpan ke Database';
    if (cancelBtn) cancelBtn.classList.add('display-none');
    
    const preview = document.getElementById('image-preview');
    if (preview) preview.src = 'https://placehold.co/150x200?text=Preview';
}

async function handleBulkChapterUpload() {
    const bulkUploadBtn = document.getElementById('bulk-upload-btn');
    const fileInput = document.getElementById('bulk-chapter-file');
    const statusIndicator = document.getElementById('bulk-upload-status');
    const progressContainer = document.getElementById('bulk-progress-container');
    const progressBar = document.getElementById('bulk-progress-bar');
    
    const file = fileInput.files[0];
    if (!file || !activeNovelIdForChapters) return alert("Pilih file.");
    
    bulkUploadBtn.disabled = true;
    statusIndicator.style.display = 'block';
    progressContainer.style.display = 'block';
    
    const originalBtnText = bulkUploadBtn.innerText;
    
    const text = await file.text();
    const segments = text.split(/###\s+/).filter(s => s.trim() !== "");
    const useAI = document.getElementById('ai-refine-toggle').checked;
    const newChapters = [];
    const baseId = Date.now();

    for (let i = 0; i < segments.length; i++) {
        bulkUploadBtn.innerText = `Memproses ${i + 1}/${segments.length}...`;
        progressBar.style.width = `${((i + 1) / segments.length) * 100}%`;

        const lines = segments[i].split('\n');
        const title = lines[0]?.trim() || `Bab Baru ${i + 1}`;
        let content = lines.slice(1).join('\n').trim();

        // Tambahkan Catatan Penerjemah jika ada
        const customNote = document.getElementById('bulk-custom-note').value;
        if (customNote) content += `\n\n---\n${customNote}`;

        if (useAI) {
            try {
                const customPrompt = document.getElementById('bulk-ai-prompt').value;
                const aiRes = await fetch('/api/refine-content', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, customPrompt }) 
                });
                if (aiRes.ok) { 
                    const data = await aiRes.json(); 
                    content = data.refinedContent; 
                }
            } catch (err) {
                console.error(`Gagal memproses AI untuk bab ${title}:`, err);
            }
            if (i < segments.length - 1) await new Promise(r => setTimeout(r, 5000));
        }
        newChapters.push({ id: baseId + i, title, content });
    }

    const currentNovelData = await fetchNovelDetail(activeNovelIdForChapters); // Fetch the latest data to ensure we have the most current chapters
    let updatedChapters;
    
    if (document.getElementById('bulk-overwrite-toggle').checked) {
        // Mode Update: Ganti konten jika judul sama, jika tidak ada maka tambah baru
        updatedChapters = [...(currentNovelData.chapters || [])];
        newChapters.forEach(newCh => {
            const idx = updatedChapters.findIndex(oldCh => oldCh.title === newCh.title);
            if (idx !== -1) updatedChapters[idx] = newCh;
            else updatedChapters.push(newCh);
        });
    } else {
        updatedChapters = [...(currentNovelData.chapters || []), ...newChapters];
    }

    const { success, error } = await updateNovelChapters(activeNovelIdForChapters, updatedChapters);

    if (success) {
        allChaptersBuffer = updatedChapters; // Update the local buffer for the chapter manager UI
        renderChapterList(1); 
        invalidateCache();
        alert("Selesai! Cache pengunjung akan diperbarui otomatis."); 
    } else {
        alert("Gagal menyimpan ke database: " + error.message);
    }

    bulkUploadBtn.disabled = false;
    bulkUploadBtn.innerText = originalBtnText;
    statusIndicator.style.display = 'none';
    setTimeout(() => { progressContainer.style.display = 'none'; progressBar.style.width = '0%'; }, 2000);
}

/**
 * Menampilkan form untuk edit novel dengan data yang ada dari Supabase
 */
async function editNovel(novelId) {
    const novel = await fetchNovelDetail(novelId);
    if (!novel) return alert("Novel tidak ditemukan.");

    // Ubah UI form ke mode Edit
    formTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Novel: ' + novel.title;
    novelIdField.value = novel.id;
    document.getElementById('adm-title').value = novel.title || '';
    document.getElementById('adm-category').value = novel.category || 'China';
    document.getElementById('adm-genre').value = Array.isArray(novel.genre) ? novel.genre.join(', ') : (novel.genre || '');
    document.getElementById('adm-author').value = novel.author || '';
    document.getElementById('adm-desc').value = novel.description || '';
    document.getElementById('adm-image-url-hidden').value = novel.image || '';
    
    const preview = document.getElementById('image-preview');
    if (preview) preview.src = novel.image || 'https://placehold.co/150x200?text=Preview';

    submitBtn.innerText = 'Update Novel';
    cancelBtn.classList.remove('display-none');
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Menampilkan form tambah novel baru (reset form)
 */
function showAddNovelForm() {
    resetForm();
    form.style.display = 'block';
    cancelBtn.classList.remove('display-none');
    form.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Handle pengiriman form novel (Tambah atau Update) ke database Supabase
 */
async function handleNovelFormSubmit(e) {
    e.preventDefault();
    const id = novelIdField.value;
    const imageFile = document.getElementById('adm-image').files[0];
    let imageUrl = document.getElementById('adm-image-url-hidden').value;

    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerText;
    submitBtn.innerText = 'Menyimpan...';

    // Handle Upload Gambar jika ada file baru
    if (imageFile) {
        const fileName = `covers/${Date.now()}_${imageFile.name}`;
        const { data, error: uploadError } = await getSupabase().storage.from('covers').upload(fileName, imageFile);
        if (uploadError) {
            alert("Gagal upload cover: " + uploadError.message);
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
            return;
        }
        const { data: { publicUrl } } = getSupabase().storage.from('covers').getPublicUrl(fileName);
        imageUrl = publicUrl;
    }

    const novelData = {
        title: document.getElementById('adm-title').value,
        category: document.getElementById('adm-category').value,
        genre: document.getElementById('adm-genre').value.split(',').map(g => g.trim()).filter(g => g !== ""),
        author: document.getElementById('adm-author').value,
        description: document.getElementById('adm-desc').value,
        image: imageUrl
    };

    let result;
    if (id) {
        // Update data novel yang sudah ada
        result = await updateNovelDetails(id, novelData);
    } else {
        // Tambahkan novel baru
        result = await addNovel(novelData);
    }

    if (result.success) {
        alert("Data novel berhasil disimpan!");
        resetForm();
        await loadGlobalData(); // Sinkronkan ulang cache lokal agar list terupdate
        renderAdminNovels();
        invalidateCache(); // Bersihkan cache Service Worker pengunjung
    } else {
        alert("Gagal menyimpan data novel: " + result.error);
    }

    submitBtn.disabled = false;
    submitBtn.innerText = originalBtnText;
}

/**
 * Hapus novel dari database
 */
async function deleteNovel(novelId) {
    if (!confirm("Apakah Anda yakin ingin menghapus novel ini? Semua bab terkait juga akan hilang.")) return;
    const result = await dataServiceDeleteNovel(novelId);
    if (result.success) {
        alert("Novel berhasil dihapus.");
        renderAdminNovels();
        invalidateCache();
    } else {
        alert("Gagal menghapus: " + result.error);
    }
}

function renderAdminNovels(filterTerm = '') {
    const listContainer = document.getElementById('admin-novels-list');
    const filtered = getNovels().filter(n => n.title.toLowerCase().includes(filterTerm.toLowerCase()));
    let html = `<table class="admin-table"><thead><tr><th>Judul</th><th>Aksi</th></tr></thead><tbody>`;
    filtered.forEach(n => {
        html += `<tr><td>${sanitize(n.title)}</td><td><button class="btn-admin" onclick="editNovel(${n.id})">Edit</button> <button class="btn-admin" onclick="openChapterManager(${n.id})">Bab</button></td></tr>`;
    });
    listContainer.innerHTML = html + '</tbody></table>';
}

async function loadSiteSettings() {
    const { data } = await getSupabase().from('settings').select('value').eq('key', 'site_config').maybeSingle();
    if (data?.value) {
        document.getElementById('site-logo-url-hidden').value = data.value.logo_url || '';
        document.getElementById('logo-preview').src = data.value.logo_url || 'https://placehold.co/150x50?text=Logo';
    }
}

async function loadSocialSettings() {
    const { data } = await getSupabase().from('settings').select('value').eq('key', 'social_links').maybeSingle();
    if (data?.value) {
        document.getElementById('social-fb').value = data.value.facebook || '';
        document.getElementById('social-tw').value = data.value.twitter || '';
        document.getElementById('social-ig').value = data.value.instagram || '';
        document.getElementById('social-ds').value = data.value.discord || '';

        // Update footer links as well
        if (data.value.facebook) document.getElementById('footer-fb').href = data.value.facebook;
        if (data.value.twitter) document.getElementById('footer-tw').href = data.value.twitter;
        if (data.value.instagram) document.getElementById('footer-ig').href = data.value.instagram;
        if (data.value.discord) document.getElementById('footer-ds').href = data.value.discord;
    }
}

async function renderVisitorChart() {
    const { data } = await getSupabase().from('settings').select('value').eq('key', 'site_stats').maybeSingle();
    const canvas = document.getElementById('visitorChart');
    if (!data || !canvas) return;

    if (visitorChartInstance) {
        visitorChartInstance.destroy();
    }

    visitorChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
            datasets: [{
                label: 'Pengunjung Unik',
                data: data.value.weekly_stats || [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#e8491d',
                backgroundColor: 'rgba(232, 73, 29, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Admin: DOMContentLoaded event fired. Starting admin page initialization.");
    const initialized = await initSupabase();
    console.log("Admin: Supabase initialized successfully in admin-logic.js.");
    if (!initialized) return;
    
    // Initialize DOM elements
    form = document.getElementById('add-novel-form');
    formTitle = document.getElementById('form-title');
    submitBtn = document.getElementById('submit-btn');
    cancelBtn = document.getElementById('cancel-btn');
    novelIdField = document.getElementById('adm-id');

    // Image selection preview for novel cover
    document.getElementById('adm-image')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (rev) => {
                document.getElementById('image-preview').src = rev.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    editChapterModal = document.getElementById('edit-chapter-modal');
    editChapterForm = document.getElementById('edit-chapter-form');
    editChapterIndexField = document.getElementById('edit-chapter-index');
    editChapterTitleField = document.getElementById('edit-chapter-title');
    editChapterContentField = document.getElementById('edit-chapter-content');

    // Close modal listeners
    document.getElementById('close-edit-modal')?.addEventListener('click', () => {
        editChapterModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === editChapterModal) editChapterModal.style.display = 'none';
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editChapterModal.style.display !== 'none') {
            editChapterModal.style.display = 'none';
        }
    });

    await checkSession();

    if (document.getElementById('admin-content') && document.getElementById('admin-content').style.display !== 'none') {
        console.log("Admin: Admin content is visible, loading initial data.");
        await loadGlobalData({ limit: 100 });
        renderAdminNovels();
        loadSiteSettings();
        loadSocialSettings();
        console.log("Admin: Initial admin data loaded.");
    } else {
        console.log("Admin: Admin content is hidden, waiting for login.");
    }

    // Listeners untuk form
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorContainer = document.getElementById('login-error-msg');
        const submitBtn = document.getElementById('login-submit-btn');
        
        errorContainer.classList.add('display-none');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

        const { error } = await getSupabase().auth.signInWithPassword({
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value
        });

        if (!error) { 
            checkSession(); 
        } else { 
            errorContainer.innerText = error.message;
            errorContainer.classList.remove('display-none');
            submitBtn.disabled = false;
            submitBtn.innerText = 'Masuk';
        }
    });
    
    // Search listener
    document.getElementById('novel-search')?.addEventListener('input', (e) => { console.log(`Admin: Novel search input changed to '${e.target.value}'.`); renderAdminNovels(e.target.value); });

    // Cancel button listener
    cancelBtn?.addEventListener('click', resetForm);

    // AI Prompt Toggle visibility
    document.getElementById('ai-refine-toggle')?.addEventListener('change', (e) => {
        document.getElementById('custom-prompt-container').style.display = e.target.checked ? 'block' : 'none';
    });

    // Chapter Form Listener (Single Add/Edit)
    document.getElementById('chapter-form')?.addEventListener('submit', handleChapterSubmit);
    document.getElementById('edit-chapter-form')?.addEventListener('submit', handleUpdateChapter);

    // Event listener for showing the add novel form (assuming a button exists for this)
    document.getElementById('show-add-novel-form-btn')?.addEventListener('click', showAddNovelForm);
    form.style.display = 'none'; // Initially hide the form

    form?.addEventListener('submit', handleNovelFormSubmit);

    // Handle Update Akun Admin
    document.getElementById('update-admin-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('upd-email').value;
        const password = document.getElementById('upd-password').value;
        const updates = {};
        if (email) updates.email = email;
        if (password) updates.password = password;
        const { error } = await getSupabase().auth.updateUser(updates);
        if (error) alert("Gagal update: " + error.message);
        else alert("Kredensial admin berhasil diperbarui!");
    });

    // Handle Social Settings Save
    document.getElementById('social-settings-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const socialData = {
            facebook: document.getElementById('social-fb').value,
            twitter: document.getElementById('social-tw').value,
            instagram: document.getElementById('social-ig').value,
            discord: document.getElementById('social-ds').value
        };
        const { error } = await getSupabase().from('settings').upsert({ key: 'social_links', value: socialData }, { onConflict: 'key' });
        if (!error) { alert("Tautan sosial berhasil diperbarui!"); invalidateCache(); }
        else alert("Gagal menyimpan: " + error.message);
    });

    // Handle Branding Save (Logo)
    document.getElementById('site-branding-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('site-logo-input');
        const file = fileInput.files[0];
        let logoUrl = document.getElementById('site-logo-url-hidden').value;

        if (file) {
            const fileName = `logo_${Date.now()}.${file.name.split('.').pop()}`;
            const { data, error: uploadError } = await getSupabase().storage.from('branding').upload(fileName, file);
            if (uploadError) return alert("Gagal upload logo: " + uploadError.message);
            const { data: { publicUrl } } = getSupabase().storage.from('branding').getPublicUrl(fileName);
            logoUrl = publicUrl;
        }

        const { error } = await getSupabase().from('settings').upsert({ key: 'site_config', value: { logo_url: logoUrl } }, { onConflict: 'key' });
        if (!error) { 
            localStorage.setItem('site_logo_url', logoUrl);
            alert("Logo berhasil diperbarui!"); 
            invalidateCache();
        } else alert("Gagal menyimpan config: " + error.message);
    });

    console.log("Admin: DOMContentLoaded initialization complete.");
});

async function handleChapterSubmit(e) {
    e.preventDefault();
    if (!activeNovelIdForChapters) return;
    const newChapter = {
        id: Date.now(),
        title: document.getElementById('ch-title').value,
        content: document.getElementById('ch-content').value
    };
    allChaptersBuffer.push(newChapter);
    const { success } = await updateNovelChapters(activeNovelIdForChapters, allChaptersBuffer);
    if (success) {
        document.getElementById('chapter-form').reset();
        renderChapterList(Math.ceil(allChaptersBuffer.length / chaptersPerPage));
        invalidateCache();
    }
}

async function handleUpdateChapter(e) {
    e.preventDefault();
    const index = parseInt(editChapterIndexField.value);
    allChaptersBuffer[index].title = editChapterTitleField.value;
    allChaptersBuffer[index].content = editChapterContentField.value;
    
    const { success } = await updateNovelChapters(activeNovelIdForChapters, allChaptersBuffer);
    if (success) {
        editChapterModal.style.display = 'none';
        renderChapterList(currentChapterPage);
        invalidateCache();
    }
}

// Placeholder untuk fitur tambahan di HTML
window.addNewBan = () => alert("Fitur Banned User akan segera hadir.");
window.exportAllData = () => {
    const data = { novels: getNovels(), settings: localStorage.getItem('site_logo_url') };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'novelfire_backup.json';
    a.click();
};
window.handleImport = (input) => {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            console.log("Importing data...", data);
            alert("Import berhasil (Simulasi).");
        } catch (err) { alert("File tidak valid."); }
    };
    reader.readAsText(file);
};

window.saveChapterOrder = async () => {
    if (!activeNovelIdForChapters) return;
    
    const saveBtn = document.getElementById('save-order-btn');
    saveBtn.disabled = true;
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    const { success, error } = await updateNovelChapters(activeNovelIdForChapters, allChaptersBuffer);

    if (success) {
        alert("Urutan bab berhasil diperbarui di database!");
        saveBtn.style.display = 'none';
        invalidateCache();
    } else {
        alert("Gagal menyimpan urutan: " + (error?.message || error));
    }
    
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
};

// Ekspos fungsi ke global window agar atribut onclick di HTML tetap bekerja
window.handleForgotPassword = handleForgotPassword;
window.handleLogout = handleLogout;
window.openChapterManager = openChapterManager;
window.closeChapterManager = closeChapterManager;
window.handleBulkChapterUpload = handleBulkChapterUpload;
window.renderChapterList = renderChapterList;
window.editNovel = editNovel;
window.editChapter = editChapter;
window.deleteChapter = deleteChapter;
window.deleteNovel = deleteNovel;
window.showAddNovelForm = showAddNovelForm; // Expose this function
window.resetForm = resetForm;
window.resetChapterForm = resetChapterForm;
window.saveChapterOrder = saveChapterOrder;
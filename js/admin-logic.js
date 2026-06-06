import { initSupabase, getSupabase } from './modules/supabase-client.js';
import { loadGlobalData, fetchNovelDetail, getNovels } from './modules/data-service.js';

// State management
let currentCommentPage = 1;
const commentsPerPage = 10;
let activeNovelIdForChapters = null;
let currentChapterPage = 1;
const chaptersPerPage = 10;
let allChaptersBuffer = [];

// DOM Elements
let form, formTitle, submitBtn, cancelBtn;

// Inisialisasi Google Translate untuk Admin
window.googleTranslateElementInit = function() {
    new google.translate.TranslateElement({
        pageLanguage: 'id',
        includedLanguages: 'en,zh-CN,ja,id',
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
    }, 'google_translate_element');
}

// Fungsi untuk membersihkan cache global (SW & LocalStorage)
function invalidateCache() {
    // Bersihkan SW Cache
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'PURGE_CACHE' });
    }
    // Bersihkan AppCache (localStorage)
    if (window.AppCache && window.AppCache.clearAll) window.AppCache.clearAll();
}

// --- SISTEM OTENTIKASI SUPABASE ---
async function checkSession() {
    const supabase = getSupabase();
    if (!supabase || typeof supabase.auth === 'undefined') {
        console.error("Supabase client belum diinisialisasi.");
        return;
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    const loginSection = document.getElementById('login-section');
    const adminContent = document.getElementById('admin-content');

    const isAdmin = session?.user?.user_metadata?.role === 'admin';

    if (session && !isAdmin) {
        console.warn("Akses ditolak: User bukan admin.");
        window.location.href = "index.html";
        return;
    }

    if (session && isAdmin) {
        loginSection.style.display = 'none';
        adminContent.style.display = 'block';
        if (getNovels().length > 0) renderAdminNovels();
        loadSocialSettings();
        loadSiteSettings();
        renderVisitorChart();
    } else {
        loginSection.style.display = 'block';
        adminContent.style.display = 'none';
    }
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
            <div class="chapter-admin-item">
                <span>${ch.title}</span>
                <div class="admin-actions">
                    <button class="btn-admin" onclick="editChapter(${realIndex})"><i class="fas fa-edit"></i></button>
                    <button class="btn-admin btn-danger" onclick="deleteChapter(${realIndex})"><i class="fas fa-trash"></i></button>
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

function closeChapterManager() {
    document.getElementById('chapter-manager-card').style.display = 'none';
    activeNovelIdForChapters = null;
}

async function handleBulkChapterUpload() {
    const bulkUploadBtn = document.getElementById('bulk-upload-btn');
    const fileInput = document.getElementById('bulk-chapter-file');
    const file = fileInput.files[0];
    if (!file || !activeNovelIdForChapters) return alert("Pilih file.");
    
    bulkUploadBtn.disabled = true;
    const text = await file.text();
    const segments = text.split(/###\s+/).filter(s => s.trim() !== "");
    const useAI = document.getElementById('ai-refine-toggle').checked;
    const newChapters = [];
    const baseId = Date.now();

    for (let i = 0; i < segments.length; i++) {
        const lines = segments[i].split('\n');
        let content = lines.slice(1).join('\n').trim();
        if (useAI) {
            const aiRes = await fetch('/api/refine-content', { method: 'POST', body: JSON.stringify({ content }) });
            if (aiRes.ok) { const data = await aiRes.json(); content = data.refinedContent; }
            if (i < segments.length - 1) await new Promise(r => setTimeout(r, 5000));
        }
        newChapters.push({ id: baseId + i, title: lines[0].trim(), content });
    }

    const novel = getNovels().find(n => n.id === activeNovelIdForChapters);
    const updatedChapters = [...(novel.chapters || []), ...newChapters];
    const { error } = await getSupabase().from('novels').update({ chapters: updatedChapters }).eq('id', activeNovelIdForChapters);
    
    if (!error) { 
        novel.chapters = updatedChapters; 
        renderChapterList(updatedChapters); 
        invalidateCache(); // <--- Panggil di sini
        alert("Selesai! Cache pengunjung akan diperbarui otomatis."); 
    }
    bulkUploadBtn.disabled = false;
}

// ... [Sisa fungsi manajemen seperti editChapter, deleteNovel, renderAdminNovels, dll] ...

function renderAdminNovels(filterTerm = '') {
    const listContainer = document.getElementById('admin-novels-list');
    const filtered = getNovels().filter(n => n.title.toLowerCase().includes(filterTerm.toLowerCase()));
    let html = `<table class="admin-table"><thead><tr><th>Judul</th><th>Aksi</th></tr></thead><tbody>`;
    filtered.forEach(n => {
        html += `<tr><td>${n.title}</td><td><button onclick="editNovel(${n.id})">Edit</button><button onclick="openChapterManager(${n.id})">Bab</button></td></tr>`;
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
    }
}

async function renderVisitorChart() {
    const { data } = await getSupabase().from('settings').select('value').eq('key', 'site_stats').maybeSingle();
    if (!data) return;
    // Logika Chart.js di sini
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    const initialized = await initSupabase();
    if (!initialized) return;

    form = document.getElementById('add-novel-form');
    formTitle = document.getElementById('form-title');
    submitBtn = document.getElementById('submit-btn');
    cancelBtn = document.getElementById('cancel-btn');

    await checkSession();

    if (document.getElementById('admin-content').style.display !== 'none') {
        await loadGlobalData({ limit: 100 });
        renderAdminNovels();
        loadSiteSettings();
        loadSocialSettings();
    }

    // Listeners untuk form
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await getSupabase().auth.signInWithPassword({
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value
        });
        if (!error) checkSession(); else alert(error.message);
    });
    
    // Search listener
    document.getElementById('novel-search')?.addEventListener('input', (e) => renderAdminNovels(e.target.value));
});

// Ekspos fungsi ke global window agar atribut onclick di HTML tetap bekerja
window.handleForgotPassword = handleForgotPassword;
window.handleLogout = handleLogout;
window.openChapterManager = openChapterManager;
window.closeChapterManager = closeChapterManager;
window.handleBulkChapterUpload = handleBulkChapterUpload;
window.renderChapterList = renderChapterList;
window.editNovel = (id) => { /* logika editNovel */ };
window.deleteNovel = (id) => { /* logika deleteNovel */ };
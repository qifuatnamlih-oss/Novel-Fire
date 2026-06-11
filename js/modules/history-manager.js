/**
 * Mengelola riwayat membaca novel (bookmark otomatis).
 * @module HistoryManager
 */

/**
 * Menyimpan bab terakhir yang dibaca ke riwayat.
 * @param {object} novel - Objek novel yang sedang dibaca.
 * @param {number} chIdx - Indeks bab yang terakhir dibaca.
 */
export function saveToHistory(novel, chIdx) {
    let history = getHistory();
    // Hapus jika novel sudah ada di riwayat (untuk memajukannya ke atas)
    history = history.filter(item => item.id !== novel.id);
    
    history.unshift({
        id: novel.id,
        title: novel.title,
        image: novel.image,
        lastChapterTitle: novel.chapters[chIdx].title,
        lastChapterIdx: chIdx,
        timestamp: new Date().getTime()
    });

    // Batasi jumlah riwayat (misal: 20 item terakhir)
    if (history.length > 20) history.pop();

    localStorage.setItem('novel_history', JSON.stringify(history));
}

/**
 * Menghapus novel tertentu dari riwayat.
 * @param {number} novelId 
 */
export function removeFromHistory(novelId) {
    let history = getHistory();
    history = history.filter(item => item.id !== novelId);
    localStorage.setItem('novel_history', JSON.stringify(history));
}

/**
 * Menghapus semua riwayat membaca.
 */
export function clearAllHistory() {
    localStorage.removeItem('novel_history');
}

/**
 * Mengambil riwayat membaca dari localStorage.
 * @returns {Array}
 */
export function getHistory() {
    try {
        return JSON.parse(localStorage.getItem('novel_history') || '[]');
    } catch (e) { return []; }
}
/**
 * Utilitas Caching Sederhana menggunakan LocalStorage
 * @module Cache
 */

export const AppCache = {
    /**
     * Menyimpan data ke cache dengan waktu kedaluwarsa.
     * @param {string} key - Kunci untuk data yang disimpan.
     * @param {any} data - Data yang akan disimpan.
     * @param {number} [ttlMinutes=15] - Waktu hidup data dalam menit.
     */
    set(key, data, ttlMinutes = 15) {
        try {
            const expiry = Date.now() + (ttlMinutes * 60 * 1000);
            localStorage.setItem(`cache_${key}`, JSON.stringify({ data, expiry }));
        } catch (e) { console.warn("AppCache: Gagal menulis ke localStorage (mungkin diblokir browser)", e); }
    },
    /**
     * Mengambil data dari cache. Mengembalikan null jika tidak ada, kadaluarsa, atau ada error.
     * @param {string} key - Kunci data yang akan diambil.
     * @returns {any|null} Data yang disimpan atau null.
     */
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
    /**
     * Menghapus semua item cache dari localStorage.
     */
    clearAll() {
        Object.keys(localStorage)
            .filter(key => key.startsWith('cache_'))
            .forEach(key => localStorage.removeItem(key));
        console.log('AppCache: Local storage cache dibersihkan.');
    }
};
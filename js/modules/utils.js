/**
 * Kumpulan fungsi utilitas umum.
 * @module Utils
 */

/**
 * Membersihkan string HTML untuk mencegah XSS dasar.
 * Menggunakan textContent untuk konversi aman.
 * @param {string} str - String yang akan disanitasi.
 * @returns {string} String yang sudah disanitasi.
 */
export const sanitize = (str) => {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};

/**
 * Menginisialisasi progress bar membaca di bagian atas halaman.
 */
export function setupReadingProgress() {
    const progressBar = document.getElementById('reading-progress');
    if (!progressBar) return;
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        progressBar.style.width = scrolled + "%";
    }, { passive: true }); // Menggunakan passive listener untuk performa scroll yang lebih baik
}

/**
 * Memastikan semua iframe (seperti dari Google Translate) memiliki atribut title
 * agar memenuhi standar aksesibilitas (WCAG).
 */
export function observeIframeAccessibility() {
    const observer = new MutationObserver(() => {
        document.querySelectorAll('iframe:not([title])').forEach(iframe => {
            iframe.setAttribute('title', 'Konten Pihak Ketiga');
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
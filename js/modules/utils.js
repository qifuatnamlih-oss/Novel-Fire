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
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};

/**
 * Menginisialisasi progress bar membaca di bagian atas halaman.
 */
export function setupReadingProgress() {
    const progressBar = document.getElementById('reading-progress');
    const backToTop = document.getElementById('back-to-top');
    if (!progressBar && !backToTop) return;

    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        
        if (progressBar) {
            progressBar.style.width = scrolled + "%";
            progressBar.setAttribute('aria-valuenow', Math.round(scrolled));
        }

        if (backToTop) {
            if (winScroll > 400) backToTop.classList.add('show');
            else backToTop.classList.remove('show');
        }
    }, { passive: true }); // Menggunakan passive listener untuk performa scroll yang lebih baik

    backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
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
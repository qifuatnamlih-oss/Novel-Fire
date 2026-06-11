let supabaseInitPromise = null;

export async function initSupabase() {
    if (supabaseInitPromise) return supabaseInitPromise;

    supabaseInitPromise = (async () => {
        try {
            // Jika window.supabase sudah merupakan instance yang terinisialisasi
            if (window.supabase && typeof window.supabase.from === 'function') {
                return true;
            }

            const response = await fetch('/api/get-config');
            if (!response.ok) throw new Error("Gagal mengambil konfigurasi dari server");
            
            const config = await response.json();
            const { url, key } = config;
            
            if (!url || !key) {
                throw new Error("Konfigurasi URL atau Key tidak ditemukan di response server");
            }

            // Mendeteksi library Supabase (biasanya dari CDN)
            const lib = (typeof supabase !== 'undefined' && supabase.createClient) ? supabase : window.supabase;
            
            if (lib && typeof lib.createClient === 'function') {
                window.supabase = lib.createClient(url, key, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
                return true;
            }

            throw new Error("Library Supabase tidak ditemukan di scope global");
        } catch (error) {
            console.error("Gagal menginisialisasi Supabase:", error.message);
            supabaseInitPromise = null; // Memungkinkan percobaan ulang jika gagal
            return false;
        }
    })();

    return supabaseInitPromise;
}

export function getSupabase() {
    if (!window.supabase) {
        console.warn("getSupabase dipanggil sebelum inisialisasi selesai.");
    }
    return window.supabase;
}
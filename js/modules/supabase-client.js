let supabaseInitPromise = null;

export async function initSupabase() {
    if (supabaseInitPromise) return supabaseInitPromise;

    supabaseInitPromise = (async () => {
        try {
            if (window.supabase && typeof window.supabase.from === 'function' && typeof window.supabase.createClient !== 'function') {
                return true;
            }

            const response = await fetch('/api/get-config');
            if (!response.ok) throw new Error("Gagal mengambil konfigurasi dari server");
            const config = await response.json();
            
            const NEXT_PUBLIC_SUPABASE_URL = config.url;
            const NEXT_PUBLIC_SUPABASE_ANON_KEY = config.key;

            const lib = typeof supabase !== 'undefined' ? supabase : window.supabase;
            if (lib && typeof lib.createClient === 'function') {
                window.supabase = lib.createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
                return true;
            }
        } catch (error) {
            console.error("Gagal menginisialisasi Supabase:", error);
            supabaseInitPromise = null;
        }
        return false;
    })();

    return supabaseInitPromise;
}

export function getSupabase() {
    return window.supabase;
}
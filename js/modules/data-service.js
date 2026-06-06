import { getSupabase } from './supabase-client.js';

if (typeof window.novels === 'undefined') window.novels = [];

export async function loadGlobalData(options = {}) {
    const supabase = getSupabase();
    try {
        const { page = 0, limit = 12, select = 'id, title, category, genre, image, author, description' } = options;
        const from = page * limit;
        const to = from + limit - 1;

        const { data, error } = await supabase
            .from('novels')
            .select(select)
            .range(from, to)
            .order('id', { ascending: false });
        
        if (error) throw error;
        
        if (data) {
            data.forEach(item => {
                const index = window.novels.findIndex(n => n.id === item.id);
                if (index !== -1) window.novels[index] = { ...window.novels[index], ...item };
                else window.novels.push(item);
            });
            window.novels.sort((a, b) => b.id - a.id);
        }
        return true;
    } catch (error) {
        console.error("Kesalahan loadGlobalData:", error.message);
        return false;
    }
}

export async function fetchNovelDetail(id) {
    const local = window.novels.find(n => n.id === id);
    if (local && local.chapters) return local;

    const { data, error } = await getSupabase()
        .from('novels')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return null;

    const index = window.novels.findIndex(n => n.id === id);
    if (index !== -1) window.novels[index] = data;
    else window.novels.push(data);
    return data;
}
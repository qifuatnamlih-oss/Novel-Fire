import { getSupabase } from './supabase-client.js';

let novels = [];

export function getNovels() {
    return novels;
}

export function getNovelById(id) {
    return novels.find(n => n.id === id);
}

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
                const index = novels.findIndex(n => n.id === item.id);
                if (index !== -1) novels[index] = { ...novels[index], ...item };
                else novels.push(item);
            });
            novels.sort((a, b) => b.id - a.id);
        }
        return true;
    } catch (error) {
        console.error("Kesalahan loadGlobalData:", error.message);
        return false;
    }
}

export async function fetchNovelDetail(id) {
    const local = getNovelById(id);
    if (local && local.chapters) return local;

    const { data, error } = await getSupabase()
        .from('novels')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return null;

    const index = novels.findIndex(n => n.id === id);
    if (index !== -1) novels[index] = data;
    else novels.push(data);
    return data;
}
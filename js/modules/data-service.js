import { getSupabase } from './supabase-client.js';

let _novels = []; // Private cache for novels
let _globalSettings = {}; // Private cache for global settings

/**
 * Loads all global data (novels and settings) from Supabase into a local cache.
 * This function should be called on application startup or after any data modification
 * that affects the global state.
 */
export async function loadGlobalData(options = {}) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error("Supabase client not initialized in DataService.");
        return;
    }

    // Fetch novels
    const { data: novelsData, error: novelsError } = await supabase
        .from('novels')
        .select('id, title, author, category, image, chapters, synopsis'); // Select all necessary fields

    if (novelsError) {
        console.error("Error loading novels:", novelsError.message);
    } else {
        _novels = novelsData || [];
        console.log(`DataService: Loaded ${_novels.length} novels.`);
    }

    // Fetch global settings (e.g., social links, site config)
    const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('*');

    if (settingsError) {
        console.error("Error loading settings:", settingsError.message);
    } else {
        _globalSettings = {};
        settingsData.forEach(setting => {
            _globalSettings[setting.key] = setting.value;
        });
        console.log("DataService: Loaded global settings.");
    }
}

/**
 * Returns the currently cached list of novels.
 * @returns {Array} An array of novel objects.
 */
export function getNovels() {
    return _novels;
}

/**
 * Fetches a single novel's details, prioritizing the local cache.
 * @param {number} novelId The ID of the novel to fetch.
 * @returns {Object|null} The novel object or null if not found.
 */
export async function fetchNovelDetail(novelId) {
    // Try to find in cache first
    const cachedNovel = _novels.find(n => n.id === novelId);
    if (cachedNovel) {
        return cachedNovel;
    }

    // If not in cache, fetch from DB
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('novels')
        .select('id, title, author, category, image, chapters, synopsis') // Select all necessary fields
        .eq('id', novelId)
        .single();

    if (error) {
        console.error(`Error fetching novel detail for ID ${novelId}:`, error.message);
        return null;
    }
    return data;
}

/**
 * Updates the chapters for a specific novel in the database and refreshes the local cache.
 * @param {number} novelId The ID of the novel to update.
 * @param {Array} newChapters The new array of chapters.
 * @returns {Object} An object indicating success or error.
 */
export async function updateNovelChapters(novelId, newChapters) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('novels')
        .update({ chapters: newChapters })
        .eq('id', novelId);

    if (error) {
        console.error("Error updating novel chapters:", error.message);
        return { success: false, error: error.message };
    }

    await loadGlobalData(); // Refresh cache after database modification
    return { success: true };
}

/**
 * Deletes a novel from the database and refreshes the local cache.
 * @param {number} novelId The ID of the novel to delete.
 * @returns {Object} An object indicating success or error.
 */
export async function deleteNovel(novelId) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('novels')
        .delete()
        .eq('id', novelId);

    if (error) {
        console.error("Error deleting novel:", error.message);
        return { success: false, error: error.message };
    }

    await loadGlobalData(); // Refresh cache after deletion
    return { success: true };
}

/**
 * Updates the details of an existing novel in the database and refreshes the local cache.
 * @param {number} novelId The ID of the novel to update.
 * @param {Object} novelData The updated novel data (excluding chapters).
 * @returns {Object} An object indicating success or error.
 */
export async function updateNovelDetails(novelId, novelData) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('novels')
        .update(novelData)
        .eq('id', novelId);

    if (error) {
        console.error("Error updating novel details:", error.message);
        return { success: false, error: error.message };
    }

    await loadGlobalData(); // Refresh cache after update
    return { success: true };
}

/**
 * Adds a new novel to the database and refreshes the local cache.
 * @param {Object} novelData The data for the new novel.
 * @returns {Object} An object indicating success or error, and the new novel data if successful.
 */
export async function addNovel(novelData) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('novels')
        .insert([novelData])
        .select(); // Select the inserted data to get the new ID

    if (error) {
        console.error("Error adding novel:", error.message);
        return { success: false, error: error.message };
    }

    await loadGlobalData();
    return { success: true, data: data[0] }; // Return the first (and only) inserted novel
}
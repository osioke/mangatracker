/**
 * MangaTracker — local storage (chrome.storage.local).
 *
 * Performance notes (this is why opening the panel used to feel heavy):
 *  • The library is read from disk once and kept in memory; later reads are
 *    free. Previously every action re-read the whole library — cover images
 *    included — from disk, sometimes twice.
 *  • Bulk operations (pull, import, sync) write once. Previously they saved
 *    entry-by-entry, rewriting the whole library each time (n² work).
 *  • Every change stamps `updatedAt`, and deletions are remembered as
 *    "tombstones", which is what lets two devices merge safely.
 */
const Storage = (() => {
  const KEYS = {
    entries: 'mt_entries', sites: 'mt_sites', settings: 'mt_settings',
    tombstones: 'mt_tombstones', dirty: 'mt_sync_dirty', syncMeta: 'mt_sync_meta',
  };
  const DEFAULT_SETTINGS = { cookThreshold: 10, showUpToDate: true, notifications: false, defaultMode: 'following' };

  let cache = null;        // entries, once loaded
  let tombCache = null;    // { id: deletedAtMs }

  function get(key) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(key, result => {
          // chrome.storage callbacks don't throw on failure — they set lastError.
          if (chrome.runtime.lastError) {
            console.warn('[MangaTracker] storage.get failed:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(result[key] ?? null);
        });
      } catch { resolve(null); }
    });
  }

  // Resolves true only if the write really happened (e.g. false when the
  // storage quota is exceeded) — callers must not report success otherwise.
  function setMany(obj) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime.lastError) {
            console.error('[MangaTracker] storage.set failed:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (e) {
        console.error('[MangaTracker] storage.set threw:', e.message);
        resolve(false);
      }
    });
  }
  const set = (key, value) => setMany({ [key]: value });

  async function getEntries() {
    if (!cache) cache = (await get(KEYS.entries)) || [];
    return cache;
  }

  async function getTombstones() {
    if (!tombCache) tombCache = (await get(KEYS.tombstones)) || {};
    return tombCache;
  }

  async function saveEntry(entry) {
    const entries = await getEntries();
    const next = entries.slice();
    entry.updatedAt = Date.now();
    const idx = next.findIndex(e => e.id === entry.id);
    if (idx >= 0) next[idx] = entry; else next.unshift(entry);
    if (!(await set(KEYS.entries, next))) {
      throw new Error('Could not save — local storage is full or unavailable. Try Settings → Optimise cover images.');
    }
    cache = next;
    return entry;
  }

  async function deleteEntry(id) {
    const entries = await getEntries();
    const tombs = { ...(await getTombstones()), [id]: Date.now() };
    const next = entries.filter(e => e.id !== id);
    if (!(await setMany({ [KEYS.entries]: next, [KEYS.tombstones]: tombs }))) {
      throw new Error('Could not delete — local storage is unavailable.');
    }
    cache = next; tombCache = tombs;
  }

  // Add or update many entries with a single write. Newer edits win.
  async function saveMany(incoming) {
    const entries = await getEntries();
    const byId = new Map(entries.map(e => [e.id, e]));
    let changed = 0;
    incoming.forEach(e => {
      if (!e || !e.id) return;
      const mine = byId.get(e.id);
      if (!mine || (e.updatedAt || e.savedAt || 0) > (mine.updatedAt || mine.savedAt || 0)) { byId.set(e.id, e); changed++; }
    });
    const next = [...byId.values()];
    if (!(await set(KEYS.entries, next))) throw new Error('Could not save — local storage is full or unavailable.');
    cache = next;
    return changed;
  }

  // Replace the library with a merged result from sync.
  async function replaceAll(entries, tombstones) {
    const tombs = tombstones || {};
    if (!(await setMany({ [KEYS.entries]: entries, [KEYS.tombstones]: tombs }))) {
      throw new Error('Could not store synced data — local storage is full or unavailable.');
    }
    cache = entries; tombCache = tombs;
  }

  async function getSites() { return (await get(KEYS.sites)) || []; }

  async function saveSite(site) {
    const sites = await getSites();
    const idx = sites.findIndex(s => s.hostname === site.hostname);
    if (idx >= 0) sites[idx] = site; else sites.unshift(site);
    // Not throwing: the site index is a convenience list; losing an update
    // isn't worth blocking the entry save the user actually cares about.
    await set(KEYS.sites, sites);
  }

  async function getSettings() {
    return { ...DEFAULT_SETTINGS, ...((await get(KEYS.settings)) || {}) };
  }
  async function hasStoredSettings() { return !!(await get(KEYS.settings)); }
  async function saveSettings(settings) { await set(KEYS.settings, settings); }

  async function getSyncMeta() { return (await get(KEYS.syncMeta)) || {}; }
  async function setSyncMeta(patch) { await set(KEYS.syncMeta, { ...(await getSyncMeta()), ...patch }); }
  async function isDirty() { return !!(await get(KEYS.dirty)); }
  async function setDirty(v) { await set(KEYS.dirty, !!v); }

  function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  return {
    getEntries, saveEntry, deleteEntry, saveMany, replaceAll, getTombstones,
    getSites, saveSite, getSettings, hasStoredSettings, saveSettings,
    getSyncMeta, setSyncMeta, isDirty, setDirty, generateId, KEYS,
  };
})();

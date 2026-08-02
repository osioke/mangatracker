const Storage = (() => {
  const KEYS = { entries: 'mt_entries', sites: 'mt_sites', settings: 'mt_settings' };

  function get(key) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(key, result => {
          // chrome.storage callbacks don't throw on failure — they set
          // chrome.runtime.lastError instead. Not checking this means a
          // failed read silently looks identical to "no data yet".
          if (chrome.runtime.lastError) {
            console.warn('[MangaTracker] storage.get failed:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(result[key] ?? null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function set(key, value) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          // Same issue as get() above — this is the important one. If this
          // write fails (most commonly QUOTA_BYTES quota exceeded, which
          // happens once accumulated cover-art images push chrome.storage.local
          // over its cap), the old code resolved(true) regardless, so callers
          // believed the save succeeded when nothing was actually written.
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

  async function getEntries() {
    return (await get(KEYS.entries)) || [];
  }

  async function saveEntry(entry) {
    const entries = await getEntries();
    const idx = entries.findIndex(e => e.id === entry.id);
    if (idx >= 0) entries[idx] = entry;
    else entries.unshift(entry);
    const ok = await set(KEYS.entries, entries);
    if (!ok) {
      throw new Error('Could not save — local storage is full or unavailable. Try removing a cover image, or see Settings for details.');
    }
    return entry;
  }

  async function deleteEntry(id) {
    const entries = await getEntries();
    const ok = await set(KEYS.entries, entries.filter(e => e.id !== id));
    if (!ok) throw new Error('Could not delete — local storage is unavailable.');
  }

  async function getSites() {
    return (await get(KEYS.sites)) || [];
  }

  async function saveSite(site) {
    const sites = await getSites();
    const idx = sites.findIndex(s => s.hostname === site.hostname);
    if (idx >= 0) sites[idx] = site;
    else sites.unshift(site);
    // Not throwing here on failure — the site index is a convenience list for
    // the "by site" library view, losing an update to it isn't worth blocking
    // the entry save the user actually cares about.
    await set(KEYS.sites, sites);
  }

  async function getSettings() {
    return (await get(KEYS.settings)) || {
      cookThreshold: 10,
      showUpToDate: true,
      notifications: false,
      defaultMode: 'following'
    };
  }

  async function saveSettings(settings) {
    await set(KEYS.settings, settings);
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return { getEntries, saveEntry, deleteEntry, getSites, saveSite, getSettings, saveSettings, generateId, KEYS };
})();

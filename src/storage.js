const Storage = (() => {
  const KEYS = { entries: 'mt_entries', sites: 'mt_sites', settings: 'mt_settings' };

  function get(key) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(key, result => resolve(result[key] || null));
      } catch {
        resolve(null);
      }
    });
  }

  function set(key, value) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [key]: value }, () => resolve(true));
      } catch {
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
    await set(KEYS.entries, entries);
    return entry;
  }

  async function deleteEntry(id) {
    const entries = await getEntries();
    await set(KEYS.entries, entries.filter(e => e.id !== id));
  }

  async function getSites() {
    return (await get(KEYS.sites)) || [];
  }

  async function saveSite(site) {
    const sites = await getSites();
    const idx = sites.findIndex(s => s.hostname === site.hostname);
    if (idx >= 0) sites[idx] = site;
    else sites.unshift(site);
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

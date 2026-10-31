/**
 * MangaTracker — cloud sync for the extension.
 *
 * The heavy lifting (splitting the library into Firestore-sized parts,
 * merging, token refresh) lives in shared/mt-cloud.js. This file adds what
 * is specific to the extension:
 *   • remembers whether there are unsynced changes (survives closing the panel)
 *   • debounced automatic sync after every change
 *   • retries with back-off when the network or Firestore fails
 *   • reports status so the UI can show it instead of failing silently
 *
 * Put your own Firebase keys below.
 */
const FirebaseConfig = {
  apiKey:    'AIzaSyB38aVbF-2p7jxiXEiR2eQkv1b2FIbyEj0',
  projectId: 'mangatracker-15917',
};

const Sync = (() => {
  const AUTO_DELAY = 1500;                       // wait for edits to settle
  const RETRY_DELAYS = [30e3, 120e3, 600e3];     // 30 s, 2 min, 10 min

  const chromeGet = keys => new Promise(r => chrome.storage.local.get(keys, r));
  const chromeSet = obj  => new Promise(r => chrome.storage.local.set(obj, r));
  const chromeRemove = keys => new Promise(r => chrome.storage.local.remove(keys, r));

  const isConfigured = () =>
    FirebaseConfig.apiKey !== 'YOUR_API_KEY' && FirebaseConfig.projectId !== 'YOUR_PROJECT_ID';

  // Login tokens are kept so reopening the panel doesn't create a new
  // anonymous Firebase user every time (it used to, and waited on the network).
  const client = MTCloud.createClient({
    apiKey: FirebaseConfig.apiKey,
    projectId: FirebaseConfig.projectId,
    tokenStore: {
      load: async () => (await chromeGet(['mt_sync_token'])).mt_sync_token || null,
      save: t => chromeSet({ mt_sync_token: t }),
    },
  });

  let _email = null, _docKey = null;
  let _timer = null, _retryTimer = null, _retryStep = 0;
  let _running = false, _changeSeq = 0;
  let _status = { state: 'idle', message: '', lastSyncAt: null, lastError: null };
  const _listeners = [];

  function setStatus(patch) {
    _status = { ..._status, ...patch };
    _listeners.forEach(fn => { try { fn(_status); } catch (_) {} });
  }
  const onStatus = fn => { _listeners.push(fn); fn(_status); };

  // No password: the library key is a hash of the email (see README → Security).
  async function makeDocKey(email) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase().trim()));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function login(email) {
    if (!isConfigured()) throw new Error('Firebase not configured. See README.');
    if (!email || !isValidEmail(email)) throw new Error('Enter a valid email address.');
    await client.ensureToken(false);             // proves the Firebase project is reachable
    _email = email.toLowerCase().trim();
    _docKey = await makeDocKey(_email);
    await chromeSet({ mt_sync_dockey: _docKey, mt_sync_email: _email });
    // First sync merges whatever is already in the cloud with this device.
    await Storage.setDirty(true);
    return { email: _email, docKey: _docKey };
  }

  // Local only — no network. (The old version signed in to Firebase here and
  // the panel waited for it before showing anything.)
  async function restoreSession() {
    if (!isConfigured()) return false;
    const d = await chromeGet(['mt_sync_dockey', 'mt_sync_email']);
    if (!d.mt_sync_dockey) return false;
    _docKey = d.mt_sync_dockey; _email = d.mt_sync_email;
    const meta = await Storage.getSyncMeta();
    setStatus({ lastSyncAt: meta.lastSyncAt || null, lastError: meta.lastError || null });
    return { email: _email, docKey: _docKey };
  }

  async function logout() {
    clearTimeout(_timer); clearTimeout(_retryTimer);
    _email = null; _docKey = null; _retryStep = 0;
    await chromeRemove(['mt_sync_dockey', 'mt_sync_email', 'mt_sync_token', Storage.KEYS.syncMeta, Storage.KEYS.dirty]);
    setStatus({ state: 'idle', message: '', lastSyncAt: null, lastError: null });
  }

  /**
   * Two-way sync right now. Safe to call at any time; overlapping calls are
   * queued rather than run in parallel.
   */
  async function syncNow({ force = false } = {}) {
    if (!_docKey) throw new Error('Not signed in');
    if (_running) { _changeSeq++; return null; }   // the running sync will loop once more
    _running = true;
    setStatus({ state: 'busy', message: 'Syncing…' });
    try {
      const seqAtStart = _changeSeq;
      // Nothing to send and the cloud hasn't changed? One tiny request, no
      // heavy work — this is what runs every time the panel opens.
      if (!force && !(await Storage.isDirty())) {
        const known = (await Storage.getSyncMeta()).lastRemoteRev;
        const rev = await client.peek(_docKey);
        if (rev && rev === known) {
          const lastSyncAt = Date.now();
          await Storage.setSyncMeta({ lastSyncAt, lastError: null });
          setStatus({ state: 'ok', message: 'Up to date', lastSyncAt, lastError: null, result: { entries: null, uploaded: 0, parts: 0, remoteRead: false, rev } });
          return _status.result;
        }
      }
      const entries = await Storage.getEntries();
      const tombstones = await Storage.getTombstones();
      const hadSettings = await Storage.hasStoredSettings();
      const settings = hadSettings ? await Storage.getSettings() : null;
      const meta = await Storage.getSyncMeta();

      const r = await client.sync(_docKey, { entries, tombstones, settings }, { lastRemoteRev: meta.lastRemoteRev, force });

      if (r.remoteRead) {
        // Re-merge against what is on disk *now*, so an edit made while the
        // network call was in flight is not overwritten.
        const merged = MTCloud.mergeLibraries(
          { entries: await Storage.getEntries(), tombstones: await Storage.getTombstones() },
          { entries: r.entries, tombstones: r.tombstones });
        await Storage.replaceAll(merged.entries, merged.tombstones);
      }
      if (!hadSettings && r.remoteSettings) await Storage.saveSettings({ ...(await Storage.getSettings()), ...r.remoteSettings });

      const lastSyncAt = Date.now();
      await Storage.setSyncMeta({ lastRemoteRev: r.rev, lastSyncAt, lastError: null });
      if (_changeSeq === seqAtStart) await Storage.setDirty(false);
      _retryStep = 0; clearTimeout(_retryTimer);
      setStatus({ state: 'ok', message: 'Synced', lastSyncAt, lastError: null, result: r });
      return r;
    } catch (e) {
      await Storage.setSyncMeta({ lastError: e.message });
      setStatus({ state: 'err', message: e.message, lastError: e.message });
      scheduleRetry();
      throw e;
    } finally {
      _running = false;
      if (_changeSeq > 0 && await Storage.isDirty() && _status.state === 'ok') scheduleAutoPush();
    }
  }

  function scheduleRetry() {
    clearTimeout(_retryTimer);
    if (_retryStep >= RETRY_DELAYS.length) return;      // give up until the next change or panel open
    _retryTimer = setTimeout(() => { syncNow().catch(() => {}); }, RETRY_DELAYS[_retryStep++]);
  }

  // Call after any change. The "unsynced changes" flag is stored first, so
  // even if the panel closes before the timer fires, the next open finishes the job.
  function scheduleAutoPush() {
    if (!_docKey) return;
    _changeSeq++;
    Storage.setDirty(true);
    clearTimeout(_timer);
    _timer = setTimeout(() => { syncNow().catch(e => console.warn('[MangaTracker] auto-sync failed:', e.message)); }, AUTO_DELAY);
  }

  function estimate(entries) { return MTCloud.estimate(entries); }

  return {
    login, logout, restoreSession, syncNow, scheduleAutoPush, onStatus, estimate,
    getStatus: () => _status, getEmail: () => _email, configured: isConfigured,
  };
})();

/**
 * MangaTracker — Firebase Sync
 *
 * Uses the Firestore REST API directly (no npm, no bundler, works in extensions).
 */

const FirebaseConfig = {
  apiKey:    'AIzaSyB38aVbF-2p7jxiXEiR2eQkv1b2FIbyEj0',
  projectId: 'mangatracker-15917',
};

const Sync = (() => {
  const BASE      = `https://firestore.googleapis.com/v1/projects/${FirebaseConfig.projectId}/databases/(default)/documents`;
  const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1`;

  let _idToken  = null;
  let _uid      = null;
  let _username = null;

  // ── Auto-push debounce ────────────────────────────────────────────────────
  // Waits 1.5 seconds after the last change before pushing, so rapid edits
  // don't hammer Firestore with a push on every single keystroke.
  let _autoPushTimer = null;
  function scheduleAutoPush() {
    clearTimeout(_autoPushTimer);
    _autoPushTimer = setTimeout(async () => {
      try {
        const stored = await new Promise(resolve =>
          chrome.storage.local.get(['mt_entries', 'mt_settings', 'mt_sync_dockey'], resolve)
        );
        if (!stored.mt_sync_dockey) return; // not signed in, skip silently
        const entries  = stored.mt_entries  || [];
        const settings = stored.mt_settings || {};
        await push(entries, settings);
        console.log('[MangaTracker] Auto-pushed to cloud ✓');
      } catch (e) {
        console.warn('[MangaTracker] Auto-push failed:', e.message);
        // Fail silently — user can always push manually from Settings
      }
    }, 1500);
  }

  function isConfigured() {
    return FirebaseConfig.apiKey !== 'YOUR_API_KEY' &&
           FirebaseConfig.projectId !== 'YOUR_PROJECT_ID';
  }

  // ── Anonymous sign-in via Firebase Auth REST ──────────────────────────────
  async function signInAnonymously() {
    const r = await fetch(`${AUTH_BASE}/accounts:signUp?key=${FirebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    const data = await r.json();
    if (!r.ok) {
      const code = data.error?.message || 'AUTH_FAILED';
      // Translate the most common Firebase error codes into plain English
      if (code === 'CONFIGURATION_NOT_FOUND')
        throw new Error('Firebase: Anonymous sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method → enable Anonymous.');
      if (code === 'API_KEY_INVALID' || code.includes('API_KEY'))
        throw new Error('Firebase: API key is invalid. Check the apiKey value in src/firebase.js.');
      if (code === 'OPERATION_NOT_ALLOWED')
        throw new Error('Firebase: Anonymous auth is disabled. Enable it in Firebase Console → Authentication → Sign-in method.');
      throw new Error(`Firebase auth error: ${code}`);
    }
    _idToken = data.idToken;
    _uid     = data.localId;
    return data;
  }

  // ── Hash a passphrase into a consistent document key ─────────────────────
  async function makeDocKey(username, phrasekey) {
    const raw = `${username.toLowerCase().trim()}:${phrasekey.trim()}`;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    return hex.slice(0, 32);
  }

  // ── Firestore REST helpers ────────────────────────────────────────────────
  function toFirestoreDoc(obj) {
    return { fields: { data: { stringValue: JSON.stringify(obj) } } };
  }

  function fromFirestoreDoc(doc) {
    try { return JSON.parse(doc.fields?.data?.stringValue || 'null'); }
    catch { return null; }
  }

  async function fsGet(docPath) {
    const r = await fetch(`${BASE}/${docPath}`, {
      headers: { 'Authorization': `Bearer ${_idToken}` }
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Firestore GET failed: ${r.status}`);
    return fromFirestoreDoc(await r.json());
  }

  async function fsSet(docPath, obj) {
    const r = await fetch(`${BASE}/${docPath}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${_idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(toFirestoreDoc(obj))
    });
    if (!r.ok) throw new Error(`Firestore SET failed: ${r.status}`);
    return r.json();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async function login(username, phrasekey) {
    if (!isConfigured()) throw new Error('Firebase not configured. See src/firebase.js.');
    await signInAnonymously();
    const docKey  = await makeDocKey(username, phrasekey);
    _username     = username.toLowerCase().trim();
    await new Promise(resolve => chrome.storage.local.set({
      mt_sync_dockey:   docKey,
      mt_sync_username: _username,
    }, resolve));
    return { username: _username, docKey };
  }

  async function restoreSession() {
    if (!isConfigured()) return false;
    const data = await new Promise(resolve =>
      chrome.storage.local.get(['mt_sync_dockey','mt_sync_username'], resolve)
    );
    if (!data.mt_sync_dockey) return false;
    try {
      await signInAnonymously();
      _username = data.mt_sync_username;
      return { username: _username, docKey: data.mt_sync_dockey };
    } catch {
      return false;
    }
  }

  async function logout() {
    _idToken = null; _uid = null; _username = null;
    clearTimeout(_autoPushTimer);
    await new Promise(resolve =>
      chrome.storage.local.remove(['mt_sync_dockey','mt_sync_username'], resolve)
    );
  }

  async function push(entries, settings) {
    const data = await new Promise(resolve =>
      chrome.storage.local.get(['mt_sync_dockey'], resolve)
    );
    if (!data.mt_sync_dockey) throw new Error('Not signed in');
    // Re-authenticate if token has expired (anonymous tokens last ~1 hour)
    if (!_idToken) await signInAnonymously();
    await fsSet(`mt_users/${data.mt_sync_dockey}`, {
      entries,
      settings,
      pushedAt: Date.now(),
      username: _username
    });
  }

  async function pull() {
    const data = await new Promise(resolve =>
      chrome.storage.local.get(['mt_sync_dockey'], resolve)
    );
    if (!data.mt_sync_dockey) throw new Error('Not signed in');
    if (!_idToken) await signInAnonymously();
    const remote = await fsGet(`mt_users/${data.mt_sync_dockey}`);
    return remote; // { entries, settings, pushedAt }
  }

  function getUsername()    { return _username; }
  function configured()     { return isConfigured(); }

  return { login, logout, restoreSession, push, pull, getUsername, configured, scheduleAutoPush };
})();

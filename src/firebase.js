/**
 * MangaTracker — Firebase Sync
 *
 * Uses the Firestore REST API directly (no npm, no bundler, works in extensions).
 *
 * ── SETUP ────────────────────────────────────────────────────────────────────
 * 1. Go to https://console.firebase.google.com
 * 2. Create a project (free Spark plan is fine)
 * 3. Add a Web app to the project
 * 4. Go to Firestore Database → Create database (start in test mode for now)
 * 5. Copy your config values below
 * 6. In Firebase Console → Authentication → Sign-in method → enable "Anonymous"
 *    (we use anonymous auth + a user-chosen passphrase as the document key,
 *     so no email/password account is needed)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FirebaseConfig = {
  // ── REPLACE THESE WITH YOUR FIREBASE PROJECT VALUES ──────────────────────
  apiKey:            'YOUR_API_KEY',
  projectId:         'YOUR_PROJECT_ID',
  // ─────────────────────────────────────────────────────────────────────────
};

const Sync = (() => {
  const BASE = `https://firestore.googleapis.com/v1/projects/${FirebaseConfig.projectId}/databases/(default)/documents`;
  const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1`;

  let _idToken = null;
  let _uid = null;
  let _username = null;

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
    if (!r.ok) throw new Error(data.error?.message || 'Auth failed');
    _idToken = data.idToken;
    _uid = data.localId;
    return data;
  }

  // ── Refresh token ─────────────────────────────────────────────────────────
  async function refreshToken(refreshToken) {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FirebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Token refresh failed');
    _idToken = data.id_token;
    return data;
  }

  // ── Hash a passphrase into a consistent document key ─────────────────────
  // We don't store the passphrase. The key is: sha256(username + ':' + phrase)
  // truncated to 32 hex chars. Simple, no server-side auth needed.
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
    if (!isConfigured()) throw new Error('Firebase not configured. See src/firebase.js for setup instructions.');
    await signInAnonymously();
    const docKey = await makeDocKey(username, phrasekey);
    _username = username.toLowerCase().trim();
    // Save credentials locally for next session
    await new Promise(resolve => chrome.storage.local.set({
      mt_sync_dockey: docKey,
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
      await signInAnonymously(); // anonymous auth is stateless, re-sign each session
      _username = data.mt_sync_username;
      return { username: _username, docKey: data.mt_sync_dockey };
    } catch {
      return false;
    }
  }

  async function logout() {
    _idToken = null; _uid = null; _username = null;
    await new Promise(resolve =>
      chrome.storage.local.remove(['mt_sync_dockey','mt_sync_username'], resolve)
    );
  }

  async function push(entries, settings) {
    const data = await new Promise(resolve =>
      chrome.storage.local.get(['mt_sync_dockey'], resolve)
    );
    if (!data.mt_sync_dockey) throw new Error('Not signed in');
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
    const remote = await fsGet(`mt_users/${data.mt_sync_dockey}`);
    return remote; // { entries, settings, pushedAt }
  }

  function getUsername() { return _username; }
  function configured() { return isConfigured(); }

  return { login, logout, restoreSession, push, pull, getUsername, configured };
})();

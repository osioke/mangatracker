// NOTE: an identical copy of this file lives in docs/shared/. If you change it here, make the same change there.
/**
 * MangaTracker — cloud sync (Firestore REST), shared by extension and web app.
 *
 * WHY THIS EXISTS (the "Firestore SET failed: 400" bug)
 * -----------------------------------------------------
 * The old code saved the *entire* library, including every base64 cover
 * image, as one text value in one Firestore document. Firestore rejects any
 * document / text value over about 1 MiB with HTTP 400, so once the library
 * (mostly cover art) outgrew that, every push failed — manual or automatic.
 * The old code also threw away Firestore's explanation, so the message was
 * just "400".
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 *   mt_users/<key>        small "index" document: settings, deleted-entry
 *                         markers, how many parts there are, a fingerprint
 *                         of each part
 *   mt_users/<key>-c0..N  the entries, split into parts well under the limit
 *
 *  • Entries are assigned to parts by a stable hash of their id, so editing
 *    one entry changes one part — only that part is uploaded.
 *  • Every sync first merges what is in the cloud with what is on this
 *    device (newest edit per entry wins; deletions are remembered), so a
 *    phone edit is no longer wiped by a stale push from the desktop.
 *  • Login tokens are refreshed instead of expiring after an hour.
 *  • Errors carry Firestore's real explanation.
 *
 * The cloud layout only uses the GET/PATCH calls the app already used, so no
 * Firestore rule changes are needed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTCloud = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  const CHUNK_TARGET = 450 * 1024;   // aim for parts around this size
  const CHUNK_HARD   = 850 * 1024;   // never exceed (Firestore's limit is ~1 MiB)
  const ENTRY_MAX    = 300 * 1024;   // one entry bigger than this loses its cover for sync
  const TOMBSTONE_TTL = 180 * 24 * 3600 * 1000;
  const CONCURRENCY  = 4;

  const enc = new TextEncoder();
  const byteLen = s => enc.encode(s).length;

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  // ── Merging ──────────────────────────────────────────────────────────────
  const updatedOf = e => (e && (e.updatedAt || e.savedAt || e.lastRead)) || 0;

  /**
   * Merge two libraries. `a` is "ours" (wins ties), `b` is "theirs".
   * Each is { entries: [], tombstones: { id: deletedAtMs } }.
   */
  function mergeLibraries(a, b, now = Date.now()) {
    const tombstones = { ...(a.tombstones || {}) };
    Object.entries(b.tombstones || {}).forEach(([id, ts]) => {
      tombstones[id] = Math.max(tombstones[id] || 0, ts);
    });

    const byId = new Map();
    (a.entries || []).forEach(e => { if (e && e.id) byId.set(e.id, e); });
    (b.entries || []).forEach(e => {
      if (!e || !e.id) return;
      const mine = byId.get(e.id);
      if (!mine || updatedOf(e) > updatedOf(mine)) byId.set(e.id, e);
    });

    const entries = [...byId.values()].filter(e => !(tombstones[e.id] && tombstones[e.id] >= updatedOf(e)));
    Object.keys(tombstones).forEach(id => { if (now - tombstones[id] > TOMBSTONE_TTL) delete tombstones[id]; });
    return { entries, tombstones };
  }

  // An entry whose cover art is enormous is synced without it rather than
  // blocking the whole library. The local copy keeps its image.
  function prepareForSync(entry) {
    const s = JSON.stringify(entry);
    if (byteLen(s) <= ENTRY_MAX || !entry.imageData) return { json: s, stripped: false };
    const slim = { ...entry, imageData: '' };
    return { json: JSON.stringify(slim), stripped: true };
  }

  /** Split entries into parts under the size limit. Returns [{ json, count }] */
  function planChunks(entries) {
    const items = entries.map(e => { const p = prepareForSync(e); return { id: e.id, json: p.json, n: byteLen(p.json) + 1, stripped: p.stripped }; });
    const total = items.reduce((s, i) => s + i.n, 0);
    let K = Math.max(1, Math.ceil(total / CHUNK_TARGET));
    for (;;) {
      const buckets = Array.from({ length: K }, () => ({ items: [], size: 200 }));
      items.forEach(it => { const b = buckets[fnv1a(it.id) % K]; b.items.push(it); b.size += it.n; });
      if (buckets.every(b => b.size <= CHUNK_HARD)) {
        return {
          strippedCount: items.filter(i => i.stripped).length,
          chunks: buckets.map((b, i) => {
            b.items.sort((x, y) => (x.id < y.id ? -1 : 1));
            return { index: i, count: b.items.length, size: b.size,
              json: `{"v":2,"i":${i},"entries":[${b.items.map(x => x.json).join(',')}]}` };
          }),
        };
      }
      if (K >= 64) throw new Error('Some entries are too large to sync even when split. Use Settings → Optimise cover images.');
      K++;
    }
  }

  /** For diagnostics: how big would the library be in the cloud? */
  function estimate(entries) {
    const plan = planChunks(entries);
    return { parts: plan.chunks.length, bytes: plan.chunks.reduce((s, c) => s + c.size, 0), stripped: plan.strippedCount };
  }

  // ── Firestore client ─────────────────────────────────────────────────────
  function createClient({ apiKey, projectId, tokenStore, fetchImpl, now }) {
    const doFetch = fetchImpl || ((...a) => fetch(...a));
    const clock = now || (() => Date.now());
    const FS = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const AUTH = 'https://identitytoolkit.googleapis.com/v1';
    const TOKEN = 'https://securetoken.googleapis.com/v1/token';
    let tok = null; // { idToken, refreshToken, expiresAt }

    function friendlyAuth(code) {
      if (code === 'CONFIGURATION_NOT_FOUND' || code === 'OPERATION_NOT_ALLOWED')
        return 'Firebase: Anonymous sign-in is not enabled. Firebase Console → Authentication → Sign-in method → enable Anonymous.';
      if (/API_KEY/.test(code)) return 'Firebase: the API key is invalid. Check apiKey in the config.';
      return `Firebase auth error: ${code}`;
    }

    async function signUp() {
      const r = await doFetch(`${AUTH}/accounts:signUp?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(friendlyAuth(d.error?.message || 'AUTH_FAILED'));
      tok = { idToken: d.idToken, refreshToken: d.refreshToken, expiresAt: clock() + (parseInt(d.expiresIn, 10) || 3600) * 1000 };
      if (tokenStore) await tokenStore.save(tok);
    }

    async function refresh() {
      const r = await doFetch(`${TOKEN}?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tok.refreshToken)}`,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('refresh failed');
      tok = { idToken: d.id_token, refreshToken: d.refresh_token || tok.refreshToken, expiresAt: clock() + (parseInt(d.expires_in, 10) || 3600) * 1000 };
      if (tokenStore) await tokenStore.save(tok);
    }

    async function ensureToken(force) {
      if (!tok && tokenStore) tok = await tokenStore.load();
      if (!force && tok && tok.expiresAt - 60000 > clock()) return;
      if (tok && tok.refreshToken) { try { await refresh(); return; } catch { /* fall through to a fresh sign-in */ } }
      await signUp();
    }

    async function httpError(method, r) {
      let msg = '', status = '';
      try { const j = await r.json(); msg = j.error?.message || ''; status = j.error?.status || ''; } catch { /* no body */ }
      let hint = '';
      if (/too (big|large)|longer than|exceed|1048/i.test(msg)) hint = ' — the data is too large for one Firestore document.';
      else if (r.status === 403 || /PERMISSION_DENIED/.test(status)) hint = ' — Firestore rules are blocking this; check the rules in the README.';
      const err = new Error(`Firestore ${method} failed (${r.status}${status ? ' ' + status : ''})${msg ? ': ' + msg : ''}${hint}`);
      err.httpStatus = r.status;
      return err;
    }

    async function api(method, docPath, body, canRetry = true) {
      await ensureToken(false);
      const r = await doFetch(`${FS}/${docPath}`, {
        method,
        headers: { Authorization: `Bearer ${tok.idToken}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if ((r.status === 401 || r.status === 403) && canRetry) { await ensureToken(true); return api(method, docPath, body, false); }
      if (r.status === 404 && method === 'GET') return null;
      if (!r.ok) throw await httpError(method, r);
      return r.json();
    }

    const putDoc = (docPath, json) => api('PATCH', docPath, { fields: { data: { stringValue: json } } });
    async function getDoc(docPath) {
      const d = await api('GET', docPath);
      if (!d) return null;
      try { return JSON.parse(d.fields?.data?.stringValue || 'null'); } catch { return null; }
    }

    async function readChunks(docKey, meta) {
      const idx = Array.from({ length: meta.buckets }, (_, i) => i);
      const parts = await mapLimit(idx, CONCURRENCY, async i => {
        const c = await getDoc(`mt_users/${docKey}-c${i}`);
        if (!c || !Array.isArray(c.entries)) throw new Error(`Cloud data is incomplete (part ${i + 1} of ${meta.buckets} missing). Try again in a moment.`);
        return c.entries;
      });
      return parts.flat();
    }

    // Normalise either the old single-document format or the new index format.
    function normaliseMeta(m) {
      if (!m) return null;
      if (Array.isArray(m.entries)) return { legacy: true, rev: null, pushedAt: m.pushedAt || 0, settings: m.settings || null, tombstones: m.tombstones || {}, entries: m.entries };
      return { legacy: false, rev: m.rev || null, pushedAt: m.pushedAt || 0, settings: m.settings || null, tombstones: m.tombstones || {}, buckets: m.buckets || 0, hashes: m.hashes || {}, count: m.count || 0 };
    }

    /** Read the whole cloud library. Returns null if nothing is there yet. */
    async function pull(docKey) {
      const meta = normaliseMeta(await getDoc(`mt_users/${docKey}`));
      if (!meta) return null;
      const entries = meta.legacy ? meta.entries : await readChunks(docKey, meta);
      return { entries, tombstones: meta.tombstones, settings: meta.settings, pushedAt: meta.pushedAt, rev: meta.rev };
    }

    /**
     * Two-way sync: merge cloud into local, upload what changed, return the
     * merged result for the caller to store.
     *   local = { entries, tombstones, settings|null }
     *   opts  = { lastRemoteRev, force }   (lastRemoteRev: the `rev` returned by the previous sync;
     *                                     force: re-read the cloud copy and re-upload every part — a repair)
     */
    async function sync(docKey, local, opts = {}) {
      const meta = normaliseMeta(await getDoc(`mt_users/${docKey}`));
      let remote = { entries: [], tombstones: {} };
      let remoteRead = false;
      if (meta) {
        if (meta.legacy) { remote = { entries: meta.entries, tombstones: meta.tombstones }; remoteRead = true; }
        else if (opts.force || !meta.rev || meta.rev !== opts.lastRemoteRev) { remote = { entries: await readChunks(docKey, meta), tombstones: meta.tombstones }; remoteRead = true; }
        else remote = { entries: [], tombstones: meta.tombstones };
      }

      const merged = mergeLibraries({ entries: local.entries || [], tombstones: local.tombstones || {} }, remote);
      const plan = planChunks(merged.entries);
      const hashes = await Promise.all(plan.chunks.map(c => sha256hex(c.json)));

      const sameLayout = !opts.force && meta && !meta.legacy && meta.buckets === plan.chunks.length;
      const toUpload = plan.chunks.filter((c, i) => !sameLayout || meta.hashes[i] !== hashes[i]);

      const settings = local.settings || (meta && meta.settings) || {};
      const tombChanged = JSON.stringify(merged.tombstones) !== JSON.stringify(meta ? meta.tombstones : {});
      const settingsChanged = !meta || JSON.stringify(settings) !== JSON.stringify(meta.settings || {});

      let pushedAt = meta ? meta.pushedAt : 0;
      let rev = meta ? meta.rev : null;
      if (toUpload.length || tombChanged || settingsChanged || (meta && meta.legacy)) {
        await mapLimit(toUpload, CONCURRENCY, c => putDoc(`mt_users/${docKey}-c${c.index}`, c.json));
        pushedAt = clock();
        // A random revision id (not a timestamp) is how other devices notice
        // "the cloud changed since I last looked" — immune to clock quirks.
        rev = Math.random().toString(36).slice(2, 10) + pushedAt.toString(36);
        const hashMap = {}; hashes.forEach((h, i) => { hashMap[i] = h; });
        // Index document is written last, so a reader never sees an index
        // that points at parts which have not been written yet.
        await putDoc(`mt_users/${docKey}`, JSON.stringify({
          v: 2, rev, pushedAt, settings, tombstones: merged.tombstones,
          buckets: plan.chunks.length, hashes: hashMap, count: merged.entries.length,
        }));
      }
      return {
        entries: merged.entries, tombstones: merged.tombstones,
        remoteSettings: meta ? meta.settings : null,
        pushedAt, rev, uploaded: toUpload.length, parts: plan.chunks.length,
        strippedCovers: plan.strippedCount, remoteRead,
      };
    }

    /** One small request: the revision id of the cloud copy (null if none). Lets callers skip a full sync when nothing changed. */
    async function peek(docKey) {
      const meta = normaliseMeta(await getDoc(`mt_users/${docKey}`));
      return meta ? (meta.rev || 'legacy') : null;
    }

    return { sync, pull, peek, ensureToken, _debug: { getDoc, putDoc } };
  }

  return {
    createClient, mergeLibraries, planChunks, estimate, updatedOf, byteLen,
    LIMITS: { CHUNK_TARGET, CHUNK_HARD, ENTRY_MAX },
  };
});

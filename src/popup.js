(() => {
  // Shared with the web app (src/shared/*.js — identical copies live in docs/shared/)
  const Schedule = MTSchedule;
  const { DAYS, DAYS_FULL } = Schedule;
  const DEFAULT_GENRES = MTModel.DEFAULT_GENRES;
  const DEFAULT_VIBES  = MTModel.DEFAULT_VIBES;

  const PAGE_SIZE = 50;           // rows drawn at a time in long lists
  const COVER_MAX_W = 240;        // cover art is stored at most this wide…
  const COVER_QUALITY = 0.78;     // …as a JPEG at this quality (~10–20 KB each)

  let state = {
    nav: 'today',
    stab: { today: 'today', library: 'all' },
    entries: [],
    sites: [],
    settings: {},
    customGenres: [],
    customVibes: [],
    pageInfo: null,
    editId: null,
    selectedDay: new Date().getDay(),
    selectedDate: new Date(),
    libSearch: '',
    libTypeFilter: '',
    libStatusFilter: '',
    libShown: PAGE_SIZE,
    upShown: 30,
    uploadedImageData: null, // base64 for manually uploaded image
    syncUser: null,
  };

  // ── Utils ──────────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function showToast(msg, duration = 2000) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusDot(entry) {
    if (entry.status === 'dropped')    return '<span class="sdot dot-drop"></span>';
    if (entry.mode   === 'paused')     return '<span class="sdot dot-pause"></span>';
    if (entry.mode   === 'cooking')    return '<span class="sdot dot-cook"></span>';
    if (entry.status === 'completed')  return '<span class="sdot dot-done"></span>';
    if (entry.status === 'season_end') return '<span class="sdot dot-season"></span>';
    return '<span class="sdot dot-on"></span>';
  }

  function artHtml(entry, w = 32) {
    const h = Math.round(w * 1.37);
    const style = `width:${w}px;height:${h}px`;
    const imgSrc = entry.imageData || entry.image || '';
    if (imgSrc) {
      return `<div class="art" style="${style}">
        <img src="${escHtml(imgSrc)}" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML='📖'">
      </div>`;
    }
    return `<div class="art" style="${style}">${MTModel.typeIcon(entry.type)}</div>`;
  }

  function chLabel(entry) { return MTModel.chLabel(entry); }

  // "paused", "paused (completed)", "cooking", or the series status.
  function statusText(entry) {
    const st = MTModel.statusLabel(entry.status || 'ongoing').toLowerCase();
    if (entry.mode === 'paused') return (entry.status && entry.status !== 'ongoing') ? `paused (${st})` : 'paused';
    if (entry.mode === 'cooking') return 'cooking';
    return st;
  }

  function daysAgoLabel(ts) {
    if (!ts) return '';
    const d = Math.floor((Date.now() - ts) / 86400000);
    return d < 1 ? 'today' : d === 1 ? '1d' : d < 60 ? `${d}d` : `${Math.round(d / 30)}mo`;
  }

  function updateCounts() {
    const n = state.entries.length;
    const el = $('hdr-count');
    if (el) el.textContent = `${n} ${n === 1 ? 'title' : 'titles'}`;
  }

  function ordinal(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function releaseSummary(entry) {
    if (Schedule.isIrregular(entry)) return entry.releaseType === 'monthly' ? 'Monthly · irregular' : 'Irregular';
    if (entry.releaseType === 'monthly') {
      return entry.releaseDayOfMonth ? `Monthly · ${ordinal(entry.releaseDayOfMonth)}` : 'schedule unknown';
    }
    if (!entry.releaseDays || !entry.releaseDays.length) return 'schedule unknown';
    const days = entry.releaseDays.map(d => DAYS[d]).join(', ');
    const freq  = (entry.releaseFreq ?? 1) > 1 ? `${entry.releaseFreq}×/wk · ` : '';
    return `${freq}${days}`;
  }

  function nextReleaseLabel(entry) {
    if (Schedule.isIrregular(entry)) return 'irregular';
    if (entry.releaseType === 'monthly') {
      if (!entry.releaseDayOfMonth) return 'unknown';
      const now = new Date();
      // Walk forward day-by-day (max 31) until isReleaseOnDate matches —
      // simplest way to respect month-length clamping without duplicating it.
      for (let i = 0; i <= 31; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        if (Schedule.isReleaseOnDate(entry, d)) {
          if (i === 0) return 'today';
          if (i === 1) return 'tomorrow';
          return `${DAYS[d.getDay()]} ${d.getDate()}`;
        }
      }
      return 'unknown';
    }
    if (Schedule.isIrregular(entry)) return 'irregular';
    if (!entry.releaseDays || !entry.releaseDays.length) return 'unknown';
    const today = new Date().getDay();
    const sorted = [...entry.releaseDays].sort((a, b) => {
      const da = (a - today + 7) % 7 || 7;
      const db = (b - today + 7) % 7 || 7;
      return da - db;
    });
    const diff = (sorted[0] - today + 7) % 7 || 7;
    if (diff === 1) return 'tomorrow';
    return DAYS[sorted[0]];
  }

  function getHostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  // ── Sources helpers ────────────────────────────────────────────────────────
  function buildSourceRow(url = '', isPrimary = false) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <input class="finput" type="url" placeholder="https://…" value="${escHtml(url)}">
      <button class="source-label${isPrimary ? ' primary' : ''}" title="Set as primary source">${isPrimary ? '★ primary' : '☆ set primary'}</button>
      <button class="source-remove" title="Remove">✕</button>
    `;
    const labelBtn = row.querySelector('.source-label');
    labelBtn.addEventListener('click', () => {
      const list = $('sources-list');
      list.querySelectorAll('.source-label').forEach(b => {
        b.classList.remove('primary');
        b.textContent = '☆ set primary';
      });
      labelBtn.classList.add('primary');
      labelBtn.textContent = '★ primary';
    });
    row.querySelector('.source-remove').addEventListener('click', () => row.remove());
    return row;
  }

  function renderSources(sources) {
    const list = $('sources-list');
    if (!list) return;
    list.innerHTML = '';
    if (!sources || !sources.length) return;
    sources.forEach((s, i) => list.appendChild(buildSourceRow(s.url, s.primary || i === 0)));
  }

  function getSourcesFromForm() {
    const list = $('sources-list');
    if (!list) return [];
    return [...list.querySelectorAll('.source-row')].map(row => ({
      url:     row.querySelector('input').value.trim(),
      primary: row.querySelector('.source-label').classList.contains('primary'),
    })).filter(s => s.url);
  }

  // ── Alternate names ────────────────────────────────────────────────────────
  // Some sites list the same series under a different title. Alternate names
  // let match detection (findMatch) recognise the series everywhere, so
  // reading progress stays unified across sources even when the titles differ.
  function buildAltNameRow(value = '') {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <input class="finput" type="text" placeholder="Alternate title…" value="${escHtml(value)}">
      <button class="source-remove" title="Remove">✕</button>
    `;
    row.querySelector('.source-remove').addEventListener('click', () => row.remove());
    return row;
  }

  function renderAltNames(names) {
    const list = $('altnames-list');
    if (!list) return;
    list.innerHTML = '';
    (names || []).forEach(n => list.appendChild(buildAltNameRow(n)));
  }

  function getAltNamesFromForm() {
    const list = $('altnames-list');
    if (!list) return [];
    return [...list.querySelectorAll('.source-row input')]
      .map(inp => inp.value.trim())
      .filter(Boolean);
  }

  // ── Duplicate / match detection ────────────────────────────────────────────
  function normaliseTitle(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function findMatch(pageInfo) {
    if (!pageInfo) return null;
    const pageHost   = pageInfo.hostname || getHostname(pageInfo.url || '');
    const pageNorm   = normaliseTitle(pageInfo.title);
    const urlChapter = pageInfo.chapter || null;
    if (!pageNorm) return null;

    for (const entry of state.entries) {
      // Check the entry's primary title AND any alternate names — the same
      // series is often listed under a different title on different sites
      // (e.g. "Disastrous Necromancer" vs "Catastrophic Necromancer").
      const candidates = [entry.title, ...(entry.altNames || [])];
      const hasMatch = candidates.some(name => {
        const norm = normaliseTitle(name);
        // Candidate name must be at least 6 chars and appear somewhere in the page title
        return norm && norm.length >= 6 && pageNorm.includes(norm);
      });
      if (!hasMatch) continue;

      const entryHosts = new Set();
      if (entry.hostname) entryHosts.add(entry.hostname);
      (entry.sources || []).forEach(s => { const h = getHostname(s.url); if (h) entryHosts.add(h); });

      const type = (pageHost && entryHosts.has(pageHost)) ? 'exact' : 'newsource';
      return { type, entry, urlChapter };
    }
    return null;
  }

  function renderMatchCard(match, pageInfo) {
    const el = $('match-card');
    if (!el) return;

    if (!match) { el.style.display = 'none'; el.innerHTML = ''; return; }

    const { type, entry } = match;
    const isExact     = type === 'exact';
    const imgSrc      = entry.imageData || entry.image || '';
    const artEl       = imgSrc
      ? `<img src="${escHtml(imgSrc)}" alt="" style="width:36px;height:49px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">`
      : `<div style="width:36px;height:49px;border-radius:4px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${MTModel.typeIcon(entry.type)}</div>`;

    const urlChapter = match.urlChapter || null;
    // On a chapter page and we know which chapter, offer quick mark-read
    const canMarkRead = isExact && urlChapter !== null && urlChapter > (entry.chapter || 0);

    el.className = `match-card${isExact ? '' : ' newsource'}`;
    el.innerHTML = `
      <div class="match-banner">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        ${isExact ? 'In your library' : 'Found in library — different site'}
      </div>
      <div class="match-entry">
        ${artEl}
        <div class="match-info">
          <div class="match-title">${escHtml(entry.title)}</div>
          <div class="match-meta">${escHtml(entry.hostname || '')} · ${chLabel(entry)} ${entry.chapter || 0}${canMarkRead ? ` → <strong style="color:var(--acc2)">${urlChapter}</strong>` : ''} · ${escHtml(statusText(entry))}</div>
        </div>
      </div>
      <div class="match-actions">
        ${isExact
          ? `${canMarkRead ? `<button class="match-btn primary" id="match-markread-btn">Mark ${chLabel(entry)} ${urlChapter} read</button>` : ''}
             <button class="match-btn${canMarkRead ? '' : ' primary'}" id="match-edit-btn">Edit entry</button>
             <button class="match-btn" id="match-ignore-btn">Add as new</button>`
          : `<button class="match-btn green" id="match-addsrc-btn">Add as new source</button>
             <button class="match-btn" id="match-ignore-btn">Add as new anyway</button>`
        }
      </div>`;

    el.style.display = '';

    $('match-markread-btn')?.addEventListener('click', async () => {
      entry.chapter  = urlChapter;
      entry.lastRead = Date.now();
      await Storage.saveEntry(entry);
      state.entries = await Storage.getEntries();
      showToast(`${chLabel(entry)} ${urlChapter} marked read ✓`);
      if (state.syncUser) Sync.scheduleAutoPush();
      el.style.display = 'none';
      renderMatchCard(null);
    });

    $('match-edit-btn')?.addEventListener('click', () => {
      el.style.display = 'none';
      loadEntryIntoForm(entry);
    });

    $('match-addsrc-btn')?.addEventListener('click', () => {
      el.style.display = 'none';
      loadEntryIntoForm(entry);
      // Append the current page URL as an additional source if not already present
      const list = $('sources-list');
      if (list && pageInfo?.url) {
        const incomingHost = getHostname(pageInfo.url);
        const already = [...list.querySelectorAll('.source-row input')]
          .some(inp => getHostname(inp.value) === incomingHost);
        if (!already) list.appendChild(buildSourceRow(pageInfo.url, false));
      }
    });

    $('match-ignore-btn')?.addEventListener('click', () => {
      el.style.display = 'none';
    });
  }

  // ── Data load ──────────────────────────────────────────────────────────────
  async function loadAll() {
    [state.entries, state.sites, state.settings] = await Promise.all([
      Storage.getEntries(),
      Storage.getSites(),
      Storage.getSettings()
    ]);
    // Load custom tags
    const custom = await new Promise(r =>
      chrome.storage.local.get(['mt_custom_genres','mt_custom_vibes'], r)
    );
    state.customGenres = custom.mt_custom_genres || [];
    state.customVibes  = custom.mt_custom_vibes  || [];
  }

  async function saveCustomTags() {
    await new Promise(r => chrome.storage.local.set({
      mt_custom_genres: state.customGenres,
      mt_custom_vibes:  state.customVibes,
    }, r));
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function switchNav(nav) {
    state.nav = nav;
    document.querySelectorAll('.nbtn').forEach(b =>
      b.classList.toggle('active', b.dataset.nav === nav)
    );
    ['today','library'].forEach(n => {
      const bar = $(`stbar-${n}`);
      if (bar) bar.style.display = n === nav ? 'flex' : 'none';
    });
    renderCurrentPanel();
  }

  function switchStab(nav, stab) {
    state.stab[nav] = stab;
    const bar = $(`stbar-${nav}`);
    if (bar) bar.querySelectorAll('.stab').forEach(b =>
      b.classList.toggle('active', b.dataset.stab === `${nav}-${stab}`)
    );
    renderCurrentPanel();
  }

  function renderCurrentPanel() {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const nav = state.nav;
    let paneId;
    // Draw only what is on screen — the hidden sub-tab is drawn when it is opened.
    if (nav === 'today')    { paneId = `pane-today-${state.stab.today}`;
                              if (state.stab.today === 'week') renderWeekPanel(); else renderTodayPanel(); }
    if (nav === 'library')  { paneId = `pane-library-${state.stab.library}`; renderLibrary(); }
    if (nav === 'add')      { paneId = 'pane-add';      setupAddPanel(); }
    if (nav === 'sites')    { paneId = 'pane-sites';    renderSites(); }
    if (nav === 'settings') { paneId = 'pane-settings'; renderSyncStatus(); updateLibSize(); }
    const pane = $(paneId);
    if (pane) pane.classList.add('active');
    updateCounts();
  }

  // ── Today ──────────────────────────────────────────────────────────────────
  function renderDayStrip() {
    const strip = $('daystrip');
    if (!strip) return;
    strip.innerHTML = '';
    const today = new Date();
    for (let i = -2; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayIdx = d.getDay();
      const hasRel = state.entries.some(e => Schedule.isReleaseOnDate(e, d));
      const btn = document.createElement('button');
      btn.className = 'daypill' + (i < 0 ? ' past' : '') + (hasRel ? ' hasrel' : '');
      btn.textContent = `${DAYS[dayIdx]} ${d.getDate()}`;
      if (i === 0) { btn.classList.add('active'); state.selectedDay = dayIdx; state.selectedDate = d; }
      btn.addEventListener('click', () => {
        strip.querySelectorAll('.daypill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.selectedDay = dayIdx;
        state.selectedDate = d;
        renderTodayContent();
      });
      strip.appendChild(btn);
    }
  }

  function renderTodayContent() {
    const c = $('today-content');
    if (!c) return;
    const { settings, entries, selectedDate } = state;
    // isReleaseOnDate already ignores paused / completed / hiatus / season-end / dropped / irregular.
    const todayReleases = entries.filter(e => Schedule.isReleaseOnDate(e, selectedDate));
    const cookReady = entries.filter(e =>
      e.mode === 'cooking' && e.status !== 'dropped' &&
      ((e.latestChapter || 0) - (e.chapter || 0)) >= (settings.cookThreshold || 10)
    );
    const irregular = entries.filter(e =>
      Schedule.isIrregular(e) && Schedule.isTracking(e) && e.mode !== 'cooking'
    );
    const upToDateAll = settings.showUpToDate !== false
      ? entries.filter(e => {
          if (e.status === 'dropped' || e.mode === 'cooking' || e.mode === 'paused' || Schedule.isIrregular(e)) return false;
          return !Schedule.isReleaseOnDate(e, selectedDate);
        })
      : [];
    const upToDate = upToDateAll.slice(0, state.upShown);
    const paused = entries.filter(e => e.mode === 'paused' && e.status !== 'dropped')
      .sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0));

    let html = '';
    if (!todayReleases.length && !cookReady.length && !irregular.length && !upToDateAll.length && !paused.length) {
      html = `<div class="empty"><div class="empty-icon">📅</div><div class="empty-msg">Nothing for this day</div></div>`;
    }
    if (todayReleases.length) {
      html += `<div class="slabel">New releases<span>${todayReleases.length}</span></div>`;
      html += todayReleases.map(e => entryRow(e, `<span class="tag tag-new">new</span>`, true)).join('');
    }
    if (cookReady.length) {
      html += `<div class="slabel sgap">Ready to read — cooking done<span>${cookReady.length}</span></div>`;
      html += cookReady.map(e => {
        const n = (e.latestChapter || 0) - (e.chapter || 0);
        return entryRow(e, n > 0 ? `<span class="tag tag-cook">×${n}</span>` : '');
      }).join('');
    }
    if (irregular.length) {
      html += `<div class="slabel sgap">Irregular schedule<span>${irregular.length}</span></div>`;
      html += irregular.map(e => entryRow(e, `<span class="tag tag-soon">${e.releaseType === 'monthly' ? 'monthly · irregular' : 'irregular'}</span>`)).join('');
    }
    if (upToDateAll.length) {
      html += `<div class="slabel sgap">Up to date<span>${upToDateAll.length}</span></div>`;
      html += upToDate.map(e => {
        // A finished / paused-by-the-author series has no "next release" to show.
        const tag = Schedule.NOT_RELEASING.includes(e.status)
          ? MTModel.statusLabel(e.status).toLowerCase() : nextReleaseLabel(e);
        return entryRow(e, `<span class="tag tag-soon">${escHtml(tag)}</span>`);
      }).join('');
      if (upToDateAll.length > upToDate.length) {
        html += `<button class="morebtn" id="more-uptodate">Show ${Math.min(PAGE_SIZE, upToDateAll.length - upToDate.length)} more (${upToDateAll.length - upToDate.length} left)</button>`;
      }
    }
    if (paused.length) {
      const top = paused.slice(0, 5);
      html += `<div class="slabel sgap">Paused<span>${paused.length}</span></div>`;
      html += top.map(e => entryRow(e, `<span class="tag tag-pause">paused${e.pausedAt ? ' ' + daysAgoLabel(e.pausedAt) : ''}</span>`)).join('');
      if (paused.length > top.length) html += `<button class="morebtn" id="goto-paused">Show all ${paused.length} paused in Library</button>`;
    }
    c.innerHTML = html;
    attachEntryClicks(c);
    $('more-uptodate')?.addEventListener('click', () => { state.upShown += PAGE_SIZE; renderTodayContent(); });
    $('goto-paused')?.addEventListener('click', () => {
      state.libStatusFilter = 'paused'; state.libShown = PAGE_SIZE;
      if ($('lib-status-filter')) $('lib-status-filter').value = 'paused';
      switchStab('library', 'all'); switchNav('library');
    });
  }

  function renderTodayPanel() { renderDayStrip(); renderTodayContent(); }

  function renderWeekPanel() {
    const c = $('week-content');
    if (!c) return;
    const weekData = Schedule.getWeekData(state.entries, new Date());
    let html = '';
    weekData.forEach(day => {
      if (!day.releases.length) return;
      const label = day.isToday ? 'Today'
        : `${day.fullLabel} ${day.dateNum} ${day.month}`;
      html += `<div class="slabel ${html ? 'sgap' : ''}">${label}</div>`;
      html += day.releases.map(e => {
        const tag = day.isPast  ? `<span class="tag tag-soon">past</span>`
          : day.isToday         ? `<span class="tag tag-new">today</span>`
          :                       `<span class="tag tag-soon">upcoming</span>`;
        return entryRow(e, tag);
      }).join('');
    });
    if (!html) html = `<div class="empty"><div class="empty-icon">📅</div><div class="empty-msg">No releases this week</div></div>`;
    c.innerHTML = html;
    attachEntryClicks(c);
  }

  // ── Entry row ──────────────────────────────────────────────────────────────
  function entryRow(entry, tagHtml = '', showMarkRead = false) {
    const meta = [entry.type, ...(entry.tropes || []).slice(0,2)].filter(Boolean).join(' · ');
    const markBtn = showMarkRead
      ? `<button class="mark-read-btn" data-id="${entry.id}" title="Mark as read">✓ +1</button>`
      : '';
    return `<div class="entry" data-id="${entry.id}">
      ${artHtml(entry, 32)}
      <div class="ebody">
        <div class="etitle">${escHtml(entry.title)}</div>
        <div class="emeta">${statusDot(entry)}${escHtml(meta)}</div>
      </div>
      <div class="eright">
        <div class="echnum">${chLabel(entry)} ${entry.chapter || 0}</div>
        ${tagHtml}
        ${markBtn}
      </div>
    </div>`;
  }

  function attachEntryClicks(container) {
    container.querySelectorAll('.entry').forEach(row =>
      row.addEventListener('click', e => {
        // Don't open detail modal if the mark-read button was clicked
        if (e.target.closest('.mark-read-btn')) return;
        openDetail(row.dataset.id);
      })
    );
    container.querySelectorAll('.mark-read-btn').forEach(btn =>
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const entry = state.entries.find(en => en.id === id);
        if (!entry) return;
        entry.chapter  = (entry.chapter || 0) + 1;
        entry.lastRead = Date.now();
        await Storage.saveEntry(entry);
        state.entries = await Storage.getEntries();
        showToast(`${chLabel(entry)} ${entry.chapter} marked read`);
        if (state.syncUser) Sync.scheduleAutoPush();
        renderCurrentPanel();
      })
    );
  }

  // ── Library ────────────────────────────────────────────────────────────────
  function filteredEntries() {
    return state.entries.filter(e => {
      if (state.libSearch) {
        const q = state.libSearch.toLowerCase();
        const hit = (e.title || '').toLowerCase().includes(q)
          || (e.altNames || []).some(n => n.toLowerCase().includes(q))
          || (e.tropes || []).some(t => t.toLowerCase().includes(q))
          || (e.hostname || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (state.libTypeFilter && e.type !== state.libTypeFilter) return false;
      switch (state.libStatusFilter) {
        case 'ongoing':    if (e.mode !== 'following')      return false; break;
        case 'cooking':    if (e.mode !== 'cooking')        return false; break;
        case 'paused':     if (e.mode !== 'paused')         return false; break;
        case 'completed':  if (e.status !== 'completed')    return false; break;
        case 'hiatus':     if (e.status !== 'hiatus')       return false; break;
        case 'dropped':    if (e.status !== 'dropped')      return false; break;
        case 'season_end': if (e.status !== 'season_end')   return false; break;
      }
      return true;
    });
  }

  function countLine(shown, filtered) {
    const total = state.entries.length;
    const filteredNow = filtered !== total;
    return filteredNow
      ? `Showing ${shown} of ${filtered} matching · ${total} ${total === 1 ? 'title' : 'titles'} in total`
      : `${total} ${total === 1 ? 'title' : 'titles'}`;
  }

  function moreButton(left, id) {
    return `<button class="morebtn" id="${id}">Show ${Math.min(PAGE_SIZE, left)} more (${left} left)</button>`;
  }

  // Draws whichever library sub-tab is open.
  function renderLibrary() {
    if (state.stab.library === 'bysite') renderLibrarySite(); else renderLibraryAll();
  }

  function renderLibraryAll() {
    const c = $('lib-all-content');
    if (!c) return;
    const all = filteredEntries();
    const entries = all.slice(0, state.libShown);
    if ($('lib-count')) $('lib-count').textContent = countLine(entries.length, all.length);
    if (!all.length) {
      c.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>
        <div class="empty-msg">${state.entries.length ? 'No matches.' : 'No entries yet.'}</div></div>`;
      return;
    }
    c.innerHTML = entries.map(e =>
      `<div class="entry" data-id="${e.id}">
        ${artHtml(e, 32)}
        <div class="ebody">
          <div class="etitle">${escHtml(e.title)}</div>
          <div class="emeta">${statusDot(e)}${escHtml(statusText(e))} · ${escHtml(releaseSummary(e))}</div>
        </div>
        <div class="eright">
          <div class="echnum">${chLabel(e)} ${e.chapter || 0}</div>
          <div style="font-size:9px;color:var(--txt3);margin-top:2px">${escHtml(e.hostname || '')}</div>
        </div>
      </div>`
    ).join('') + (all.length > entries.length ? moreButton(all.length - entries.length, 'more-lib') : '');
    attachEntryClicks(c);
    $('more-lib')?.addEventListener('click', () => { state.libShown += PAGE_SIZE; renderLibraryAll(); });
  }

  function renderLibrarySite() {
    const c = $('lib-site-content');
    if (!c) return;
    const all = filteredEntries();
    const groups = {};
    all.forEach(e => {
      const k = e.hostname || 'unknown';
      (groups[k] = groups[k] || []).push(e);
    });
    if (!Object.keys(groups).length) {
      if ($('lib-count-site')) $('lib-count-site').textContent = countLine(0, 0);
      c.innerHTML = `<div class="empty"><div class="empty-icon">🌐</div><div class="empty-msg">${state.entries.length ? 'No matches.' : 'No entries yet.'}</div></div>`;
      return;
    }
    // Draw groups until the page budget is used up; headings show true totals.
    let budget = state.libShown, drawn = 0, html = '';
    for (const [site, es] of Object.entries(groups)) {
      if (budget <= 0) break;
      const part = es.slice(0, budget);
      budget -= part.length; drawn += part.length;
      html += `<div class="grouphead"><span>${escHtml(site)}</span><span class="gcnt">${es.length}</span></div>` +
        part.map(e => `<div class="entry" data-id="${e.id}">
          ${artHtml(e, 32)}
          <div class="ebody">
            <div class="etitle">${escHtml(e.title)}</div>
            <div class="emeta">${statusDot(e)}${escHtml(statusText(e))} · ${chLabel(e)} ${e.chapter || 0}</div>
          </div>
        </div>`).join('');
    }
    if (all.length > drawn) html += moreButton(all.length - drawn, 'more-site');
    if ($('lib-count-site')) $('lib-count-site').textContent = countLine(drawn, all.length);
    c.innerHTML = html;
    attachEntryClicks(c);
    $('more-site')?.addEventListener('click', () => { state.libShown += PAGE_SIZE; renderLibrarySite(); });
  }

  // ── Add / Edit panel ───────────────────────────────────────────────────────
  function buildTagPills(containerEl, tags, group) {
    // keep existing custom pills that are already rendered, only add missing ones
    const existing = new Set([...containerEl.querySelectorAll('.pill')].map(p => p.textContent.trim()));
    tags.forEach(tag => {
      if (existing.has(tag)) return;
      const btn = document.createElement('button');
      btn.className = 'pill small';
      btn.dataset.group = group;
      btn.textContent = tag;
      btn.addEventListener('click', () => btn.classList.toggle('on'));
      containerEl.appendChild(btn);
    });
  }

  function setupCustomTagInput(inputId, btnId, pillContainerId, group) {
    const input = $(inputId);
    const btn   = $(btnId);
    const pills = $(pillContainerId);
    if (!input || !btn || !pills) return;

    function addTag() {
      const val = input.value.trim();
      if (!val) return;
      const all = [...pills.querySelectorAll('.pill')].map(p => p.textContent.trim());
      if (all.includes(val)) { input.value = ''; return; }

      // Add pill
      const pillBtn = document.createElement('button');
      pillBtn.className = 'pill small on';
      pillBtn.dataset.group = group;
      pillBtn.textContent = val;
      pillBtn.addEventListener('click', () => pillBtn.classList.toggle('on'));
      pills.appendChild(pillBtn);

      // Save to custom list
      if (group === 'tropes') {
        if (!state.customGenres.includes(val)) { state.customGenres.push(val); saveCustomTags(); }
      } else {
        if (!state.customVibes.includes(val)) { state.customVibes.push(val); saveCustomTags(); }
      }
      input.value = '';
    }

    btn.addEventListener('click', addTag);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
  }

  // Genre pills = built-in list + your own + anything already used on an entry
  // (so genres typed on the web app show up here too). Existing pills — and
  // whether they are ticked — are left alone; only missing ones are added.
  function ensureGenrePills(extra = []) {
    const pills = $('trope-pills');
    if (!pills) return;
    buildTagPills(pills, MTModel.unionGenres(DEFAULT_GENRES, state.customGenres, state.entries.flatMap(e => e.tropes || []), extra), 'tropes');
  }

  function addGenrePill(label, on) {
    const pills = $('trope-pills');
    const btn = document.createElement('button');
    btn.className = 'pill small' + (on ? ' on' : '');
    btn.dataset.group = 'tropes';
    btn.textContent = label;
    btn.addEventListener('click', () => btn.classList.toggle('on'));
    pills.appendChild(btn);
    return btn;
  }

  // One box that both searches the genre list and adds a new genre.
  //   type      → pills narrow to matches (ticked ones always stay visible)
  //   Enter / + → ticks/unticks the exact match, or adds your text as a new genre
  function setupGenreSearch() {
    const input = $('trope-custom-input'), btn = $('trope-custom-btn');
    const pills = $('trope-pills'), hint = $('trope-hint');
    if (!input || !btn || !pills || input.dataset.wired) return;
    input.dataset.wired = '1';

    function applyFilter() {
      const q = input.value.trim();
      const all = [...pills.querySelectorAll('.pill')];
      let matches = 0;
      all.forEach(p => {
        const hit = MTModel.matchesQuery(p.textContent, q);
        if (hit) matches++;
        p.classList.toggle('hidden', !(hit || p.classList.contains('on')));
      });
      if (!q) { hint.style.display = 'none'; return; }
      const exact = all.find(p => p.textContent.trim().toLowerCase() === q.toLowerCase());
      hint.style.display = '';
      hint.textContent = exact
        ? `“${exact.textContent.trim()}” is in the list — press Enter to ${exact.classList.contains('on') ? 'untick' : 'tick'} it.`
        : matches
          ? `${matches} match${matches === 1 ? '' : 'es'} — or press Enter / + to add “${q}” as a new genre.`
          : `No match — press Enter / + to add “${q}” as a new genre.`;
    }

    function commit() {
      const q = input.value.trim();
      if (!q) return;
      const exact = [...pills.querySelectorAll('.pill')].find(p => p.textContent.trim().toLowerCase() === q.toLowerCase());
      if (exact) exact.classList.toggle('on');
      else {
        addGenrePill(q, true);
        if (!state.customGenres.some(g => g.toLowerCase() === q.toLowerCase())) { state.customGenres.push(q); saveCustomTags(); }
      }
      input.value = '';
      applyFilter();
    }

    input.addEventListener('input', applyFilter);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    btn.addEventListener('click', commit);
  }

  function setupAddPanel() {
    const vibePills = $('vibe-pills');
    ensureGenrePills();
    if (vibePills) buildTagPills(vibePills, state.customVibes, 'vibes');

    // Wire the genre search and the vibe "add" box once.
    if (!$('vibe-custom-btn').dataset.wired) {
      setupGenreSearch();
      setupCustomTagInput('vibe-custom-input','vibe-custom-btn','vibe-pills','vibes');
      $('vibe-custom-btn').dataset.wired = '1';
    }

    if (!state.editId) detectPageInfo();
  }

  function detectPageInfo() {
    if ($('detect-url')) $('detect-url').textContent = 'Detecting…';
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_INFO' }, info => {
          if (chrome.runtime.lastError || !info) {
            fillDetect({ title: tabs[0].title || '', url: tabs[0].url || '',
              hostname: getHostname(tabs[0].url || ''), image: '', genres: [] });
            return;
          }
          fillDetect(info);
        });
      });
    } catch(e) { console.log('Detection failed', e); }
  }

  function fillDetect(info) {
    state.pageInfo = info;
    if ($('detect-url'))  $('detect-url').textContent  = info.url || '';
    if ($('detect-name')) $('detect-name').textContent = info.title || '—';
    if ($('detect-site')) $('detect-site').textContent = info.hostname || '—';
    if ($('f-title') && !$('f-title').dataset.edited) $('f-title').value = info.title || '';

    // Type (manga / manhwa / anime …): applied only when the detector is at
    // least moderately sure, and never over a choice you made yourself.
    const typeEl = $('f-type'), typeNote = $('detect-type');
    if (typeNote) {
      const label = info.type ? MTModel.typeInfo(info.type).label : '';
      typeNote.textContent = !info.type ? ''
        : ['medium', 'high'].includes(info.typeConfidence) ? `Detected: ${label} (${info.typeConfidence} confidence)`
        : `Possibly ${label} — please check`;
    }
    if (info.type && typeEl && !typeEl.dataset.edited && ['medium', 'high'].includes(info.typeConfidence)) {
      typeEl.value = info.type;
    }

    // Auto-fill chapter from URL if detected and field hasn't been manually edited
    if (info.chapter && $('f-chapter') && !$('f-chapter').dataset.edited) {
      $('f-chapter').value = info.chapter;
    }

    // Auto-add detected page URL as first source if sources list is empty
    const list = $('sources-list');
    if (list && !list.querySelector('.source-row') && info.url) {
      list.appendChild(buildSourceRow(info.url, true));
    }

    // Duplicate / match detection — only on fresh adds, not when editing
    if (!state.editId) renderMatchCard(findMatch(info), info);

    // Auto-set cover art preview from og:image if no upload yet
    if (!state.uploadedImageData && info.image) {
      setPreviewImage(info.image);
    }

    // Auto-tick detected genres
    if (info.genres && info.genres.length) {
      ensureGenrePills(info.genres);
      const pills = $('trope-pills');
      if (pills) {
        info.genres.forEach(g => {
          const match = [...pills.querySelectorAll('.pill')].find(p =>
            p.textContent.trim().toLowerCase() === g.toLowerCase());
          if (match) match.classList.add('on');
        });
      }
    }
  }

  function setPreviewImage(src) {
    const preview = $('img-preview');
    if (!preview) return;
    const emoji = $('img-preview-emoji');
    if (emoji) emoji.style.display = 'none';
    // remove old img if any
    preview.querySelector('img')?.remove();
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.onerror = () => { img.remove(); if (emoji) emoji.style.display = ''; };
    preview.appendChild(img);
  }

  function clearPreviewImage() {
    const preview = $('img-preview');
    if (!preview) return;
    preview.querySelector('img')?.remove();
    const emoji = $('img-preview-emoji');
    if (emoji) emoji.style.display = '';
    state.uploadedImageData = null;
  }

  function wireImageUpload() {
    const preview   = $('img-preview');
    const fileInput = $('img-file-input');
    const srcAuto   = $('img-src-auto');
    const srcUpload = $('img-src-upload');
    const srcPick   = $('img-src-pick');
    const srcClear  = $('img-src-clear');

    if (!preview || !fileInput || preview.dataset.wired) return;
    preview.dataset.wired = '1';

    preview.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        // Uploads used to be stored at full size (often megabytes each).
        const small = await shrinkImage(e.target.result);
        state.uploadedImageData = small;
        setPreviewImage(small);
        srcUpload?.classList.add('on');
        srcAuto?.classList.remove('on');
        srcPick?.classList.remove('on');
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });

    srcAuto?.addEventListener('click', () => {
      state.uploadedImageData = null;
      srcAuto.classList.add('on');
      srcUpload?.classList.remove('on');
      srcPick?.classList.remove('on');
      clearPreviewImage();
      if (state.pageInfo?.image) setPreviewImage(state.pageInfo.image);
    });

    srcUpload?.addEventListener('click', () => fileInput.click());

    // ── Pick from page ─────────────────────────────────────────────────────
    // Uses chrome.scripting.executeScript to inject the picker directly into
    // the page. This is reliable regardless of whether content.js has already
    // loaded — it always runs fresh. The injected function sets up the banner,
    // highlight box, and event listeners, then sends IMAGE_PICK_RESULT back
    // via chrome.runtime.sendMessage when the user clicks an image or presses Esc.
    srcPick?.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0]) { showToast('No active tab found'); return; }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            // Idempotent — don't start a second picker if one is already active
            if (window.__mt_picker_active) return;
            window.__mt_picker_active = true;

            const banner = document.createElement('div');
            banner.id = '__mt_pick_banner';
            Object.assign(banner.style, {
              position: 'fixed', top: '12px', left: '50%',
              transform: 'translateX(-50%)', zIndex: '2147483647',
              background: '#1a1e25', color: '#9d8fff',
              fontFamily: 'monospace', fontSize: '12px', letterSpacing: '.08em',
              padding: '8px 18px', borderRadius: '6px',
              border: '1px solid #7c6af740', pointerEvents: 'none', whiteSpace: 'nowrap',
            });
            banner.textContent = 'MangaTracker: click any image to use as cover art  ·  Esc to cancel';
            document.body.appendChild(banner);

            const hl = document.createElement('div');
            hl.id = '__mt_pick_hl';
            Object.assign(hl.style, {
              position: 'fixed', zIndex: '2147483646', display: 'none',
              outline: '3px solid #7c6af7', outlineOffset: '1px',
              borderRadius: '3px', pointerEvents: 'none', boxSizing: 'border-box',
            });
            document.body.appendChild(hl);

            let lastImg = null;

            function cleanup() {
              window.__mt_picker_active = false;
              banner.remove(); hl.remove();
              document.body.style.cursor = '';
              document.removeEventListener('keydown',   onKey,  true);
              document.removeEventListener('mousemove', onMove, true);
              document.removeEventListener('click',     onClk,  true);
            }

            function onKey(e) {
              if (e.key !== 'Escape') return;
              cleanup();
              chrome.runtime.sendMessage({ type: 'IMAGE_PICK_RESULT', cancelled: true, src: '' });
            }

            function onMove(e) {
              const img = e.target.closest('img');
              if (img === lastImg) return;
              lastImg = img;
              if (img) {
                const r = img.getBoundingClientRect();
                Object.assign(hl.style, {
                  display: 'block',
                  left: r.left + 'px', top: r.top + 'px',
                  width: r.width + 'px', height: r.height + 'px',
                });
                document.body.style.cursor = 'crosshair';
              } else {
                hl.style.display = 'none';
                document.body.style.cursor = '';
              }
            }

            function onClk(e) {
              const img = e.target.closest('img');
              if (!img) return;
              e.preventDefault(); e.stopPropagation();
              // Prefer the highest-res real src; fall back to lazy-load attrs
              let src = img.currentSrc || img.src || '';
              // currentSrc/src may be the placeholder (e.g. dflazy.jpg) on lazy-load sites
              const isPlaceholder = !src || src.includes('dflazy') || src.includes('placeholder') ||
                src.includes('lazy') || src.endsWith('/0') || src === window.location.href;
              if (isPlaceholder || !src) {
                // Try srcset first (highest resolution candidate)
                const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset') || '';
                if (srcset) {
                  const candidates = srcset.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
                  if (candidates.length) src = candidates[candidates.length - 1]; // largest
                }
                if (!src || isPlaceholder) {
                  src = img.getAttribute('data-src') || img.getAttribute('data-original') ||
                    img.getAttribute('data-lazy-src') || img.getAttribute('data-lazyload') || src;
                }
              }
              cleanup();
              chrome.runtime.sendMessage({ type: 'IMAGE_PICK_RESULT', cancelled: false, src });
            }

            document.addEventListener('keydown',   onKey,  true);
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('click',     onClk,  true);
          }
        }, (results) => {
          if (chrome.runtime.lastError) {
            showToast('Picker unavailable — try refreshing the page');
          } else {
            showToast('Click any image on the page  ·  Esc to cancel', 5000);
          }
        });
      });
    });

    // ── Receive pick result from content script (relayed via background) ───
    if (!window.__mt_pick_listener) {
      window.__mt_pick_listener = true;
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type !== 'IMAGE_PICK_RESULT') return;
        if (msg.cancelled || !msg.src) {
          showToast('Pick cancelled');
          return;
        }
        // Convert to base64 via canvas so we own a local copy
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const scale  = Math.min(1, COVER_MAX_W / img.naturalWidth);
            canvas.width  = Math.round(img.naturalWidth  * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', COVER_QUALITY);
            state.uploadedImageData = dataUrl;
            setPreviewImage(dataUrl);
            srcPick?.classList.add('on');
            srcAuto?.classList.remove('on');
            srcUpload?.classList.remove('on');
            showToast('Cover art picked ✓');
          } catch {
            // CORS-tainted canvas — store URL; saveEntry will retry encoding at save time
            state.uploadedImageData = null;
            setPreviewImage(msg.src);
            // Stash the URL in pageInfo so saveEntry's fetchImageAsDataUrl can pick it up
            if (!state.pageInfo) state.pageInfo = {};
            state.pageInfo.image = msg.src;
            srcPick?.classList.add('on');
            srcAuto?.classList.remove('on');
            srcUpload?.classList.remove('on');
            showToast('Picked ✓ (will encode on save)');
          }
        };
        img.onerror = () => {
          // CORS block — store URL directly (will render fine in same-origin context)
          if (msg.src && msg.src.startsWith('http')) {
            state.uploadedImageData = null;
            setPreviewImage(msg.src);
            srcPick?.classList.add('on');
            srcAuto?.classList.remove('on');
            srcUpload?.classList.remove('on');
            showToast('Cover set (URL) ✓');
          } else {
            showToast('Could not load that image');
          }
        };
        img.src = msg.src;
      });
    }

    srcClear?.addEventListener('click', () => {
      state.uploadedImageData = null;
      srcAuto?.classList.remove('on');
      srcUpload?.classList.remove('on');
      srcPick?.classList.remove('on');
      clearPreviewImage();
    });
  }

  function getFormData() {
    const tropes = [...document.querySelectorAll('#trope-pills .pill.on')].map(p => p.textContent.trim());
    const vibes  = [...document.querySelectorAll('#vibe-pills .pill.on')].map(p => p.textContent.trim());
    const mode   = document.querySelector('#mode-pills .pill.on')?.textContent.trim().toLowerCase() || 'following';
    const statusRaw = document.querySelector('#status-pills .pill.on')?.textContent.trim().toLowerCase() || 'ongoing';
    const status = statusRaw === 'hiatus'      ? 'hiatus'
      : statusRaw === 'dropped'                ? 'dropped'
      : statusRaw === 'completed'              ? 'completed'
      : statusRaw === 'season end'             ? 'season_end' : 'ongoing';
    const releaseType = document.querySelector('#schedtype-pills .pill.on')?.dataset.schedtype || 'weekly';
    let releaseDays = [], freq = 1, releaseDayOfMonth = null;
    if (releaseType === 'monthly') {
      // Monthly can be a fixed date OR irregular (no predictable date).
      // Irregular is stored as releaseFreq 0, the same marker weekly uses.
      const monthlyFreq = parseInt(document.querySelector('#monthly-chips .fchip.on')?.dataset.mfreq ?? '1');
      if (monthlyFreq === 0) { freq = 0; releaseDayOfMonth = null; }
      else releaseDayOfMonth = Math.min(Math.max(parseInt($('f-day-of-month')?.value || '1') || 1, 1), 31);
    } else {
      freq = parseInt(document.querySelector('#freq-chips .fchip.on')?.dataset.freq || '1');
      if (freq === 0) {
        // Irregular — deliberately no fixed day, so no default-to-today either.
        releaseDays = [];
      } else {
        releaseDays = [...document.querySelectorAll('#day-chips .dchip.on')].map(b => parseInt(b.dataset.day));
        // If no day is picked, default to today so the entry always ends up
        // with an actual schedule instead of "schedule unknown". Only makes
        // sense for a fixed weekly frequency, not Irregular (handled above).
        if (!releaseDays.length) releaseDays = [new Date().getDay()];
      }
    }
    const sources = getSourcesFromForm();
    const altNames = getAltNamesFromForm();
    const primarySource = sources.find(s => s.primary) || sources[0];
    return {
      title: $('f-title')?.value.trim() || '',
      type:  $('f-type')?.value || 'manhwa',
      chapter: parseInt($('f-chapter')?.value || '0'),
      tropes, vibes, mode, status,
      releaseType, releaseDays, releaseFreq: freq, releaseDayOfMonth,
      notes: $('f-notes')?.value.trim() || '',
      sources, altNames,
      url: primarySource?.url || state.pageInfo?.url || '',
      hostname: primarySource ? getHostname(primarySource.url) : (state.pageInfo?.hostname || ''),
      image: (!state.uploadedImageData && state.pageInfo?.image) ? state.pageInfo.image : '',
      imageData: state.uploadedImageData || '',
    };
  }

  // Re-encode any image (data URL or URL) as a small JPEG data URL.
  // Falls back to the original if the browser can't draw it.
  function shrinkImage(src, maxW = COVER_MAX_W, quality = COVER_QUALITY) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / img.naturalWidth);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.max(1, Math.round(img.naturalWidth  * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no transparency
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  // Fetch a URL and encode it as a base64 data-URL via canvas.
  // Falls back to the raw URL if the fetch fails (e.g. CORS, offline).
  async function fetchImageAsDataUrl(url) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const scale  = Math.min(1, COVER_MAX_W / img.naturalWidth);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.naturalWidth  * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', COVER_QUALITY));
        } catch {
          // CORS-tainted or other canvas error — return raw URL as fallback
          resolve(url);
        }
      };
      img.onerror = () => resolve(url); // network error — keep URL
      img.src = url;
    });
  }

  async function saveEntry() {
    const data = getFormData();
    if (!data.title) { showToast('Enter a title first'); return; }

    // If no locally-encoded imageData but we have a URL image (auto mode),
    // try to download and base64-encode it so it's available offline.
    if (!data.imageData && data.image) {
      const encoded = await fetchImageAsDataUrl(data.image);
      // If we got a real data-URL (not the fallback URL), store it
      if (encoded && encoded.startsWith('data:')) {
        data.imageData = encoded;
        data.image = ''; // don't double-store
      }
      // If encoding failed, keep data.image as the URL fallback
    }

    const existing = state.editId ? state.entries.find(e => e.id === state.editId) : {};
    const entry = {
      ...(existing || {}),
      id: state.editId || Storage.generateId(),
      ...data,
      savedAt: Date.now(),
      lastRead: existing?.lastRead || Date.now(),
    };
    MTModel.stampModeChange(entry, existing);   // remembers when it was paused

    const btn = $('save-btn');
    const originalBtnText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    // Storage.saveEntry() now throws if the underlying chrome.storage.local
    // write actually failed (see storage.js) instead of silently reporting
    // success — most commonly this happens when accumulated cover-art images
    // push local storage over its quota. We rely on that here: only show
    // "Saved to library" / reset the form / navigate away once the write is
    // genuinely confirmed, so a failed save never masquerades as a success
    // and the user never loses what they typed.
    try {
      await Storage.saveEntry(entry);
      if (entry.hostname) await Storage.saveSite({ hostname: entry.hostname, addedAt: Date.now() });
      state.entries = await Storage.getEntries();
      state.sites   = await Storage.getSites();
      showToast(state.editId ? 'Updated' : 'Saved to library');
      // ── Auto-push to cloud whenever signed in ──────────────────────────────
      if (state.syncUser) Sync.scheduleAutoPush();
      state.editId = null;
      resetAddForm();
      switchNav('library');
    } catch (e) {
      console.error('[MangaTracker] saveEntry failed:', e);
      showToast(e.message || 'Save failed — please try again', 5000);
      // Deliberately NOT resetting the form or navigating away here — the
      // user's input is preserved so they don't lose it after a failed save.
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalBtnText || 'Save to library'; }
    }
  }

  function resetAddForm() {
    if ($('f-title'))   { $('f-title').value = '';  delete $('f-title').dataset.edited; }
    if ($('f-chapter')) { $('f-chapter').value = '0'; delete $('f-chapter').dataset.edited; }
    if ($('f-notes'))   $('f-notes').value   = '';
    document.querySelectorAll('#trope-pills .pill.on, #vibe-pills .pill.on').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('#day-chips .dchip.on').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('#mode-pills .pill').forEach((p, i) => p.classList.toggle('on', i === 0));
    document.querySelectorAll('#status-pills .pill').forEach((p, i) => p.classList.toggle('on', i === 0));
    document.querySelectorAll('#freq-chips .fchip').forEach((b, i) => b.classList.toggle('on', i === 0));
    document.querySelectorAll('#schedtype-pills .pill').forEach((p, i) => p.classList.toggle('on', i === 0));
    if ($('weekly-schedule'))  $('weekly-schedule').style.display  = '';
    if ($('monthly-schedule')) $('monthly-schedule').style.display = 'none';
    if ($('day-chips'))        $('day-chips').style.display        = '';
    if ($('f-day-of-month'))   $('f-day-of-month').value = '1';
    document.querySelectorAll('#monthly-chips .fchip').forEach((b, i) => b.classList.toggle('on', i === 0));
    if ($('monthly-date'))     $('monthly-date').style.display = '';
    if ($('f-type'))           delete $('f-type').dataset.edited;
    if ($('detect-type'))      $('detect-type').textContent = '';
    if ($('trope-custom-input')) { $('trope-custom-input').value = ''; $('trope-custom-input').dispatchEvent(new Event('input')); }
    if ($('altnames-list'))    $('altnames-list').innerHTML = '';
    clearPreviewImage();
    state.pageInfo = null;
    state.uploadedImageData = null;
    state.editId = null;
    if ($('detect-url'))  $('detect-url').textContent  = 'Detecting page…';
    if ($('detect-name')) $('detect-name').textContent = '—';
    if ($('detect-site')) $('detect-site').textContent = '—';
    if ($('save-btn'))    $('save-btn').textContent    = 'Save to library';
    renderMatchCard(null);
    // reset sources
    const sourcesList = $('sources-list');
    if (sourcesList) sourcesList.innerHTML = '';
    // reset img source buttons
    $('img-src-auto')?.classList.add('on');
    $('img-src-upload')?.classList.remove('on');
  }

  function loadEntryIntoForm(entry) {
    state.editId   = entry.id;
    state.pageInfo = { url: entry.url, hostname: entry.hostname, image: entry.image };
    state.uploadedImageData = entry.imageData || null;

    if ($('f-title'))   { $('f-title').value = entry.title; $('f-title').dataset.edited = '1'; }
    if ($('f-type'))    $('f-type').value    = entry.type || 'manhwa';
    if ($('f-chapter')) $('f-chapter').value = entry.chapter || 0;
    if ($('f-notes'))   $('f-notes').value   = entry.notes || '';
    if ($('detect-url'))  $('detect-url').textContent  = entry.url || '';
    if ($('detect-name')) $('detect-name').textContent = entry.title;
    if ($('detect-site')) $('detect-site').textContent = entry.hostname || '';
    // Restore sources — fall back to legacy single URL if no sources array yet
    const existingSources = entry.sources && entry.sources.length
      ? entry.sources
      : (entry.url ? [{ url: entry.url, primary: true }] : []);
    renderSources(existingSources);
    renderAltNames(entry.altNames || []);

    const imgSrc = entry.imageData || entry.image || '';
    if (imgSrc) setPreviewImage(imgSrc);

    // Make sure every genre pill exists (including this entry's own) before ticking
    const vibePills  = $('vibe-pills');
    ensureGenrePills(entry.tropes || []);
    if (vibePills)  buildTagPills(vibePills,  state.customVibes,  'vibes');
    if ($('f-type')) $('f-type').dataset.edited = '1';
    if ($('detect-type')) $('detect-type').textContent = '';
    if ($('trope-custom-input')) { $('trope-custom-input').value = ''; $('trope-custom-input').dispatchEvent(new Event('input')); }

    document.querySelectorAll('#trope-pills .pill').forEach(p =>
      p.classList.toggle('on', (entry.tropes || []).map(t=>t.toLowerCase()).includes(p.textContent.trim().toLowerCase()))
    );
    document.querySelectorAll('#vibe-pills .pill').forEach(p =>
      p.classList.toggle('on', (entry.vibes || []).map(v=>v.toLowerCase()).includes(p.textContent.trim().toLowerCase()))
    );
    document.querySelectorAll('#mode-pills .pill').forEach(p =>
      p.classList.toggle('on', p.textContent.trim().toLowerCase() === (entry.mode || 'following'))
    );
    document.querySelectorAll('#status-pills .pill').forEach(p => {
      const pillText = p.textContent.trim().toLowerCase();
      const entryStatus = (entry.status || 'ongoing');
      const match = pillText === entryStatus ||
        (pillText === 'season end' && entryStatus === 'season_end');
      p.classList.toggle('on', match);
    });
    document.querySelectorAll('#day-chips .dchip').forEach(b =>
      b.classList.toggle('on', (entry.releaseDays || []).includes(parseInt(b.dataset.day)))
    );
    const isMonthly = entry.releaseType === 'monthly';
    // For a monthly entry the weekly chips show their defaults (1×); its own
    // "same date / irregular" choice is restored on the monthly chips below.
    const freq = isMonthly ? 1 : (entry.releaseFreq ?? 1);
    document.querySelectorAll('#freq-chips .fchip').forEach(b =>
      b.classList.toggle('on', parseInt(b.dataset.freq) === freq)
    );
    if ($('day-chips')) $('day-chips').style.display = (freq === 0) ? 'none' : '';
    const monthlyFreq = (isMonthly && entry.releaseFreq === 0) ? 0 : 1;
    document.querySelectorAll('#monthly-chips .fchip').forEach(b =>
      b.classList.toggle('on', parseInt(b.dataset.mfreq) === monthlyFreq)
    );
    if ($('monthly-date')) $('monthly-date').style.display = monthlyFreq === 0 ? 'none' : '';
    document.querySelectorAll('#schedtype-pills .pill').forEach(p =>
      p.classList.toggle('on', p.dataset.schedtype === (isMonthly ? 'monthly' : 'weekly'))
    );
    if ($('weekly-schedule'))  $('weekly-schedule').style.display  = isMonthly ? 'none' : '';
    if ($('monthly-schedule')) $('monthly-schedule').style.display = isMonthly ? '' : 'none';
    if ($('f-day-of-month'))   $('f-day-of-month').value = entry.releaseDayOfMonth || 1;
    if ($('save-btn')) $('save-btn').textContent = 'Update entry';
  }

  // ── Detail modal ───────────────────────────────────────────────────────────
  function openDetail(id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    const ch = chLabel(entry);
    const lastRead = entry.lastRead ? new Date(entry.lastRead).toLocaleDateString() : 'never';
    const imgSrc   = entry.imageData || entry.image || '';
    const artEl    = imgSrc
      ? `<div class="modal-art"><img src="${escHtml(imgSrc)}" alt="" onerror="this.parentElement.innerHTML='📖'"></div>`
      : `<div class="modal-art">${MTModel.typeIcon(entry.type)}</div>`;
    const isPaused = entry.mode === 'paused';

    $('detail-modal-inner').innerHTML = `
      <div class="modal-header">
        ${artEl}
        <div class="modal-info">
          <div class="modal-title">${escHtml(entry.title)}</div>
          <div class="modal-site">${escHtml(entry.hostname || '')} · ${escHtml(entry.type)}</div>
        </div>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="medit-ch">
          <span class="ch-label">${ch}</span>
          <button class="ch-control" id="ch-dec">−</button>
          <span class="ch-display" id="ch-disp">${entry.chapter || 0}</span>
          <button class="ch-control" id="ch-inc">+</button>
          <button class="mact primary" id="ch-markread" style="flex:0;white-space:nowrap;padding:5px 10px">Mark read</button>
        </div>
        <div class="mstat">
          <div class="mstat-card">
            <div class="mstat-label">Status</div>
            <div class="mstat-val" style="font-size:12px">${escHtml(statusText(entry))}</div>
          </div>
          <div class="mstat-card">
            <div class="mstat-label">Last read</div>
            <div class="mstat-val" style="font-size:11px">${lastRead}</div>
          </div>
          <div class="mstat-card">
            <div class="mstat-label">Schedule</div>
            <div class="mstat-val" style="font-size:10px">${escHtml(releaseSummary(entry))}</div>
          </div>
          <div class="mstat-card">
            <div class="mstat-label">Vibe</div>
            <div class="mstat-val" style="font-size:10px">${escHtml((entry.vibes || []).join(', ') || '—')}</div>
          </div>
        </div>
        <div style="font-size:9px;color:var(--txt3);letter-spacing:.06em;margin-bottom:10px">
          ${escHtml((entry.tropes || []).join(', ') || '—')}
        </div>
        <div class="mactions">
          <button class="mact" id="modal-edit">Edit</button>
          <button class="mact" id="modal-pause" title="${isPaused ? 'Back to reading' : 'Set aside for now — also works for completed series'}">${isPaused ? 'Resume' : 'Pause'}</button>
          ${entry.url ? `<button class="mact" id="modal-open">Open site</button>` : ''}
          <button class="mact danger" id="modal-delete">Delete</button>
        </div>
        ${entry.notes ? `<div class="mnotes">${escHtml(entry.notes)}</div>` : ''}
        ${(entry.sources && entry.sources.length > 1) ? `
        <div class="msources">
          <div class="msources-label">Sources</div>
          ${entry.sources.map(s => `
            <a class="msource-link" href="${escHtml(s.url)}" target="_blank" rel="noopener">
              ${s.primary ? `<span class="msource-primary">★</span>` : ''}
              <span class="msource-host">${escHtml(getHostname(s.url))}</span>
              <span class="msource-arrow">↗</span>
            </a>`).join('')}
        </div>` : ''}
      </div>`;

    let tempCh = entry.chapter || 0;
    $('ch-dec')?.addEventListener('click',  () => { if (tempCh > 0) { tempCh--; $('ch-disp').textContent = tempCh; } });
    $('ch-inc')?.addEventListener('click',  () => { tempCh++; $('ch-disp').textContent = tempCh; });
    $('ch-markread')?.addEventListener('click', async () => {
      entry.chapter  = tempCh;
      entry.lastRead = Date.now();
      await Storage.saveEntry(entry);
      state.entries = await Storage.getEntries();
      showToast(`Marked ${ch} ${tempCh}`);
      // ── Auto-push to cloud whenever signed in ──────────────────────────────
      if (state.syncUser) Sync.scheduleAutoPush();
      closeModal();
      renderCurrentPanel();
    });
    $('modal-pause')?.addEventListener('click', async () => {
      const previous = { ...entry };
      entry.mode = isPaused ? 'following' : 'paused';
      MTModel.stampModeChange(entry, previous);
      try {
        await Storage.saveEntry(entry);
        state.entries = await Storage.getEntries();
        showToast(isPaused ? 'Resumed' : 'Paused');
        if (state.syncUser) Sync.scheduleAutoPush();
      } catch (e) { entry.mode = previous.mode; showToast(e.message, 4000); }
      closeModal();
      renderCurrentPanel();
    });
    $('modal-close')?.addEventListener('click',  closeModal);
    $('modal-edit')?.addEventListener('click',   () => { closeModal(); loadEntryIntoForm(entry); switchNav('add'); });
    $('modal-open')?.addEventListener('click',   () => { if (entry.url) chrome.tabs.create({ url: entry.url }); });
    $('modal-delete')?.addEventListener('click', async () => {
      await Storage.deleteEntry(entry.id);
      state.entries = await Storage.getEntries();
      closeModal();
      showToast('Deleted');
      // ── Auto-push to cloud whenever signed in ──────────────────────────────
      if (state.syncUser) Sync.scheduleAutoPush();
      renderCurrentPanel();
    });
    $('detail-modal').classList.add('open');
  }

  function closeModal() { $('detail-modal').classList.remove('open'); }

  // ── Sites ──────────────────────────────────────────────────────────────────
  function renderSites() {
    const grid = $('sites-grid');
    if (!grid) return;
    const siteMap = {};
    state.entries.forEach(e => {
      if (!e.hostname) return;
      siteMap[e.hostname] = (siteMap[e.hostname] || { count: 0, type: e.type });
      siteMap[e.hostname].count++;
    });
    const palette = [
      { bg:'#7c6af720', fg:'var(--acc2)' },
      { bg:'#3ecf8e20', fg:'var(--green)' },
      { bg:'#f0a04b20', fg:'var(--amber)' },
      { bg:'#e06b6b20', fg:'var(--red)' },
    ];
    const entries = Object.entries(siteMap);
    grid.innerHTML = entries.map(([host, info], i) => {
      const c = palette[i % palette.length];
      return `<div class="sitecard" data-hostname="${host}">
        <div class="siteicon" style="background:${c.bg};color:${c.fg}">${host.slice(0,2).toUpperCase()}</div>
        <div class="sitename">${escHtml(host)}</div>
        <div class="sitemeta">${escHtml(info.type)}</div>
        <div class="sitecnt">${info.count} title${info.count !== 1 ? 's' : ''}</div>
      </div>`;
    }).join('') +
    `<div class="sitecard addsite" id="addsite-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
      Add site
    </div>`;
    $('addsite-btn')?.addEventListener('click', () => switchNav('add'));
  }

  // ── Sync / Firebase ────────────────────────────────────────────────────────
  function timeAgo(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // Keeps the header dot, the Settings dot and the detail line in step with
  // the real sync state. Failures used to be silent (console only).
  let lastSeenResult = null;
  function updateSyncUi(st) {
    const cls = !state.syncUser ? '' : st.state === 'ok' ? 'ok' : st.state === 'busy' ? 'busy' : st.state === 'err' ? 'err' : (st.lastSyncAt ? 'ok' : '');
    const hdr = $('hdr-sync');
    if (hdr) {
      hdr.className = 'sync-dot' + (cls ? ' ' + cls : '');
      hdr.title = !state.syncUser ? 'Sync: not signed in'
        : st.state === 'err' ? `Sync problem: ${st.message}`
        : st.state === 'busy' ? 'Syncing…'
        : `Synced ${timeAgo(st.lastSyncAt)}`;
    }
    const detail = $('sync-detail');
    if (detail) {
      detail.className = 'sync-detail' + (st.state === 'err' ? ' err' : '');
      detail.textContent = !state.syncUser ? ''
        : st.state === 'err' ? `Last sync failed: ${st.message}. It will retry automatically.`
        : `Last synced: ${timeAgo(st.lastSyncAt)}` +
          (st.result && st.result.parts ? ` · ${st.result.parts} part${st.result.parts === 1 ? '' : 's'}, ${st.result.uploaded} uploaded` +
            (st.result.strippedCovers ? ` · ${st.result.strippedCovers} very large cover(s) not synced — use Optimise covers` : '') : '');
    }
    // If the cloud brought in changes from another device, show them.
    if (st.state === 'ok' && st.result && st.result !== lastSeenResult) {
      lastSeenResult = st.result;
      if (st.result.remoteRead) {
        Storage.getEntries().then(es => {
          state.entries = es;
          updateCounts();
          if (['today', 'library', 'sites'].includes(state.nav)) renderCurrentPanel();
        });
      }
    }
  }

  function renderSyncStatus() {
    const dot    = $('sync-dot');
    const label  = $('sync-label');
    const actBtn = $('sync-action-btn');
    const form   = $('sync-form');
    const ctrls  = $('sync-controls');
    if (!dot) return;

    if (!Sync.configured()) {
      dot.className = 'sync-dot err';
      label.textContent = 'Firebase not configured — see README';
      if (actBtn) actBtn.style.display = 'none';
      return;
    }

    const st = Sync.getStatus();
    if (state.syncUser) {
      dot.className = 'sync-dot ' + (st.state === 'err' ? 'err' : st.state === 'busy' ? 'busy' : 'ok');
      label.textContent = `Signed in as ${state.syncUser}`;
      if (actBtn) { actBtn.textContent = 'Sign out'; actBtn.style.display = ''; }
      if (form)   form.style.display   = 'none';
      if (ctrls)  ctrls.style.display  = '';
    } else {
      dot.className = 'sync-dot';
      label.textContent = 'Not signed in';
      if (actBtn) { actBtn.textContent = 'Sign in'; actBtn.style.display = ''; }
      if (form)   form.style.display   = 'none';
      if (ctrls)  ctrls.style.display  = 'none';
    }
    updateSyncUi(st);
  }

  async function runManualSync(force) {
    const dot = $('sync-dot'), label = $('sync-label');
    if (dot) dot.className = 'sync-dot busy';
    if (label) label.textContent = force ? 'Full re-sync…' : 'Syncing…';
    try {
      const r = await Sync.syncNow({ force });
      if (r) {
        state.entries = await Storage.getEntries();
        updateCounts();
        showToast(r.uploaded ? `Synced · ${r.uploaded} part${r.uploaded === 1 ? '' : 's'} uploaded` : 'Already up to date');
        if (['today', 'library', 'sites'].includes(state.nav)) renderCurrentPanel();
      }
    } catch (e) { showToast('Sync failed: ' + e.message, 7000); }
    renderSyncStatus();
  }

  function wireSync() {
    const actBtn   = $('sync-action-btn');
    const signinBtn = $('sync-signin-btn');
    const cancelBtn = $('sync-cancel-btn');
    const form     = $('sync-form');
    if (!actBtn) return;

    actBtn.addEventListener('click', () => {
      if (state.syncUser) {
        Sync.logout();
        state.syncUser = null;
        renderSyncStatus();
      } else {
        if (form) form.style.display = '';
        if (actBtn) actBtn.style.display = 'none';
      }
    });

    cancelBtn?.addEventListener('click', () => {
      if (form) form.style.display = 'none';
      if (actBtn) actBtn.style.display = '';
    });

    signinBtn?.addEventListener('click', async () => {
      const email = $('sync-email')?.value.trim();
      if (!email) { showToast('Enter your email'); return; }
      const dot   = $('sync-dot');
      const label = $('sync-label');
      if (dot) dot.className = 'sync-dot busy';
      if (label) label.textContent = 'Signing in…';
      try {
        await Sync.login(email);
        state.syncUser = Sync.getEmail();
        showToast('Signed in');
        renderSyncStatus();
        runManualSync(false);          // first sync merges the cloud copy with this device
      } catch(e) {
        showToast('Sign in failed: ' + e.message, 5000);
        renderSyncStatus();
      }
    });

    $('sync-now-btn')?.addEventListener('click',  () => runManualSync(false));
    $('sync-full-btn')?.addEventListener('click', () => runManualSync(true));
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  function setupSettings() {
    const s = state.settings;
    if ($('s-cook'))    $('s-cook').value    = s.cookThreshold || 10;
    if ($('s-uptodate')) $('s-uptodate').checked = s.showUpToDate !== false;
    if ($('s-defmode')) $('s-defmode').value = s.defaultMode || 'following';

    $('s-cook')?.addEventListener('change', async () => {
      state.settings.cookThreshold = parseInt($('s-cook').value) || 10;
      await Storage.saveSettings(state.settings);
      if (state.syncUser) Sync.scheduleAutoPush();
    });
    $('s-uptodate')?.addEventListener('change', async () => {
      state.settings.showUpToDate = $('s-uptodate').checked;
      await Storage.saveSettings(state.settings);
      if (state.syncUser) Sync.scheduleAutoPush();
    });
    $('s-defmode')?.addEventListener('change', async () => {
      state.settings.defaultMode = $('s-defmode').value;
      await Storage.saveSettings(state.settings);
      if (state.syncUser) Sync.scheduleAutoPush();
    });
    $('optimise-btn')?.addEventListener('click', optimiseCovers);
    $('export-btn')?.addEventListener('click',  exportData);
    $('import-btn')?.addEventListener('click',  () => $('import-file')?.click());
    $('import-file')?.addEventListener('change', importData);
  }

  async function exportData() {
    const entries  = await Storage.getEntries();
    const sites    = await Storage.getSites();
    const blob = new Blob([JSON.stringify({ entries, sites, exportedAt: Date.now() }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `mangatracker-${Date.now()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Exported');
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.entries) {
        // One write for the whole file (the old loop rewrote the entire
        // library once per entry — painfully slow with a big import).
        const changed = await Storage.saveMany(data.entries);
        state.entries = await Storage.getEntries();
        showToast(`Imported ${data.entries.length} entries (${changed} new or newer)`);
        if (state.syncUser) Sync.scheduleAutoPush();
        renderCurrentPanel();
      }
    } catch (err) { showToast('Import failed — ' + (err && err.message ? err.message : 'invalid file'), 5000); }
    e.target.value = '';
  }

  // ── Library size & cover optimiser ────────────────────────────────────────
  const fmtBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  function updateLibSize() {
    const el = $('lib-size');
    if (!el) return;
    const covers = state.entries.reduce((n, e) => n + (e.imageData ? e.imageData.length : 0), 0);
    const total = state.entries.length;
    let text = `${total} ${total === 1 ? 'title' : 'titles'} · covers ${fmtBytes(covers)}`;
    const big = state.entries.filter(e => e.imageData && e.imageData.length > 40000).length;
    if (big) text += ` · ${big} large (optimise to speed things up)`;
    el.textContent = text;
  }

  async function optimiseCovers() {
    const btn = $('optimise-btn');
    const targets = state.entries.filter(e => e.imageData && e.imageData.length > 30000);
    if (!targets.length) { showToast('Covers are already small'); return; }
    if (btn) btn.disabled = true;
    let before = 0, after = 0;
    const updated = [];
    try {
      for (let i = 0; i < targets.length; i++) {
        const e = targets[i];
        if (i % 5 === 0) showToast(`Optimising covers… ${i}/${targets.length}`, 1500);
        const small = await shrinkImage(e.imageData);
        before += e.imageData.length;
        if (small.length < e.imageData.length) { after += small.length; updated.push({ ...e, imageData: small, updatedAt: Date.now() }); }
        else after += e.imageData.length;
      }
      if (updated.length) await Storage.saveMany(updated);
      state.entries = await Storage.getEntries();
      showToast(`Optimised ${updated.length} covers: ${fmtBytes(before)} → ${fmtBytes(after)}`, 5000);
      if (updated.length && state.syncUser) Sync.scheduleAutoPush();
    } catch (err) {
      showToast('Optimise failed: ' + err.message, 5000);
    } finally {
      if (btn) btn.disabled = false;
      updateLibSize();
      renderCurrentPanel();
    }
  }

  // ── Close sidebar ──────────────────────────────────────────────────────────
  function closeSidebar() {
    window.close();
  }

  // ── Wire all static events ─────────────────────────────────────────────────
  function wireStaticEvents() {
    // Nav buttons
    document.querySelectorAll('.nbtn').forEach(btn =>
      btn.addEventListener('click', () => switchNav(btn.dataset.nav))
    );
    // Subtabs
    document.querySelectorAll('.stab').forEach(btn =>
      btn.addEventListener('click', () => {
        const [nav, stab] = btn.dataset.stab.split('-');
        switchStab(nav, stab);
      })
    );
    // Header buttons
    $('closebtn')?.addEventListener('click', closeSidebar);
    $('settingsbtn')?.addEventListener('click', () => switchNav('settings'));
    // Save entry
    $('save-btn')?.addEventListener('click', saveEntry);
    // Pill toggles (static pills — custom ones get wired when created)
    document.querySelectorAll('[data-group="tropes"], [data-group="vibes"]').forEach(btn =>
      btn.addEventListener('click', () => btn.classList.toggle('on'))
    );
    document.querySelectorAll('#mode-pills .pill, #status-pills .pill').forEach(btn =>
      btn.addEventListener('click', () => {
        btn.closest('.pills').querySelectorAll('.pill').forEach(p => p.classList.remove('on'));
        btn.classList.add('on');
      })
    );
    document.querySelectorAll('#freq-chips .fchip').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('#freq-chips .fchip').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        const isIrregular = btn.dataset.freq === '0';
        if ($('day-chips')) $('day-chips').style.display = isIrregular ? 'none' : '';
        if (isIrregular) {
          // Clear any previously-picked days so they don't linger unseen in the data
          document.querySelectorAll('#day-chips .dchip.on').forEach(p => p.classList.remove('on'));
        }
      })
    );
    document.querySelectorAll('#day-chips .dchip').forEach(btn =>
      btn.addEventListener('click', () => btn.classList.toggle('on'))
    );
    // Weekly vs monthly schedule toggle
    document.querySelectorAll('#schedtype-pills .pill').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('#schedtype-pills .pill').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        const isMonthly = btn.dataset.schedtype === 'monthly';
        if ($('weekly-schedule'))  $('weekly-schedule').style.display  = isMonthly ? 'none' : '';
        if ($('monthly-schedule')) $('monthly-schedule').style.display = isMonthly ? '' : 'none';
      })
    );
    // Edit flags — prevent auto-detection from overwriting manual input
    $('f-title')?.addEventListener('input',   () => { $('f-title').dataset.edited   = '1'; });
    $('f-chapter')?.addEventListener('input', () => { $('f-chapter').dataset.edited = '1'; });
    // Library filters — typing is debounced so a big library isn't redrawn on every keystroke
    let searchTimer = null;
    $('lib-search')?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => { state.libSearch = v; state.libShown = PAGE_SIZE; renderLibrary(); }, 150);
    });
    $('lib-type-filter')?.addEventListener('change', e => {
      state.libTypeFilter = e.target.value; state.libShown = PAGE_SIZE; renderLibrary();
    });
    $('lib-status-filter')?.addEventListener('change', e => {
      state.libStatusFilter = e.target.value; state.libShown = PAGE_SIZE; renderLibrary();
    });
    // Choosing a type yourself stops auto-detection from changing it
    $('f-type')?.addEventListener('change', () => { $('f-type').dataset.edited = '1'; if ($('detect-type')) $('detect-type').textContent = ''; });
    // Monthly: same date vs irregular
    document.querySelectorAll('#monthly-chips .fchip').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('#monthly-chips .fchip').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        if ($('monthly-date')) $('monthly-date').style.display = btn.dataset.mfreq === '0' ? 'none' : '';
      })
    );
    // Modal backdrop close
    $('detail-modal')?.addEventListener('click', e => {
      if (e.target === $('detail-modal')) closeModal();
    });
    // Image upload
    wireImageUpload();
    // Sources
    $('sources-add-btn')?.addEventListener('click', () => {
      const list = $('sources-list');
      const hasAny = list.querySelectorAll('.source-row').length > 0;
      list.appendChild(buildSourceRow('', !hasAny));
      list.querySelector('.source-row:last-child input')?.focus();
    });
    // Alternate names
    $('altnames-add-btn')?.addEventListener('click', () => {
      const list = $('altnames-list');
      list.appendChild(buildAltNameRow(''));
      list.querySelector('.source-row:last-child input')?.focus();
    });
    // Sync
    wireSync();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  // Fill the type dropdowns from the shared list (so the extension and the web
  // app always offer the same types).
  function populateTypeSelects() {
    const form = $('f-type');
    if (form) form.innerHTML = MTModel.TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
    const filter = $('lib-type-filter');
    if (filter) filter.insertAdjacentHTML('beforeend', MTModel.TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join(''));
  }

  async function init() {
    populateTypeSelects();
    await loadAll();
    wireStaticEvents();
    setupSettings();
    Sync.onStatus(updateSyncUi);
    updateCounts();

    switchNav('add');                      // first paint happens now — nothing below blocks it

    // Cloud sync starts in the background. The old code waited for a network
    // sign-in *before* drawing anything, which is what made opening feel stuck.
    Sync.restoreSession().then(session => {
      if (!session) return;
      state.syncUser = session.email;
      renderSyncStatus();
      setTimeout(() => Sync.syncNow().catch(() => {}), 1200);   // picks up changes from your phone, and any unsynced edits
    }).catch(() => {});
  }

  init();
})();
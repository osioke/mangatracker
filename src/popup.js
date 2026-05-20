(() => {
  const DAYS      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const DEFAULT_GENRES = [
    'Isekai','Regression','Murim / Wuxia','System','Romance','Harem',
    'Reincarnation','Cultivation','Slice Of Life','Fantasy','Historical',
    'Shonen','Magic','Action','Adventure','Modern','Medieval'
  ];
  const DEFAULT_VIBES = [
    'Hype','Comfort Read','Binge-worthy','Slow Burn','Emotional','Tense','Guilty Pleasure'
  ];

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
    libSearch: '',
    libTypeFilter: '',
    libStatusFilter: '',
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
    if (entry.status === 'dropped')   return '<span class="sdot dot-drop"></span>';
    if (entry.mode   === 'cooking')   return '<span class="sdot dot-cook"></span>';
    if (entry.status === 'completed') return '<span class="sdot dot-done"></span>';
    return '<span class="sdot dot-on"></span>';
  }

  function artHtml(entry, w = 32) {
    const h = Math.round(w * 1.37);
    const style = `width:${w}px;height:${h}px`;
    const imgSrc = entry.imageData || entry.image || '';
    if (imgSrc) {
      return `<div class="art" style="${style}">
        <img src="${escHtml(imgSrc)}" alt="" onerror="this.parentElement.innerHTML='📖'">
      </div>`;
    }
    const icons = { manhwa:'📖', manga:'📚', manhua:'📕', anime:'🎬', webtoon:'🌐' };
    return `<div class="art" style="${style}">${icons[entry.type] || '📖'}</div>`;
  }

  function chLabel(entry) { return entry.type === 'anime' ? 'ep.' : 'ch.'; }

  function releaseSummary(entry) {
    if (!entry.releaseDays || !entry.releaseDays.length) return 'schedule unknown';
    const days = entry.releaseDays.map(d => DAYS[d]).join(', ');
    const freq  = (entry.releaseFreq || 1) > 1 ? `${entry.releaseFreq}×/wk · ` : '';
    return `${freq}${days}`;
  }

  function nextReleaseLabel(entry) {
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
    if (nav === 'today')    { paneId = `pane-today-${state.stab.today}`;       renderTodayPanel(); renderWeekPanel(); }
    if (nav === 'library')  { paneId = `pane-library-${state.stab.library}`;   renderLibraryAll(); renderLibrarySite(); }
    if (nav === 'add')      { paneId = 'pane-add';      setupAddPanel(); }
    if (nav === 'sites')    { paneId = 'pane-sites';    renderSites(); }
    if (nav === 'settings') { paneId = 'pane-settings'; renderSyncStatus(); }
    const pane = $(paneId);
    if (pane) pane.classList.add('active');
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
      const hasRel = state.entries.some(e =>
        e.releaseDays && e.releaseDays.includes(dayIdx) && e.status !== 'dropped'
      );
      const btn = document.createElement('button');
      btn.className = 'daypill' + (i < 0 ? ' past' : '') + (hasRel ? ' hasrel' : '');
      btn.textContent = `${DAYS[dayIdx]} ${d.getDate()}`;
      if (i === 0) { btn.classList.add('active'); state.selectedDay = dayIdx; }
      btn.addEventListener('click', () => {
        strip.querySelectorAll('.daypill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.selectedDay = dayIdx;
        renderTodayContent();
      });
      strip.appendChild(btn);
    }
  }

  function renderTodayContent() {
    const c = $('today-content');
    if (!c) return;
    const { settings, entries, selectedDay } = state;
    const todayReleases = entries.filter(e =>
      e.releaseDays && e.releaseDays.includes(selectedDay) && e.status !== 'dropped'
    );
    const cookReady = entries.filter(e =>
      e.mode === 'cooking' && e.status !== 'dropped' &&
      ((e.latestChapter || 0) - (e.chapter || 0)) >= (settings.cookThreshold || 10)
    );
    const upToDate = settings.showUpToDate !== false
      ? entries.filter(e => {
          if (e.status === 'dropped' || e.mode === 'cooking') return false;
          return !(e.releaseDays && e.releaseDays.includes(selectedDay));
        })
      : [];

    let html = '';
    if (!todayReleases.length && !cookReady.length && !upToDate.length) {
      html = `<div class="empty"><div class="empty-icon">📅</div><div class="empty-msg">Nothing for this day</div></div>`;
    }
    if (todayReleases.length) {
      html += `<div class="slabel">New releases</div>`;
      html += todayReleases.map(e => entryRow(e, `<span class="tag tag-new">new</span>`)).join('');
    }
    if (cookReady.length) {
      html += `<div class="slabel sgap">Ready to read — cooking done</div>`;
      html += cookReady.map(e => {
        const n = (e.latestChapter || 0) - (e.chapter || 0);
        return entryRow(e, n > 0 ? `<span class="tag tag-cook">×${n}</span>` : '');
      }).join('');
    }
    if (upToDate.length) {
      html += `<div class="slabel sgap">Up to date</div>`;
      html += upToDate.map(e =>
        entryRow(e, `<span class="tag tag-soon">${nextReleaseLabel(e)}</span>`)
      ).join('');
    }
    c.innerHTML = html;
    attachEntryClicks(c);
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
  function entryRow(entry, tagHtml = '') {
    const meta = [entry.type, ...(entry.tropes || []).slice(0,2)].filter(Boolean).join(' · ');
    return `<div class="entry" data-id="${entry.id}">
      ${artHtml(entry, 32)}
      <div class="ebody">
        <div class="etitle">${escHtml(entry.title)}</div>
        <div class="emeta">${statusDot(entry)}${escHtml(meta)}</div>
      </div>
      <div class="eright">
        <div class="echnum">${chLabel(entry)} ${entry.chapter || 0}</div>
        ${tagHtml}
      </div>
    </div>`;
  }

  function attachEntryClicks(container) {
    container.querySelectorAll('.entry').forEach(row =>
      row.addEventListener('click', () => openDetail(row.dataset.id))
    );
  }

  // ── Library ────────────────────────────────────────────────────────────────
  function filteredEntries() {
    return state.entries.filter(e => {
      if (state.libSearch) {
        const q = state.libSearch.toLowerCase();
        const hit = e.title.toLowerCase().includes(q)
          || (e.tropes || []).some(t => t.toLowerCase().includes(q))
          || (e.hostname || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (state.libTypeFilter && e.type !== state.libTypeFilter) return false;
      if (state.libStatusFilter) {
        if (state.libStatusFilter === 'ongoing'   && e.mode !== 'following')    return false;
        if (state.libStatusFilter === 'cooking'   && e.mode !== 'cooking')      return false;
        if (state.libStatusFilter === 'completed' && e.status !== 'completed')  return false;
        if (state.libStatusFilter === 'dropped'   && e.status !== 'dropped')    return false;
      }
      return true;
    });
  }

  function renderLibraryAll() {
    const c = $('lib-all-content');
    if (!c) return;
    const entries = filteredEntries();
    if (!entries.length) {
      c.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>
        <div class="empty-msg">${state.entries.length ? 'No matches.' : 'No entries yet.'}</div></div>`;
      return;
    }
    c.innerHTML = entries.map(e =>
      `<div class="entry" data-id="${e.id}">
        ${artHtml(e, 32)}
        <div class="ebody">
          <div class="etitle">${escHtml(e.title)}</div>
          <div class="emeta">${statusDot(e)}${escHtml(e.mode)} · ${escHtml(releaseSummary(e))}</div>
        </div>
        <div class="eright">
          <div class="echnum">${chLabel(e)} ${e.chapter || 0}</div>
          <div style="font-size:9px;color:var(--txt3);margin-top:2px">${escHtml(e.hostname || '')}</div>
        </div>
      </div>`
    ).join('');
    attachEntryClicks(c);
  }

  function renderLibrarySite() {
    const c = $('lib-site-content');
    if (!c) return;
    const groups = {};
    filteredEntries().forEach(e => {
      const k = e.hostname || 'unknown';
      (groups[k] = groups[k] || []).push(e);
    });
    if (!Object.keys(groups).length) {
      c.innerHTML = `<div class="empty"><div class="empty-icon">🌐</div><div class="empty-msg">No entries yet.</div></div>`;
      return;
    }
    c.innerHTML = Object.entries(groups).map(([site, es]) =>
      `<div class="grouphead"><span>${escHtml(site)}</span><span class="gcnt">${es.length}</span></div>` +
      es.map(e => `<div class="entry" data-id="${e.id}">
        ${artHtml(e, 32)}
        <div class="ebody">
          <div class="etitle">${escHtml(e.title)}</div>
          <div class="emeta">${statusDot(e)}${escHtml(e.mode)} · ${chLabel(e)} ${e.chapter || 0}</div>
        </div>
      </div>`).join('')
    ).join('');
    attachEntryClicks(c);
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

  function setupAddPanel() {
    // Render custom tags that have been saved previously
    const tropePills = $('trope-pills');
    const vibePills  = $('vibe-pills');
    if (tropePills) buildTagPills(tropePills, state.customGenres, 'tropes');
    if (vibePills)  buildTagPills(vibePills,  state.customVibes,  'vibes');

    // Wire custom input buttons (idempotent via flag)
    if (!$('trope-custom-btn').dataset.wired) {
      setupCustomTagInput('trope-custom-input','trope-custom-btn','trope-pills','tropes');
      setupCustomTagInput('vibe-custom-input','vibe-custom-btn','vibe-pills','vibes');
      $('trope-custom-btn').dataset.wired = '1';
      $('vibe-custom-btn').dataset.wired  = '1';
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

    // Auto-add detected page URL as first source if sources list is empty
    const list = $('sources-list');
    if (list && !list.querySelector('.source-row') && info.url) {
      list.appendChild(buildSourceRow(info.url, true));
    }

    // Auto-set cover art preview from og:image if no upload yet
    if (!state.uploadedImageData && info.image) {
      setPreviewImage(info.image);
    }

    // Auto-tick detected genres
    if (info.genres && info.genres.length) {
      const pills = $('trope-pills');
      if (pills) {
        info.genres.forEach(g => {
          let match = [...pills.querySelectorAll('.pill')].find(p =>
            p.textContent.trim().toLowerCase() === g.toLowerCase()
          );
          if (!match) {
            // Add as a new pill and auto-select
            const btn = document.createElement('button');
            btn.className = 'pill small on';
            btn.dataset.group = 'tropes';
            btn.textContent = g;
            btn.addEventListener('click', () => btn.classList.toggle('on'));
            pills.appendChild(btn);
          } else {
            match.classList.add('on');
          }
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
      reader.onload = e => {
        state.uploadedImageData = e.target.result;
        setPreviewImage(e.target.result);
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
              const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
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
            const scale  = Math.min(1, 400 / img.naturalWidth);
            canvas.width  = Math.round(img.naturalWidth  * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            state.uploadedImageData = dataUrl;
            setPreviewImage(dataUrl);
            srcPick?.classList.add('on');
            srcAuto?.classList.remove('on');
            srcUpload?.classList.remove('on');
            showToast('Cover art picked ✓');
          } catch {
            // CORS-tainted canvas — store URL directly as fallback
            state.uploadedImageData = null;
            setPreviewImage(msg.src);
            showToast('Picked (URL only — cross-origin image)');
          }
        };
        img.onerror = () => showToast('Could not load that image');
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
    const status = statusRaw === 'hiatus' ? 'hiatus'
      : statusRaw === 'dropped'  ? 'dropped'
      : statusRaw === 'completed'? 'completed' : 'ongoing';
    const releaseDays = [...document.querySelectorAll('#day-chips .dchip.on')].map(b => parseInt(b.dataset.day));
    const freq = parseInt(document.querySelector('#freq-chips .fchip.on')?.dataset.freq || '1');
    const sources = getSourcesFromForm();
    const primarySource = sources.find(s => s.primary) || sources[0];
    return {
      title: $('f-title')?.value.trim() || '',
      type:  $('f-type')?.value || 'manhwa',
      chapter: parseInt($('f-chapter')?.value || '0'),
      tropes, vibes, mode, status, releaseDays, releaseFreq: freq,
      notes: $('f-notes')?.value.trim() || '',
      sources,
      url: primarySource?.url || state.pageInfo?.url || '',
      hostname: primarySource ? getHostname(primarySource.url) : (state.pageInfo?.hostname || ''),
      image: (!state.uploadedImageData && state.pageInfo?.image) ? state.pageInfo.image : '',
      imageData: state.uploadedImageData || '',
    };
  }

  async function saveEntry() {
    const data = getFormData();
    if (!data.title) { showToast('Enter a title first'); return; }
    const existing = state.editId ? state.entries.find(e => e.id === state.editId) : {};
    const entry = {
      ...(existing || {}),
      id: state.editId || Storage.generateId(),
      ...data,
      savedAt: Date.now(),
      lastRead: existing?.lastRead || Date.now(),
    };
    await Storage.saveEntry(entry);
    if (entry.hostname) await Storage.saveSite({ hostname: entry.hostname, addedAt: Date.now() });
    state.entries = await Storage.getEntries();
    state.sites   = await Storage.getSites();
    showToast(state.editId ? 'Updated' : 'Saved to library');
    // ── Auto-push to cloud whenever signed in ────────────────────────────────
    if (state.syncUser) Sync.scheduleAutoPush();
    state.editId = null;
    resetAddForm();
    switchNav('library');
  }

  function resetAddForm() {
    if ($('f-title'))   { $('f-title').value = '';  delete $('f-title').dataset.edited; }
    if ($('f-chapter')) $('f-chapter').value = '0';
    if ($('f-notes'))   $('f-notes').value   = '';
    document.querySelectorAll('#trope-pills .pill.on, #vibe-pills .pill.on').forEach(p => p.classList.remove('on'));
    document.querySelectorAll('#day-chips .dchip.on').forEach(p => p.classList.remove('on'));
    document.querySelector('#mode-pills .pill')?.classList.add('on');
    document.querySelector('#status-pills .pill')?.classList.add('on');
    document.querySelector('#freq-chips .fchip')?.classList.add('on');
    clearPreviewImage();
    state.pageInfo = null;
    state.uploadedImageData = null;
    state.editId = null;
    if ($('detect-url'))  $('detect-url').textContent  = 'Detecting page…';
    if ($('detect-name')) $('detect-name').textContent = '—';
    if ($('detect-site')) $('detect-site').textContent = '—';
    if ($('save-btn'))    $('save-btn').textContent    = 'Save to library';
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

    const imgSrc = entry.imageData || entry.image || '';
    if (imgSrc) setPreviewImage(imgSrc);

    // Make sure custom genre pills are rendered before ticking
    const tropePills = $('trope-pills');
    const vibePills  = $('vibe-pills');
    if (tropePills) buildTagPills(tropePills, state.customGenres, 'tropes');
    if (vibePills)  buildTagPills(vibePills,  state.customVibes,  'vibes');

    document.querySelectorAll('#trope-pills .pill').forEach(p =>
      p.classList.toggle('on', (entry.tropes || []).map(t=>t.toLowerCase()).includes(p.textContent.trim().toLowerCase()))
    );
    document.querySelectorAll('#vibe-pills .pill').forEach(p =>
      p.classList.toggle('on', (entry.vibes || []).map(v=>v.toLowerCase()).includes(p.textContent.trim().toLowerCase()))
    );
    document.querySelectorAll('#mode-pills .pill').forEach(p =>
      p.classList.toggle('on', p.textContent.trim().toLowerCase() === (entry.mode || 'following'))
    );
    document.querySelectorAll('#status-pills .pill').forEach(p =>
      p.classList.toggle('on', p.textContent.trim().toLowerCase() === (entry.status || 'ongoing'))
    );
    document.querySelectorAll('#day-chips .dchip').forEach(b =>
      b.classList.toggle('on', (entry.releaseDays || []).includes(parseInt(b.dataset.day)))
    );
    const freq = entry.releaseFreq || 1;
    document.querySelectorAll('#freq-chips .fchip').forEach(b =>
      b.classList.toggle('on', parseInt(b.dataset.freq) === freq)
    );
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
      : `<div class="modal-art">📖</div>`;

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
            <div class="mstat-val">${entry.mode === 'cooking' ? 'cooking' : escHtml(entry.status)}</div>
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

    if (state.syncUser) {
      dot.className = 'sync-dot ok';
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
  }

  function wireSync() {
    const actBtn   = $('sync-action-btn');
    const signinBtn = $('sync-signin-btn');
    const cancelBtn = $('sync-cancel-btn');
    const form     = $('sync-form');
    const ctrls    = $('sync-controls');
    const pushBtn  = $('sync-push-btn');
    const pullBtn  = $('sync-pull-btn');
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
      const username   = $('sync-username')?.value.trim();
      const phrasekey  = $('sync-phrasekey')?.value.trim();
      if (!username || !phrasekey) { showToast('Enter username and phrase-key'); return; }
      const dot   = $('sync-dot');
      const label = $('sync-label');
      if (dot) dot.className = 'sync-dot busy';
      if (label) label.textContent = 'Signing in…';
      try {
        await Sync.login(username, phrasekey);
        state.syncUser = username;
        showToast('Signed in');
        renderSyncStatus();
      } catch(e) {
        showToast('Sign in failed: ' + e.message);
        renderSyncStatus();
      }
    });

    pushBtn?.addEventListener('click', async () => {
      const dot = $('sync-dot');
      const label = $('sync-label');
      if (dot) dot.className = 'sync-dot busy';
      if (label) label.textContent = 'Pushing…';
      try {
        await Sync.push(state.entries, state.settings);
        showToast('Library pushed to cloud');
      } catch(e) { showToast('Push failed: ' + e.message); }
      renderSyncStatus();
    });

    pullBtn?.addEventListener('click', async () => {
      const dot = $('sync-dot');
      const label = $('sync-label');
      if (dot) dot.className = 'sync-dot busy';
      if (label) label.textContent = 'Pulling…';
      try {
        const remote = await Sync.pull();
        if (remote && remote.entries) {
          for (const e of remote.entries) await Storage.saveEntry(e);
          state.entries = await Storage.getEntries();
          showToast(`Pulled ${remote.entries.length} entries`);
          renderCurrentPanel();
        } else {
          showToast('Nothing found in cloud');
        }
      } catch(e) { showToast('Pull failed: ' + e.message); }
      renderSyncStatus();
    });
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
        for (const entry of data.entries) await Storage.saveEntry(entry);
        state.entries = await Storage.getEntries();
        showToast(`Imported ${data.entries.length} entries`);
        renderCurrentPanel();
      }
    } catch { showToast('Import failed — invalid file'); }
    e.target.value = '';
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
      })
    );
    document.querySelectorAll('#day-chips .dchip').forEach(btn =>
      btn.addEventListener('click', () => btn.classList.toggle('on'))
    );
    // Title edit flag
    $('f-title')?.addEventListener('input', () => { $('f-title').dataset.edited = '1'; });
    // Library filters
    $('lib-search')?.addEventListener('input', e => {
      state.libSearch = e.target.value;
      renderLibraryAll(); renderLibrarySite();
    });
    $('lib-type-filter')?.addEventListener('change', e => {
      state.libTypeFilter = e.target.value;
      renderLibraryAll(); renderLibrarySite();
    });
    $('lib-status-filter')?.addEventListener('change', e => {
      state.libStatusFilter = e.target.value;
      renderLibraryAll(); renderLibrarySite();
    });
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
    // Sync
    wireSync();
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    await loadAll();
    wireStaticEvents();
    setupSettings();
    // Try to restore sync session silently
    try {
      const session = await Sync.restoreSession();
      if (session) state.syncUser = session.username;
    } catch(_) {}

    switchNav('add');
  }

  init();
})();

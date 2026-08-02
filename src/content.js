(() => {
  const KNOWN_GENRES = [
    'isekai','regression','murim','wuxia','system','romance','harem',
    'reincarnation','cultivation','slice of life','fantasy','historical',
    'shonen','magic','action','adventure','modern','medieval',
    'martial arts','supernatural','horror','comedy','drama','sci-fi',
    'mecha','sports','psychological','thriller','mystery'
  ];

  function cleanTitle(raw, hostname) {
    // Strip after | always — it's almost never part of a real title
    raw = raw.replace(/\s*\|.+$/, '');
    // Strip after ' - ' (space-hyphen-space) only when the trailing segment
    // looks like a site name: matches hostname, or is ≤30 chars with no spaces
    raw = raw.replace(/\s+-\s+(.+)$/, (full, after) => {
      const host = hostname.replace(/^www\./, '').toLowerCase();
      const seg  = after.trim();
      const looksLikeSiteName = host.includes(seg.toLowerCase()) ||
                                seg.toLowerCase().includes(host.split('.')[0]) ||
                                (seg.length <= 30 && !/\s/.test(seg));
      return looksLikeSiteName ? '' : full;
    });
    // Strip stray trailing non-word punctuation (·, », —, etc.)
    raw = raw.replace(/[\s·»—–|]+$/, '');
    return raw.trim();
  }

  function getPageInfo() {
    const ogTitle    = document.querySelector('meta[property="og:title"]');
    const ogImage    = document.querySelector('meta[property="og:image"]');
    const twitterImg = document.querySelector('meta[name="twitter:image"]');

    let title = ogTitle?.content || document.title || '';
    title = cleanTitle(title, location.hostname);

    const image = ogImage?.content || twitterImg?.content || '';
    const hostname = location.hostname.replace(/^www\./, '');
    const genres = detectGenres();

    return { title, image, url: location.href, hostname, genres, chapter: detectChapter() };
  }

  function detectChapter() {
    // Match patterns like /chapter/212, /chapter-71, /ch-14, /ch/14, /episode/5
    const path = location.pathname.toLowerCase();
    const m = path.match(/(?:chapter|chap|ch|episode|ep)[-\/](\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function detectGenres() {
    const found = new Set();
    const haystack = gatherText().toLowerCase();

    KNOWN_GENRES.forEach(g => {
      if (haystack.includes(g)) found.add(normaliseGenre(g));
    });

    const tagSelectors = [
      '.genres a', '.genre a', '.tags a', '.tag', '.categories a',
      '[class*="genre"]', '[class*="tag"]', '[class*="category"]',
      '.info-item a', '.manga-info a', '.series-info a',
      '[itemprop="genre"]', '[data-genre]'
    ];

    tagSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const txt = el.textContent.trim().toLowerCase();
          KNOWN_GENRES.forEach(g => {
            if (txt.includes(g)) found.add(normaliseGenre(g));
          });
        });
      } catch (_) {}
    });

    return [...found].slice(0, 8);
  }

  function gatherText() {
    const parts = [];
    const metaDesc = document.querySelector('meta[property="og:description"]')?.content
      || document.querySelector('meta[name="description"]')?.content || '';
    parts.push(metaDesc);
    parts.push(document.title);
    parts.push(document.body?.innerText?.slice(0, 2000) || '');
    return parts.join(' ');
  }

  function normaliseGenre(g) {
    return g.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // ── Image picker ────────────────────────────────────────────────────────────
  // Activated by the popup (now running as a detached window) via START_IMAGE_PICK.
  // Uses a floating highlight div that follows the cursor over images —
  // this avoids modifying img styles directly, which was triggering site hover
  // animations (expand effects, etc.) on many reading sites.

  let _pickerActive = false;
  let _banner       = null;
  let _highlight    = null;
  let _lastImg      = null;
  let _pickResolve  = null; // stored so ESC can send a cancellation via runtime message

  function startImagePicker() {
    if (_pickerActive) return;
    _pickerActive = true;

    // ── Banner ─────────────────────────────────────────────────────────────
    _banner = document.createElement('div');
    _banner.id = '__mt_pick_banner';
    Object.assign(_banner.style, {
      position:   'fixed',
      top:        '12px',
      left:       '50%',
      transform:  'translateX(-50%)',
      zIndex:     '2147483647',
      background: '#1a1e25',
      color:      '#9d8fff',
      fontFamily: 'monospace',
      fontSize:   '12px',
      letterSpacing: '.08em',
      padding:    '8px 18px',
      borderRadius: '6px',
      border:     '1px solid #7c6af740',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });
    _banner.textContent = 'MangaTracker: click any image to use as cover art  ·  Esc to cancel';
    document.body.appendChild(_banner);

    // ── Highlight box (follows cursor, never touches img styles) ───────────
    _highlight = document.createElement('div');
    _highlight.id = '__mt_pick_highlight';
    Object.assign(_highlight.style, {
      position:      'fixed',
      zIndex:        '2147483646',
      outline:       '3px solid #7c6af7',
      outlineOffset: '1px',
      borderRadius:  '3px',
      pointerEvents: 'none',
      display:       'none',
      boxSizing:     'border-box',
    });
    document.body.appendChild(_highlight);

    document.addEventListener('keydown',   onKeyDown,   true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click',     onClick,     true);
  }

  function stopImagePicker(cancelled) {
    if (!_pickerActive) return;
    _pickerActive = false;
    _banner?.remove();    _banner    = null;
    _highlight?.remove(); _highlight = null;
    _lastImg = null;
    document.removeEventListener('keydown',   onKeyDown,   true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click',     onClick,     true);
    // Notify the detached popup window that picking ended
    chrome.runtime.sendMessage({ type: 'IMAGE_PICK_RESULT', cancelled: cancelled || false, src: '' });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { stopImagePicker(true); }
  }

  function onMouseMove(e) {
    const img = e.target.closest('img');
    if (img !== _lastImg) {
      _lastImg = img;
      if (img) {
        const r = img.getBoundingClientRect();
        Object.assign(_highlight.style, {
          display: 'block',
          left:    r.left   + 'px',
          top:     r.top    + 'px',
          width:   r.width  + 'px',
          height:  r.height + 'px',
        });
        document.body.style.cursor = 'crosshair';
      } else {
        _highlight.style.display = 'none';
        document.body.style.cursor = '';
      }
    }
  }

  function onClick(e) {
    const img = e.target.closest('img');
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    stopImagePicker(false);
    chrome.runtime.sendMessage({ type: 'IMAGE_PICK_RESULT', cancelled: false, src });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_INFO') {
      // getPageInfo() touches a lot of page DOM (genre detectors, meta tags,
      // regexes on the title) — if any of that throws on an unusual page,
      // sendResponse() would never fire even though we still return true
      // below, which is exactly what produces the "message channel closed
      // before a response was received" console error. Guard it so the
      // popup always gets *something* back.
      try {
        sendResponse(getPageInfo());
      } catch (e) {
        console.error('[MangaTracker] getPageInfo failed:', e);
        sendResponse({
          title: document.title || '',
          image: '',
          url: location.href,
          hostname: location.hostname.replace(/^www\./, ''),
          genres: [],
          chapter: null,
        });
      }
      return true;
    }
    if (msg.type === 'START_IMAGE_PICK') {
      startImagePicker();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'CANCEL_IMAGE_PICK') {
      stopImagePicker(true);
      sendResponse({ ok: true });
      return true;
    }
    // Unrecognised message type — nothing will call sendResponse, so don't
    // promise an async response. Returning true unconditionally here (as the
    // old code did) is what caused "message channel closed" errors for any
    // message this listener wasn't actually handling.
    return false;
  });
})();

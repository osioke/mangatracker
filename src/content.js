(() => {
  const KNOWN_GENRES = [
    'isekai','regression','murim','wuxia','system','romance','harem',
    'reincarnation','cultivation','slice of life','fantasy','historical',
    'shonen','magic','action','adventure','modern','medieval',
    'martial arts','supernatural','horror','comedy','drama','sci-fi',
    'mecha','sports','psychological','thriller','mystery'
  ];

  function getPageInfo() {
    const ogTitle    = document.querySelector('meta[property="og:title"]');
    const ogImage    = document.querySelector('meta[property="og:image"]');
    const twitterImg = document.querySelector('meta[name="twitter:image"]');

    let title = ogTitle?.content || document.title || '';
    title = title.replace(/\s*[-|]\s*.+$/, '').trim();

    const image = ogImage?.content || twitterImg?.content || '';
    const hostname = location.hostname.replace(/^www\./, '');
    const genres = detectGenres();

    return { title, image, url: location.href, hostname, genres };
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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_INFO') {
      sendResponse(getPageInfo());
    }

    // ── Image picker ──────────────────────────────────────────────────────────
    // When the popup sends START_IMAGE_PICK, we enter a mode where hovering
    // highlights images and clicking one sends its src back to the popup.
    if (msg.type === 'START_IMAGE_PICK') {
      startImagePicker(sendResponse);
      return true; // keep channel open for async response
    }
    if (msg.type === 'CANCEL_IMAGE_PICK') {
      stopImagePicker();
      sendResponse({ ok: true });
    }
    return true;
  });

  let _pickerActive = false;
  let _overlay      = null;

  function startImagePicker(sendResponse) {
    if (_pickerActive) return;
    _pickerActive = true;

    // Dim the page and show a hint banner
    _overlay = document.createElement('div');
    _overlay.id = '__mt_pick_overlay';
    Object.assign(_overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483646',
      background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    });
    const banner = document.createElement('div');
    Object.assign(banner.style, {
      marginTop: '16px', background: '#1a1e25', color: '#9d8fff',
      fontFamily: 'monospace', fontSize: '12px', letterSpacing: '.08em',
      padding: '8px 16px', borderRadius: '6px', border: '1px solid #7c6af740',
      pointerEvents: 'none',
    });
    banner.textContent = 'MangaTracker: click any image to use as cover art  ·  Esc to cancel';
    _overlay.appendChild(banner);
    document.body.appendChild(_overlay);

    const onKeyDown = e => {
      if (e.key === 'Escape') { cleanup(); sendResponse({ cancelled: true }); }
    };

    const onMouseOver = e => {
      if (e.target.tagName !== 'IMG') return;
      e.target.style.outline = '3px solid #7c6af7';
      e.target.style.outlineOffset = '2px';
      e.target.style.cursor = 'crosshair';
    };

    const onMouseOut = e => {
      if (e.target.tagName !== 'IMG') return;
      e.target.style.outline = '';
      e.target.style.outlineOffset = '';
      e.target.style.cursor = '';
    };

    const onClick = e => {
      if (e.target.tagName !== 'IMG') return;
      e.preventDefault();
      e.stopPropagation();
      const src = e.target.src || e.target.currentSrc || '';
      cleanup();
      sendResponse({ src });
    };

    function cleanup() {
      _pickerActive = false;
      _overlay?.remove(); _overlay = null;
      document.removeEventListener('keydown',   onKeyDown,   true);
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout',  onMouseOut,  true);
      document.removeEventListener('click',     onClick,     true);
      // Remove any leftover outlines
      document.querySelectorAll('img').forEach(img => {
        img.style.outline = '';
        img.style.outlineOffset = '';
        img.style.cursor = '';
      });
    }

    document.addEventListener('keydown',   onKeyDown,   true);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout',  onMouseOut,  true);
    document.addEventListener('click',     onClick,     true);
  }

  function stopImagePicker() {
    // Sends a synthetic ESC to trigger cleanup if picker is active
    if (_pickerActive) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
  }
})();
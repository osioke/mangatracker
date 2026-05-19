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
    return true;
  });
})();

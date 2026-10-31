// NOTE: this file is used by the extension only (the web app doesn't scan pages).
/**
 * MangaTracker — content type detection (manga / manhwa / manhua / webtoon /
 * anime / donghua / novel) from what is visible on a page.
 *
 * Pure function: takes a plain "snapshot" object built by content.js and
 * returns { type, confidence, scores, signals }. Keeping it free of DOM calls
 * means it can be unit-tested without a browser.
 *
 * It is a scoring heuristic, not a certainty: several weak clues add up, and
 * a strong clue (an explicit "Type: Manhwa" label on the page) outweighs
 * many weak ones. When the evidence is thin it returns type = null rather
 * than guessing, so it never overwrites a choice with a coin-flip.
 *
 * snapshot = {
 *   url, hostname, title,
 *   ogType,                 // <meta property="og:type">
 *   jsonLdTypes: [],        // @type values from JSON-LD blocks
 *   labelPairs: [[k, v]],   // "Type: Manhwa", "Country: Korea" style fields
 *   anchorHrefs: [],        // hrefs of tag/genre/breadcrumb links
 *   bodyText,               // first few thousand characters of visible text
 *   hasVideo,               // <video> or a player iframe is present
 *   tallImages, pageImages  // counts of very tall images / page-shaped images
 * }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTDetect = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  const IDS = ['manhwa', 'manga', 'manhua', 'webtoon', 'anime', 'donghua', 'novel'];

  // Words that name each type (singular/plural, common spellings).
  const WORDS = {
    manhwa:  /\bmanhwas?\b/,
    manga:   /\bmangas?\b/,
    manhua:  /\bmanhuas?\b/,
    webtoon: /\bwebtoons?\b/,
    anime:   /\banimes?\b/,
    donghua: /\bdonghuas?\b/,
    novel:   /\b(?:light[\s-]?novels?|web[\s-]?novels?|novels?)\b/,
  };

  // Hostname fragments → type. Deliberately short and generic: site lists go
  // stale quickly, so the page's own content carries most of the weight.
  const HOST_HINTS = [
    [/webtoons?\./, 'webtoon', 6],
    [/manhwa/,      'manhwa',  4],
    [/manhua/,      'manhua',  4],
    [/donghua/,     'donghua', 4],
    [/novel/,       'novel',   4],
    [/anime|crunchyroll|funimation|aniwatch|animepahe|gogoanime|zoro/, 'anime', 4],
    [/manga/,       'manga',   3],
  ];

  function pathTokens(url) {
    try { return new URL(url).pathname.toLowerCase().split(/[\/\-_]+/).filter(Boolean); }
    catch { return []; }
  }

  function detectType(snap) {
    snap = snap || {};
    const scores = Object.fromEntries(IDS.map(i => [i, 0]));
    let comicish = 0;                 // "some kind of comic" — no specific type
    let video = 0;                    // "this is video content" — anime vs donghua decided later
    const signals = [];
    const add = (type, pts, why) => { scores[type] += pts; signals.push(`${type} +${pts}: ${why}`); };

    const host  = String(snap.hostname || '').toLowerCase();
    const title = String(snap.title || '').toLowerCase();
    const tokens = pathTokens(snap.url || '');

    // 1. Explicit "Type: X" / "Format: X" labels — the strongest clue.
    (snap.labelPairs || []).forEach(([k, v]) => {
      const key = String(k || '').toLowerCase().trim();
      const val = String(v || '').toLowerCase().trim();
      if (/^(type|format|category|media|kind)$/.test(key)) {
        IDS.forEach(id => { if (WORDS[id].test(val)) add(id, 6, `label "${key}: ${val}"`); });
      }
    });

    // 2. Structured data the site publishes about itself.
    const ld = (snap.jsonLdTypes || []).map(t => String(t).toLowerCase());
    if (ld.some(t => /tvseries|tvepisode|tvseason|videoobject|movie/.test(t))) { video += 3; signals.push('video +3: JSON-LD says video content'); }
    if (ld.some(t => /comicseries|comicissue|comicstory/.test(t)))            { comicish += 2; signals.push('comic: JSON-LD says comic'); }
    if (ld.some(t => /^book$|booksseries|bookseries/.test(t)))                add('novel', 1, 'JSON-LD says book');
    const og = String(snap.ogType || '').toLowerCase();
    if (/^video\./.test(og)) { video += 3; signals.push(`video +3: og:type ${og}`); }
    else if (og === 'book')  add('novel', 1, 'og:type book');

    // 3. Page address and title.
    const hasToken = (...w) => w.some(x => tokens.includes(x));
    if (hasToken('manhwa', 'manhwas'))  add('manhwa', 4, 'URL path');
    if (hasToken('manhua', 'manhuas'))  add('manhua', 4, 'URL path');
    if (hasToken('manga', 'mangas'))    add('manga', 4, 'URL path');
    if (hasToken('webtoon', 'webtoons')) add('webtoon', 4, 'URL path');
    if (hasToken('anime', 'animes'))    add('anime', 4, 'URL path');
    if (hasToken('donghua'))            add('donghua', 4, 'URL path');
    if (hasToken('novel', 'novels', 'ln')) add('novel', 4, 'URL path');
    HOST_HINTS.forEach(([re, type, pts]) => { if (re.test(host)) add(type, pts, `host ${host}`); });
    IDS.forEach(id => { if (WORDS[id].test(title)) add(id, 3, 'in page title'); });

    // 4. Tag / genre / breadcrumb links such as /type/manhwa or ?genre=manhua.
    const hrefHits = Object.fromEntries(IDS.map(i => [i, 0]));
    (snap.anchorHrefs || []).forEach(h => {
      const s = String(h || '').toLowerCase();
      IDS.forEach(id => { if (WORDS[id].test(s.replace(/[\/=?&_-]+/g, ' '))) hrefHits[id]++; });
    });
    IDS.forEach(id => { if (hrefHits[id]) add(id, Math.min(hrefHits[id], 2) * 2, 'tag/breadcrumb links'); });

    // 5. Playing video vs reading images.
    if (snap.hasVideo) { video += 3; signals.push('video +3: player on page'); }
    const videoish = video > 0;
    if (tokens.some(t => /^(chapter|chap|ch)$/.test(t)) && !videoish) { comicish += 2; signals.push('comic: chapter in URL'); }
    if (tokens.includes('episode') && videoish) { video += 2; signals.push('video +2: episode URL with player'); }
    else if (tokens.some(t => /^(episode|ep)$/.test(t)) && !videoish) { comicish += 1; }

    // 6. Country of origin — only decisive when combined with other clues.
    const origin = (snap.labelPairs || [])
      .filter(([k]) => /^(country|origin|country of origin|original language|language)$/i.test(String(k).trim()))
      .map(([, v]) => String(v).toLowerCase()).join(' ');
    if (origin) {
      if (/korea/.test(origin))         add('manhwa', 3, 'origin Korea');
      else if (/chin/.test(origin))     add(videoish ? 'donghua' : 'manhua', 3, 'origin China');
      else if (/japan/.test(origin))    add(videoish ? 'anime' : 'manga', 3, 'origin Japan');
    }
    // Video content is anime unless it is Chinese in origin (then donghua).
    if (video) add(/chin/.test(origin) ? 'donghua' : 'anime', video, 'video content');

    // 7. Image shapes on a reader page (weak): long vertical strips are the
    //    mark of manhwa/webtoon; separate page-shaped images suggest manga.
    if ((snap.tallImages || 0) >= 3) { add('manhwa', 2, 'long vertical strip images'); add('webtoon', 1, 'long vertical strip images'); add('manhua', 1, 'long vertical strip images'); }
    else if ((snap.pageImages || 0) >= 5) add('manga', 1, 'page-shaped images');

    // 8. Words in the body text — capped at 1 point so navigation menus that
    //    list every type ("Manga | Manhwa | Manhua") cancel themselves out.
    const body = String(snap.bodyText || '').toLowerCase();
    IDS.forEach(id => { if (WORDS[id].test(body)) add(id, 1, 'mentioned on page'); });

    // Rank the candidates.
    const ranked = IDS.map(id => [id, scores[id]]).sort((a, b) => b[1] - a[1]);
    const [bestId, best] = ranked[0];
    const margin = best - ranked[1][1];

    let type = null, confidence = 'none';
    if (best >= 6 && margin >= 3)      { type = bestId; confidence = 'high'; }
    else if (best >= 4 && margin >= 2) { type = bestId; confidence = 'medium'; }
    else if (best >= 2 && margin >= 1) { type = bestId; confidence = 'low'; }

    return { type, confidence, scores, comicish, signals };
  }

  return { detectType, IDS };
});

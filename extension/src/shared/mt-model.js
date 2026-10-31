// NOTE: an identical copy of this file lives in docs/shared/. If you change it here, make the same change there.
/**
 * MangaTracker — shared data model
 *
 * Single source of truth for the lists of types, reading modes, series
 * statuses and default genres. Used by both the browser extension and the
 * web app (an identical copy sits in each), so the two stay in step.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTModel = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {

  // What kind of thing it is. `episodic` types use "ep." instead of "ch.".
  const TYPES = [
    { id: 'manhwa',  label: 'Manhwa',  icon: '📖', episodic: false },
    { id: 'manga',   label: 'Manga',   icon: '📚', episodic: false },
    { id: 'manhua',  label: 'Manhua',  icon: '📕', episodic: false },
    { id: 'webtoon', label: 'Webtoon', icon: '🌐', episodic: false },
    { id: 'anime',   label: 'Anime',   icon: '🎬', episodic: true  },
    { id: 'donghua', label: 'Donghua', icon: '🐉', episodic: true  },
    { id: 'novel',   label: 'Novel',   icon: '📝', episodic: false },
  ];

  // How *you* are currently reading it.
  //   following – reading as it releases
  //   cooking   – letting chapters pile up before binging
  //   paused    – set aside on purpose (works for finished series too)
  const MODES = [
    { id: 'following', label: 'Following' },
    { id: 'cooking',   label: 'Cooking'   },
    { id: 'paused',    label: 'Paused'    },
  ];

  // The state of the series itself (not of your reading).
  const STATUSES = [
    { id: 'ongoing',    label: 'Ongoing'    },
    { id: 'completed',  label: 'Completed'  },
    { id: 'hiatus',     label: 'Hiatus'     },
    { id: 'season_end', label: 'Season End' },
    { id: 'dropped',    label: 'Dropped'    },
  ];

  const DEFAULT_GENRES = [
    'Isekai', 'Regression', 'Murim / Wuxia', 'System', 'Romance', 'Harem',
    'Reincarnation', 'Cultivation', 'Slice Of Life', 'Fantasy', 'Historical',
    'Shonen', 'Magic', 'Action', 'Adventure', 'Modern', 'Medieval',
    'Martial Arts', 'Supernatural', 'Horror', 'Comedy', 'Drama', 'Sci-Fi',
    'Psychological', 'Thriller', 'Mystery', 'Mecha', 'Sports',
  ];

  const DEFAULT_VIBES = [
    'Hype', 'Comfort Read', 'Binge-worthy', 'Slow Burn', 'Emotional', 'Tense', 'Guilty Pleasure',
  ];

  const typeInfo   = id => TYPES.find(t => t.id === id) || TYPES[0];
  const typeIcon   = id => typeInfo(id).icon;
  const chLabel    = entry => (typeInfo(entry && entry.type).episodic ? 'ep.' : 'ch.');
  const statusLabel = id => (STATUSES.find(s => s.id === id) || { label: id || 'Ongoing' }).label;
  const modeLabel   = id => (MODES.find(m => m.id === id) || { label: id || 'Following' }).label;

  // Case-insensitive de-duplicating union of genre lists, keeping first spelling.
  function unionGenres(...lists) {
    const seen = new Map();
    lists.flat().forEach(g => {
      const t = String(g || '').trim();
      if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    });
    return [...seen.values()];
  }

  // Does `query` match `label`? Matches every space-separated word, in any
  // order, anywhere in the label ("slice life" matches "Slice Of Life").
  function matchesQuery(label, query) {
    const q = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!q.length) return true;
    const l = String(label || '').toLowerCase();
    return q.every(w => l.includes(w));
  }

  // Keeps `pausedAt` honest: set when an entry enters Paused, cleared when it leaves.
  function stampModeChange(entry, previous) {
    const wasPaused = previous && previous.mode === 'paused';
    if (entry.mode === 'paused' && !wasPaused) entry.pausedAt = Date.now();
    if (entry.mode !== 'paused' && entry.pausedAt) delete entry.pausedAt;
    return entry;
  }

  return {
    TYPES, MODES, STATUSES, DEFAULT_GENRES, DEFAULT_VIBES,
    typeInfo, typeIcon, chLabel, statusLabel, modeLabel,
    unionGenres, matchesQuery, stampModeChange,
  };
});

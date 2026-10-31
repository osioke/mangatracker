# Roadmap & ideas

## Known gaps (found while reading the code)

- **"Cooking" never reaches "ready to read".** The *Ready to read — cooking
  done* list compares your chapter with `latestChapter`, but nothing in the
  app ever sets `latestChapter`. Cooking entries therefore never show as
  ready. Fix = capture the latest chapter number from the series page (the
  content script already finds chapter numbers) or add a field.
- **No history.** Only `lastRead` (a single timestamp) is stored, so there is
  nothing to learn habits or pace from. Smart features below need a small
  reading log.
- **Cover fallback icons don't show in the extension.** `onerror="…"` attributes
  in the extension's HTML templates are blocked by Chrome's Manifest V3
  content-security policy, so a broken cover image stays blank instead of
  showing the 📖 icon (the web app is unaffected). Fix = one delegated
  `error` listener instead of inline attributes.
- **No password.** See *Privacy & security* in the README.
- **Type detection is a heuristic.** It reads clues from the page, but has
  only been tested on sample pages, not on every reading site.

## "Intelligence" — ideas, roughly in order of value for effort

All of these can be done **without AI**, using data the app already has, and
they run locally (nothing leaves your device).

1. **Resume list** — rank what to read next: recently read first, boosted when
   new chapters are waiting, nudged down when untouched for months.
2. **Nudges** — "Paused 90 days ago", "12 chapters waiting on X", "nothing read
   on Y for 6 weeks — drop it?" Needs `pausedAt` (now stored) and `lastRead`.
3. **Binge-ready** — cooking entries whose waiting chapters passed your
   threshold (needs the `latestChapter` fix above).
4. **Smart filters (saved views)** — "Finished and unread", "Short weekly
   reads", "Comfort reads for tonight" combining mode, status, vibe, genre.
5. **Duplicates and tidy-up** — spot the same series saved under two titles
   (alternate names already help) and suggest merging.
6. **Taste summary** — most-read genres, sites, average pace, once a reading
   log exists.
7. **Optional AI layer** — "what should I read tonight?" or natural-language
   search ("slow-burn romance I paused") over *your own library*. Possible,
   but sends your list to a model provider, so it should be opt-in.

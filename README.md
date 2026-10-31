# MangaTracker

Keep track of the manhwa, manga, manhua, webtoons, anime and novels you read, **across any website**.

- A **browser extension** sits in a side panel next to whatever you're reading. It spots the series on the page, remembers where you got to, and tells you what's new today.
- A **web app** shows the same library on your phone or any other computer.
- Both stay in step through a free **Firebase** database that you own. No account with us, no password, no ads, no tracking.

> **In a hurry?** Jump to [Quick start](#quick-start-no-technical-knowledge-needed).
> **Developer?** Jump to [For developers](#for-developers).

---

## Contents

1. [What it can do](#what-it-can-do)
2. [Quick start (no technical knowledge needed)](#quick-start-no-technical-knowledge-needed)
3. [Using it day to day](#using-it-day-to-day)
4. [Something not working?](#something-not-working)
5. [Privacy and security](#privacy-and-security)
6. [For developers](#for-developers)
7. [What's new](#whats-new)

---

## What it can do

| | |
|---|---|
| **Recognises the page** | Reads the title, cover picture, chapter number, genres and *what kind of series it is* (manhwa, manga, manhua, webtoon, anime, donghua, novel) from the page you're on. |
| **Knows what you already have** | If you open a series that's already in your library, a card says so and offers *Mark ch. 212 read*. It also recognises the same series on a different site, or under a different title (alternate names). |
| **Shows what's new today** | *Today* and *Week* views list what releases when. Schedules can be **weekly** (pick days), **monthly** (a fixed date) or **irregular** (no predictable date) — weekly *and* monthly entries can be irregular. |
| **Three ways of reading** | **Following** (read as it comes out), **Cooking** (let chapters pile up, then binge) and **Paused** (set aside on purpose — works for finished series too). |
| **Series status** | Ongoing, Completed, Hiatus, Season End, Dropped. Status describes the *series*; the reading mode describes *you*. So "completed, but I'm paused halfway through" is simply Completed + Paused. |
| **Searchable genres** | Type in the genre box to narrow the list; press Enter to tick a match, or to add your own new genre. |
| **Library tools** | Search (titles, alternate names, genres, sites), filter by type and state, group by site, total count always visible. |
| **Several sources per series** | Keep more than one site for the same series and choose a primary. |
| **Sync** | Changes in the extension appear in the web app and vice versa. Edits made on two devices are merged, not overwritten. |
| **Backup** | *Settings → Export* saves everything as one file. |

---

## Quick start (no technical knowledge needed)

You'll need: a computer with **Chrome, Brave, Edge or Firefox**, and (only if you want sync and the phone web app) a free **Google account**. Allow about 15 minutes the first time.

### Step 1 — Get the files

1. On this page click the green **Code** button → **Download ZIP**.
2. Unzip it somewhere you won't delete it (for example `Documents/MangaTracker`). The browser loads the extension *from this folder*, so don't move it afterwards.

### Step 2 — Install the extension

**Chrome / Brave / Edge**

1. Type `chrome://extensions` in the address bar (Brave: `brave://extensions`, Edge: `edge://extensions`).
2. Switch on **Developer mode** (top-right).
3. Click **Load unpacked** and choose the **`extension`** folder inside the unzipped files.
4. Click the puzzle-piece icon in the toolbar and **pin** MangaTracker.
5. Click its icon on any page — the side panel opens.

**Firefox**

1. In the `extension` folder, rename `manifest.json` to `manifest.chrome.json`, then rename `manifest.firefox.json` to `manifest.json`.
2. Type `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → pick `manifest.json`.
3. Firefox forgets temporary add-ons when it closes; you'll need to repeat step 2 next time.

You can already use the extension on its own — everything is saved in your browser. Steps 3 and 4 add **sync** and the **phone web app**.

### Step 3 — Create your free Firebase database (for sync)

Firebase is Google's free database service. You create one *for yourself*, so only you control your data.

1. Go to <https://console.firebase.google.com> → **Add project** → give it any name → keep clicking *Continue* (you can switch Google Analytics off).
2. On the project page click the **web icon `</>`** → give it a nickname → **Register app**. You'll see a block of settings. Copy two values: **`apiKey`** and **`projectId`**.
3. **Build → Firestore Database → Create database** → choose any location → **Production mode** → Create.
4. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.** (Nobody is asked to sign in with Google; this just lets the app talk to the database.)
5. **Firestore Database → Rules** tab → delete what's there → paste the contents of [`firestore.rules`](firestore.rules) → **Publish**. (It's a stricter version of the usual "signed-in users can read and write" rule; the simple version also works.)
6. Put your two values into **two files** (open them with Notepad / TextEdit):
   - `extension/src/firebase.js` — near the top: `apiKey` and `projectId`
   - `docs/index.html` — in the `<script>` section at the bottom of the file: `FB_API_KEY` and `FB_PROJECT`
7. Reload the extension (`chrome://extensions` → the ⟳ button on MangaTracker).

> The files you downloaded already contain the original author's keys. **Replace them with your own**, otherwise your library would live in someone else's database.

### Step 4 — Put the web app online (for your phone)

1. Create a free account at <https://github.com> and click **Fork** on this repository. Apply the changes from Step 3.6 to your fork (GitHub lets you edit a file in the browser with the ✏️ button).
2. In your fork: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/docs` → Save.**
3. Wait a minute or two. Your web app will be at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY-NAME/`.

### Step 5 — Sign in on each device

In the extension: **Settings** (top right) → **Sign in** → type your email → **Sign in / Register**.
On the website: type the **same email**.
Same email = same library. There's no password; read [Privacy and security](#privacy-and-security) so you know what that means.

---

## Using it day to day

### Adding a series

1. Open the series (or any chapter) page and click the MangaTracker icon.
2. Go to **Add** (the **+** in the left bar). The title, cover, chapter, genres and type are filled in for you. The line under *Type* says what was detected and how sure it is; if you change the type yourself, it won't be overwritten.
3. Check the details, choose the schedule, then **Save to library**.

### Marking chapters read

- On a chapter page of a series you already track, the **In your library** card offers one-click *Mark ch. N read*.
- In *Today*, series with a new release have a **✓ +1** button that adds one chapter.
- Open any entry for **− / +** and *Mark read*.

### Mode, status and pausing

| Want to… | Do this |
|---|---|
| Stop seeing a series in *Today* for a while (finished or not) | Open it → **Pause** (or set *Mode → Paused*). **Resume** puts it back. |
| Wait for chapters to pile up | *Mode → Cooking*. |
| Say the series has ended | *Status → Completed*. |
| Give up on it | *Status → Dropped*. |

Paused series show in a small **Paused** list at the bottom of *Today* (with how long they've been paused) and under *Library → Paused*. Completed, Hiatus, Season End and Dropped series never appear as "new releases".

### Schedules

- **Weekly** — choose 1×, 2× or 3× a week and tick the days, or **Irregular**.
- **Monthly** — choose **Same date** (the day of the month; "31" means the last day in shorter months) or **Irregular**.
- Irregular series are listed in their own section instead of being given a made-up date.

### Genres

Type in the genre box: the list narrows as you type (word order doesn't matter, so "slice life" finds *Slice Of Life*). **Enter** ticks the match; if nothing matches, Enter adds your text as a new genre that is remembered. Ticked genres stay visible while you search.

### Sync

The little dot beside the title count is the sync light: **green** = in step, **amber** = busy, **red** = a problem (hover for the reason). The extension syncs by itself about 1.5 seconds after every change, and again whenever you open it. *Settings → Sync now* does it on demand; *Full re-sync* re-reads and re-uploads everything (a repair tool). The web app checks again whenever you return to its tab, and has a **Refresh** button.

### Keeping it quick

Cover pictures are the heaviest part of a library. New covers are saved small (about 240 px wide). For covers saved earlier, **Settings → Data → Optimise covers** shrinks them in one click; it makes the panel quicker and the syncing smaller.

---

## Something not working?

| Symptom | What to try |
|---|---|
| Red sync dot / "Sync failed…" | Hover the dot (or read the message in *Settings → Sync*) — it now shows Firestore's actual reason. It retries by itself after 30 s, 2 min and 10 min. *Settings → Full re-sync* is the repair button. |
| `Firestore … 403` / "rules are blocking" | The rules from [`firestore.rules`](firestore.rules) weren't published (Step 3.5). |
| "Anonymous sign-in is not enabled" | Firebase console → Authentication → Sign-in method → Anonymous → Enable. |
| Sign-in says "Firebase not configured" | You haven't pasted your `apiKey` / `projectId` (Step 3.6). |
| Type / title / cover not detected | Refresh the page after installing or updating the extension (the page scanner loads with the page). Some sites hide their details; you can always fill the form in. |
| Opening the panel feels slow | *Settings → Optimise covers*. The panel also draws only 50 rows at a time ("Show more"). |
| Web app shows an empty library | You used a different email from the extension, the extension hasn't synced yet (*Settings → Sync now*), or the old website is still published (see [`MIGRATING.md`](MIGRATING.md)). |

---

## Privacy and security

- Your library is stored **in your browser** (extension) and **in your own Firebase project** (sync). There is no MangaTracker server, no analytics, no ads.
- **There is no password.** Your library's address in the database is a hash of your email. Anyone who knows your email *and* has this app's Firebase keys could open and edit your list. That's a deliberate trade-off for a low-stakes reading list. Mitigations: the email itself is no longer stored in the database, and the optional stricter rules in `firestore.rules` stop anyone *browsing* the database (they would have to guess your email).
- Firebase "API keys" for web apps are not secrets, but they identify your project. Don't reuse a Firebase project that holds anything sensitive.
- Want real protection? The natural next step is a passphrase mixed into the hash, or Firebase email-link sign-in.

---

## For developers

### Repository layout

```
mangatracker/
├── extension/                  Browser extension (Chrome/Brave/Edge MV3; Firefox MV2 manifest too)
│   ├── manifest.json
│   ├── manifest.firefox.json
│   ├── popup.html              Side-panel UI (markup + CSS)
│   ├── fonts/                  Bundled JetBrains Mono (OFL) — no network needed to draw the UI
│   ├── icons/
│   └── src/
│       ├── popup.js            All UI logic
│       ├── storage.js          chrome.storage.local wrapper (in-memory cache, bulk writes, tombstones)
│       ├── firebase.js         Sync wrapper: debounce, dirty flag, retries, status events
│       ├── content.js          Runs in pages: title/cover/chapter/genres + type clues
│       ├── background.js       Opens the side panel
│       └── shared/             Code used by both apps (see below)
├── docs/                       Web app — one static page; GitHub Pages publishes this folder
│   ├── index.html
│   ├── fonts/
│   └── shared/                 Identical copies of three of the files in extension/src/shared/
├── README.md   ROADMAP.md   MIGRATING.md   firestore.rules
```

The folder is called `docs` only because GitHub Pages can publish from `/` or `/docs` and nothing else — it holds the web app, not documentation.

**Shared code.** `mt-model.js` (types, modes, statuses, genres), `mt-schedule.js` (release rules), `mt-detect.js` (page → type scoring) and `mt-cloud.js` (Firestore sync) (except `mt-detect.js`) exist twice: in `extension/src/shared/` and `docs/shared/`. An extension can only load files from its own folder and Pages only serves `docs/`, so each needs its own copy. **If you change one, make the same change in the other.** (`mt-detect.js` exists only in the extension — the web app doesn't scan pages.) There is no build step: edit a file and reload.

### Data model (one entry)

| Field | Meaning |
|---|---|
| `id`, `title`, `altNames[]` | identity; alternate titles used when matching a page |
| `type` | `manhwa` `manga` `manhua` `webtoon` `anime` `donghua` `novel` (anime/donghua count in *episodes*) |
| `chapter`, `latestChapter` | where you are / newest known (*no UI sets `latestChapter` yet — see roadmap*) |
| `mode` | `following` \| `cooking` \| `paused` — how *you* are reading it |
| `status` | `ongoing` \| `completed` \| `hiatus` \| `season_end` \| `dropped` — state of the *series* |
| `releaseType` | `weekly` \| `monthly` |
| `releaseDays[]`, `releaseFreq` | weekly: weekdays 0–6, and `1`–`3` per week; **`releaseFreq: 0` means irregular**, for weekly *and* monthly |
| `releaseDayOfMonth` | monthly fixed date (1–31, clamped to month length); `null` when irregular |
| `tropes[]`, `vibes[]`, `notes` | genres, moods, free text |
| `url`, `hostname`, `sources[{url,primary}]` | where to read it |
| `image`, `imageData` | cover URL / locally stored small JPEG (data URL) |
| `savedAt`, `lastRead`, `pausedAt` | timestamps (`pausedAt` only while paused) |
| `updatedAt` | last edit — **drives sync merging** |

Releases are suppressed (`MTSchedule.isTracking`) when `mode` is `paused` or `status` is `dropped`, `completed`, `hiatus` or `season_end`.

### How sync works

```
mt_users/<hash>          index: { v:2, rev, pushedAt, settings, tombstones, buckets, hashes, count }
mt_users/<hash>-c0 … cN  entries, split into parts well under Firestore's 1 MiB limit
```

- `<hash>` = first 32 hex characters of SHA-256(lower-cased email).
- Entries go to a part by a stable hash of their `id`, so editing one entry rewrites **one** part; unchanged parts are skipped (compared by SHA-256).
- Every sync: read the index → (if the cloud changed) read the parts → **merge** (newest `updatedAt` per entry wins, ties favour this device; deletions are kept as *tombstones* for 180 days) → upload only changed parts → write the index last.
- "Has the cloud changed?" is a random revision id (`rev`), not a timestamp, so clock differences between devices don't matter. `peek()` is a single small read.
- Tokens: the anonymous Firebase login is refreshed rather than recreated; a 401/403 triggers one re-auth and retry.
- Errors keep Firestore's own message (`Firestore PATCH failed (400 INVALID_ARGUMENT): …`).
- The old format (one document holding everything) is still **read** and is upgraded on the first sync. Old *clients* must not be left running — see `MIGRATING.md`.
- Settings are pushed by the extension only; the web app passes `null` so it never overwrites them.

**Why the old code failed with `Firestore SET failed: 400`:** the whole library, with every cover image, was serialised into one string in one document. Firestore rejects values over ≈1 MiB with HTTP 400, so once the covers added up, every push (manual or automatic) failed, and the failure was only written to the console. (This was reproduced during development against a fake Firestore that enforces the same limit.)

### Type detection

`extension/src/shared/mt-detect.js` scores each type from clues gathered by `content.js`: explicit `Type:`/`Format:` labels (strongest), JSON-LD and `og:type`, URL path and host, tag/breadcrumb links, a video player, long vertical image strips, country of origin, and (capped at one point, so navigation menus cancel out) words in the text. It returns `null` rather than guess when evidence is thin, and the UI only applies medium/high confidence results and never over your manual choice. To teach it a new site hint, add a line to `HOST_HINTS`.

### Working on it

No tools are needed: open the files in any editor, then reload the extension (`chrome://extensions` → ⟳) or refresh the web page.

- **Add a type / mode / status / default genre** → edit `mt-model.js` in **both** `shared/` folders. The dropdowns and pills in both apps are generated from it.
- **Change release rules** → `mt-schedule.js` in both folders.
- **Change the look** → colour tokens are at the top of the `<style>` in `extension/popup.html` and `docs/index.html`. Keep `--txt2` / `--txt3` at least 4.5:1 against every background (they currently are).
- **Test sync after any change** → the code was exercised during development against a simulated Firestore and simulated browsers, but **not** against live Firestore or real reading sites. After changing sync, sign in and press *Settings → Sync now*; the dot should turn green.

See [`ROADMAP.md`](ROADMAP.md) for known gaps and ideas for smarter filtering and suggestions.

---

## What's new

- **Sync fixed.** Large libraries no longer fail with `Firestore SET failed: 400`; the library is split into parts, errors are explained, tokens refresh, unsynced changes survive closing the panel, and a sync light shows the state.
- **Two-way merge** between extension and web (no more "last device wins").
- **Faster to open.** The panel draws immediately instead of waiting for the network; lists draw 50 rows at a time; only the visible tab is drawn; the font is bundled; new covers are stored small; **Optimise covers** fixes old ones.
- **Paused mode** (works for completed series), with *Pause/Resume* in the detail view.
- **Monthly schedules can be irregular.**
- **Searchable genres**, which also add new genres.
- **Automatic type detection** (manga / manhwa / manhua / webtoon / anime / donghua / novel).
- **Total titles** in the header and library.
- **Readable text:** the dim grey text (2.7 : 1 contrast) is now ≥ 4.5 : 1 everywhere, including the *In your library* card.
- **One repository** for extension and web app, sharing code.
- Web app fixes: editing no longer resets *Season End*, drops custom genres or erases your settings.
- Completed, Hiatus and Season End series no longer appear as "new releases".

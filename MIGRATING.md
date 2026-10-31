# Moving to the new MangaTracker folder layout

You are replacing the contents of your `mangatracker` repository with the new
version, and retiring the separate `mangatracker-web` repository. Nothing
here touches your Firebase settings: **your Firestore rules stay exactly as
they are.**

New layout:

```
mangatracker/
├── extension/      the browser extension
├── docs/           the web app (GitHub Pages publishes this folder — it must be called "docs")
├── README.md       how to install and use it
├── ROADMAP.md      known gaps and ideas
├── MIGRATING.md    this guide
└── firestore.rules optional stricter database rules (you can ignore this file)
```

Allow about 15 minutes. Do the steps in order.

---

## Part 1 — Protect your library (do this first)

Your reading list currently exists only inside the extension in your browser
(the cloud database is empty, because earlier pushes were failing).

1. Open the extension → **Settings** → **Export**.
2. A file downloads. Move it somewhere safe (for example your Documents folder).

**Do not remove the extension or clear your browser data** until the first
sync in Part 5 has turned green.

---

## Part 2 — Retire the old website

The old `mangatracker-web` code saves in the old format. If it were ever
used after the new version is live, it could overwrite your new cloud data.

1. On GitHub open **mangatracker-web** → **Settings** → **Pages** → **Unpublish site**
   (this can be undone, unlike deleting).
2. Don't delete the repository yet — do that in Part 7 once everything works.
3. On your computer, delete the local **mangatracker-web** folder (you can
   re-download it from GitHub if you ever need it).

---

## Part 3 — Replace the files in your local `mangatracker` folder

1. Open a terminal **inside your local `mangatracker` folder** and run:
   ```
   git status
   ```
   It should say `nothing to commit, working tree clean`. If it lists changes
   you haven't saved, tell me before going further.
2. Show hidden files in your file explorer
   (Windows: *View → Show → Hidden items*; Mac: press `Cmd + Shift + .`).
3. **Delete everything inside the folder EXCEPT the hidden `.git` folder.**
   The `.git` folder is your project's history and its link to GitHub; deleting
   it would break the connection. Delete the old `src`, `icons`, `popup.html`,
   `manifest.json`, `manifest.firefox.json`, `notes.md`, the old `README.md`
   and anything else — but **keep `.git`**.
4. Extract the zip you were given **into that folder**, so that you see
   `extension`, `docs`, `README.md` and the others sitting directly beside `.git`
   (not inside an extra folder).

---

## Part 4 — Save the change to GitHub

In the same terminal:

```
git add -A
git status
git commit -m "Reorganise into extension/ and docs/, fix sync, add paused mode and other improvements"
git push
```

`git status` (before committing) should list the new `extension/` and `docs/`
files, and show the old files as deleted or moved. If `git push` is rejected,
stop and tell me what the message says — don't force it.

Then on GitHub: your repository → **Settings → Pages → Build and deployment**:

- **Source:** *Deploy from a branch*
- **Branch:** `main`, folder **`/docs`** → **Save**

After a minute or two the site is at `https://osioke.github.io/mangatracker/`.

---

## Part 5 — Check that sync works (the important test)

1. Go to `chrome://extensions` (or `brave://` / `edge://`) and press the **⟳** reload
   button on MangaTracker. Then refresh any manga tabs that were already open.
2. Open the extension → **Settings** → **Sign in** → type your email →
   **Sign in / Register**.
3. Press **Sync now**.
4. Look at the little dot in the header:
   - **Green** → it worked. Your library is now in the cloud.
   - **Red** → hover over the dot, or read the line under *Settings → Sync*.
     It now says exactly why. **Send me that message.**
5. Optional proof: Firebase console → Firestore Database → **Data**. You
   should now see a collection called `mt_users` with a few entries.

## Part 6 — Check the web app

Open `https://osioke.github.io/mangatracker/`, sign in with **exactly the
same email**, and your library should appear. Try the type filter, the
**Paused** filter and the genre search.

## Part 7 — Tidy up

When Parts 5 and 6 are both working, delete the old **mangatracker-web**
repository on GitHub (Settings → scroll to the bottom → Delete this repository).

---

## If something goes wrong

| What you see | What it means |
|---|---|
| Red sync dot with a message | Send me the message — it names the cause. |
| `403` / "rules are blocking" | Your Firestore rules were changed. They should read `allow read, write: if request.auth != null;` inside `match /mt_users/{docId}`. |
| Web app: empty library | You used a different email from the extension, or the extension hasn't synced yet (Part 5). |
| Web app: 404 page | Pages isn't pointed at `main` + `/docs` yet (end of Part 4), or give it a few minutes. |
| You think you lost your list | Don't panic: your Part 1 export file restores it — *Settings → Import* in the extension. |

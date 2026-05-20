# MangaTracker

Track your manhwa, manga, manhua and anime across any reading site.
Access your library from the browser extension or the web app on your phone.

---

## Firebase setup (required for sync)

You need a free Firebase project. Takes about 5 minutes.

1. Go to https://console.firebase.google.com
2. Click **Add project** → give it a name → Continue
3. Once created, click the **Web** icon (`</>`) → give it a nickname → **Register app**
4. Copy the **apiKey** and **projectId** from the config block shown
5. Go to **Firestore Database** → **Create database** → **Start in production mode** → pick any region
6. Go to **Authentication** → **Get started** → **Sign-in method** → enable **Anonymous** → Save
7. Go to **Firestore Database** → **Rules** tab → paste the rules below → **Publish**

### Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mt_users/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Paste your keys into two files

**`mangatracker/src/firebase.js`** — near the top:
```js
apiKey:    'YOUR_API_KEY',
projectId: 'YOUR_PROJECT_ID',
```

**`mangatracker-web/index.html`** — near the bottom of the script block:
```js
const FB_API_KEY = 'YOUR_API_KEY';
const FB_PROJECT = 'YOUR_PROJECT_ID';
```

---

## Extension installation

### Chrome / Brave / Edge
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `mangatracker/` folder
4. Pin the icon from the toolbar puzzle-piece menu
5. After any file update, click the **reload** icon on the extension card

### Firefox
1. Rename `manifest.json` → `manifest.chrome.json`
2. Rename `manifest.firefox.json` → `manifest.json`
3. Go to `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`

---

## GitHub Pages (web app)

1. Create a new GitHub repository
2. Upload `mangatracker-web/index.html` to the repo root
3. Go to repo **Settings** → **Pages** → Source: **Deploy from a branch** → `main` / `root`
4. Your web app is live at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`

---

## How sync works

- Data lives in Firestore under a key derived from `SHA-256(username:phrasekey)`
- No email or account needed — just a username and a phrase you remember
- Same username + phrase on any device = same library
- The extension auto-pushes to the cloud 1.5 seconds after any change when signed in
- The web app can also read and write — add, edit, mark chapters, and delete from your phone

---

## How to use

### Extension
- Opens directly to **Add entry** on every click
- Page title, cover art, and genres are auto-detected from the current tab
- Cover art: **Auto** uses the page's og:image, **Upload** lets you pick a file, **Pick** lets you click any image on the page directly, **Clear** removes it
- Sign in via **Settings → Sync** using a username and phrase-key
- Once signed in, all changes push to the cloud automatically

### Web app
- Open your GitHub Pages URL on any device
- Sign in with the same username and phrase-key as the extension
- Full read/write access — add, edit, mark chapters read, delete entries

---

## Cover art picker

1. Open the extension on a manga/manhwa page
2. Click **Pick** in the cover art row
3. A banner appears on the page: *"MangaTracker: click any image to use as cover art · Esc to cancel"*
4. Hover over any image — a purple outline shows which image is targeted
5. Click the image to use it, or press Esc to cancel
6. Reopen the extension — the selected image is now set as cover art

---

## File structure

```
mangatracker/               Browser extension
├── manifest.json           Chrome/Brave/Edge (MV3)
├── manifest.firefox.json   Firefox (MV2)
├── popup.html
├── icons/
└── src/
    ├── background.js       Message relay for image picker
    ├── content.js          Page info, genre detector, image picker
    ├── storage.js          Local storage helpers
    ├── schedule.js         Release schedule logic
    ├── firebase.js         Cloud sync — add your keys here
    └── popup.js            All UI logic

mangatracker-web/           Web app (GitHub Pages)
└── index.html              Add your Firebase keys here too
```

---

## Privacy

All data is stored locally via `chrome.storage.local`.
Cloud sync only happens when you are signed in — changes push automatically 1.5 seconds after each edit.
No analytics, no tracking, no ads.

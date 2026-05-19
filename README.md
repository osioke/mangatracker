# MangaTracker

Track your manhwa, manga, manhua and anime across any reading site.
Access your library from the browser extension or the web app.

---

## Firebase setup (required for sync)

You need a free Firebase project. This takes about 5 minutes.

1. Go to https://console.firebase.google.com
2. Click **Add project** → give it any name → Continue through the steps
3. Once created, click the **Web** icon (`</>`) → give it a nickname → **Register app**
4. You'll see a `firebaseConfig` block — copy the **apiKey** and **projectId** values
5. Go to **Firestore Database** → **Create database** → **Start in test mode** → pick any region
6. Go to **Authentication** → **Get started** → **Sign-in method** → enable **Anonymous** → Save

Now paste your values into two places:

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
1. Go to `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `mangatracker/` folder
4. Pin the icon from the toolbar puzzle-piece menu

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

Open this URL on your phone to access your library anywhere.

---

## How sync works

- Data is stored in Firestore under a key derived from SHA-256(`username:phrasekey`)
- No email or account needed — just a username and memorable phrase you choose
- Same username + phrase on any device = same library
- **Push** sends your extension library to the cloud
- **Pull** downloads the cloud library to your current device
- The web app loads fresh from the cloud on every sign-in

---

## What's new in this version

- **Sidebar**: Add entry is now at the bottom, separated from the main nav
- **Genre detection**: extension auto-detects genres from the page you're on
- **Custom genres & vibes**: type any tag and press Enter — it saves for next time
- **Cover art upload**: click the thumbnail to upload your own image
- **Cloud sync**: push/pull your library via Firebase using a username + phrase-key
- **Web app**: full library viewer at your GitHub Pages URL, works on phone

---

## File structure

```
mangatracker/               Browser extension
├── manifest.json           Chrome/Brave/Edge (MV3)
├── manifest.firefox.json   Firefox (MV2)
├── popup.html
├── icons/
└── src/
    ├── background.js
    ├── content.js          Page info + genre detector
    ├── storage.js          Local storage
    ├── schedule.js         Release schedule logic
    ├── firebase.js         Cloud sync — add your keys here
    └── popup.js            All UI logic

mangatracker-web/           Web app (GitHub Pages)
└── index.html              Add your Firebase keys here too
```

---

## Privacy

All data is stored locally via `chrome.storage.local`.
Cloud sync only happens on explicit Push/Pull.
The web app only reads from Firestore — it never writes.
No analytics, no tracking.

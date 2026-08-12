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

These rules let any signed-in (including anonymous) client read or write any document as long as it knows the document's key — that's what makes the email-only sign-in below possible, and also why it isn't a real password.

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

- Sign in with just an **email** — there's no password. Your data is stored in Firestore under a key derived from `SHA-256(your email)`.
- ⚠️ **Security note:** because there's no password, anyone who knows your email can access and edit this library — the Firestore rules below allow any authenticated (anonymous) client to read/write any document once it knows the key. That's a deliberate trade-off for a low-stakes reading list, not an oversight. If you want real protection here, consider adding a PIN/passphrase on top of the email, or switching to Firebase's email-link sign-in.
- Same email on any device = same library
- The extension **auto-pushes** to the cloud ~1.5 seconds after any change while signed in, and also has manual **Push**/**Pull** buttons in Settings → Sync
- The web app loads fresh from the cloud on every sign-in and can push its own changes back

---

## What's new in this version

- **Alternate names**: entries can track alternate titles used by different sites, so match detection recognises the same series everywhere
- **Monthly schedules**: releases can be set to a specific day-of-month instead of weekly days
- **Irregular schedule**: marking a series Irregular hides the day picker entirely and lists it in its own "Irregular" section instead of a fake weekly slot
- **Default release day**: saving without picking a day now defaults to today, so every (non-Irregular) entry ends up with a schedule
- **Email-only sign-in**: no more username + phrase-key — see the security note above
- **Sidebar**: Add entry is now at the bottom, separated from the main nav
- **Genre detection**: extension auto-detects genres from the page you're on
- **Custom genres & vibes**: type any tag and press Enter — it saves for next time
- **Cover art upload**: click the thumbnail to upload your own image
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

All data is stored locally via `chrome.storage.local` (with the `unlimitedStorage` permission, so accumulated cover-art images won't silently hit a storage quota and fail to save).
Cloud sync happens automatically ~1.5s after each change while signed in, plus on-demand via the Push/Pull buttons.
The web app reads from and writes to Firestore when signed in.
No analytics, no tracking, no ads.

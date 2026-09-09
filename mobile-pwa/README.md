# ✦ Book Reader Mobile (PWA)

A mobile-first, offline Progressive Web App (PWA) built for Android phones to read books on the go, automatically resuming where you stopped. Built with React, TypeScript, Vite, PDF.js, and IndexedDB, mirroring the luxury dark/gold aesthetic and core capabilities of the desktop reader without requiring any backend server, paid APIs, or cloud accounts.

---

## Table of Contents
1. [What Was Built](#what-was-built)
2. [Prerequisites & Commands](#prerequisites--commands)
3. [How to Deploy to GitHub Pages for Free](#how-to-deploy-to-github-pages-for-free)
4. [How to Install on Android](#how-to-install-on-android)
5. [How to Import Books & Read Offline](#how-to-import-books--read-offline)
6. [How to Back Up & Restore Reading Progress](#how-to-back-up--restore-reading-progress)
7. [Storage Limitations & Troubleshooting](#storage-limitations--troubleshooting)
8. [Automated Verification & Physical Phone Checks](#automated-verification--physical-phone-checks)

---

## 1. What Was Built

- **Mobile First Architecture:** Responsive for Android portrait and landscape layouts, minimum 48px touch targets, mobile safe-area insets, and smooth touch gestures.
- **Three Book Formats Supported:**
  - **PDF:** Rendered page-at-a-time via `pdfjs-dist` on hardware-accelerated canvas with fit-to-width, fit-to-page, touch zooming/panning, eye-comfort warm filter, soft night filter, and cancellation of obsolete render tasks when turning pages fast.
  - **EPUB:** Extracted and parsed locally via `jszip`. Embedded scripts are strictly stripped for security. Images and styles are resolved offline using local blob URLs. Stable chapter + scroll progress tracking.
  - **TXT:** Fast pagination preserving paragraphs and custom reading typography.
- **100% Offline & Independent Storage:**
  - Uses browser **IndexedDB** (`book_reader_db`) separating lightweight metadata (`books`, `progress`, `bookmarks`) from binary blobs (`bookBlobs`) so large files do not exhaust mobile RAM when browsing the library.
  - Self-hosted PDF.js worker (`public/pdfjs/pdf.worker.min.mjs`), character maps, and standard fonts with zero runtime CDN dependencies.
  - Service worker with offline cache fallback for application shell and dynamic asset caching.
- **Reading Progress & Bookmarks Separation:**
  - **Automatic Resumption:** Saves current location whenever navigation occurs, plus best-effort saving on `visibilitychange` (switching apps on Android) and `pagehide`. Automatically restores the exact page when reopening the book.
  - **Manual Bookmarks:** Saved separately with page index, snippet, and timestamp. (e.g. If you bookmark page 20 and stop reading on page 35, reopening resumes at page 35 while your bookmark remains fixed at page 20).
- **Stable Content Fingerprint & Duplicate Detection:**
  - Computes SHA-256 hash using Web Crypto API. Identical book files are recognized even if filenames change. Re-importing offers to open the existing copy without overwriting progress.
- **Backup & Restore System:**
  - One-tap export to downloadable JSON (`book-reader-backup-YYYY-MM-DD.json`).
  - Import validates schema and links progress/bookmarks by content fingerprint.
  - **Unmatched Record Queue:** If backup contains progress for a book not yet imported on this device, it is preserved in IndexedDB and automatically applied when that book is imported later!
- **PWA Capabilities:**
  - Web app manifest with standalone display mode, theme colors, 192x192, 512x512, and 512x512 maskable icons.
  - In-app install banner with step-by-step Android Chrome guide.
  - Non-intrusive update notification ("Update Ready") that saves reading progress before reloading.

---

## 2. Prerequisites & Commands

### Prerequisites
- **Node.js:** v18+ (tested on Node v22.15.0)
- **npm:** v9+

### Commands

From the `mobile-pwa/` folder:

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Build production bundle
npm run build

# 4. Preview production build locally
npm run preview -- --port 4173 --host

# 5. Run automated test suite
npx tsx test_flows.mjs
```

---

## 3. How to Deploy to GitHub Pages for Free

The app is pre-configured with relative base paths (`./`) in `vite.config.ts`, `manifest.json`, and `sw.js`. It runs seamlessly on any free GitHub Pages domain without broken asset links:
`https://USERNAME.github.io/REPOSITORY/`

### Step-by-Step GitHub Pages Setup

1. **Keep Private Data Safe:**
   - The desktop app code (`main.py`, `core/`, `ui/`, `data/`, `build/`) and your personal book files are **not** needed for the mobile deployment.
   - Deploy only the `mobile-pwa/` directory and the `.github/workflows/deploy.yml` workflow.

2. **Create a GitHub Repository:**
   - Create a new public or private repository on GitHub (e.g., `book-reader-mobile`).

3. **Push the Files:**
   If publishing from this workspace:
   ```bash
   git init
   git add mobile-pwa/ .github/workflows/deploy.yml
   git commit -m "feat: Add Book Reader Mobile PWA and deployment workflow"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPOSITORY.git
   git push -u origin main
   ```

4. **Enable GitHub Pages in Repository Settings:**
   - Go to your repository on GitHub -> **Settings** -> **Pages**.
   - Under **Build and deployment** -> **Source**, choose **GitHub Actions**.
   - The included workflow `.github/workflows/deploy.yml` will automatically build `mobile-pwa/` and publish it.
   - Once the action completes (typically 1 minute), your site URL will be displayed:
     `https://USERNAME.github.io/REPOSITORY/`

---

## 4. How to Install on Android

1. Open **Google Chrome** on your Android phone.
2. Navigate to your deployed HTTPS URL (e.g., `https://USERNAME.github.io/REPOSITORY/`).
3. Tap the **"Install App"** button inside the header bar, or:
   - Tap the Chrome three-dot menu **(⋮)** in the top right.
   - Tap **"Install app"** (or **"Add to Home screen"**).
4. The **Book Reader** app icon will appear on your phone's home screen and app drawer.
5. Launching from the icon opens Book Reader in full-screen standalone mode without any browser URL bar or navigation buttons.

---

## 5. How to Import Books & Read Offline

1. **Importing:**
   - Open Book Reader on your phone.
   - Tap **"+ Add Book"** or **"Import Your First Book"**.
   - Your Android file manager will open. Select any `.pdf`, `.epub`, or `.txt` file.
   - The book is fingerprinted, parsed, and stored permanently in local IndexedDB.
2. **Reading Offline:**
   - Once a book is imported and the green **"Offline Ready"** badge is shown, you can turn on **Airplane Mode** or disconnect Wi-Fi and mobile data.
   - Close the app and reopen it from the home screen icon anytime.
   - Tap **"Resume Reading"** on the Continue Reading card or tap any book in your library.
   - The book opens instantly, restoring your exact page and zoom level.

---

## 6. How to Back Up & Restore Reading Progress

### Export Backup
1. In the app header, tap the **Settings** gear icon.
2. Under **Backup & Restore**, tap **"Export Backup"**.
3. Chrome downloads a file named `book-reader-backup-YYYY-MM-DD.json`.
4. *Note:* This backup contains your reading positions, percentages, and bookmarks indexed by book content fingerprints. It does not store the original book files, keeping the backup tiny (< 50 KB).

### Restore Backup
1. In Settings, tap **"Restore Backup"**.
2. Select your backup `.json` file.
3. Book Reader matches the records against books currently in your library and restores their reading positions and bookmarks.
4. **Queue for Future Books:** If the backup contains progress for books you haven't transferred to this phone yet, Book Reader preserves those records in the background and automatically links them the moment you import that book in the future!

---

## 7. Storage Limitations & Troubleshooting

- **Storage Type:** Book Reader uses browser IndexedDB storage.
- **Storage Limit:** Modern Android Chrome allocates between 10% and 60% of available disk space (often 5 GB to 20+ GB), enough for hundreds of books.
- **Requesting Persistent Storage:**
  - Open Settings and tap **"Request Persistent"**. If granted, Chrome will protect Book Reader's IndexedDB storage from automatic cleanup when device storage runs low.
- **Site Data Warning:**
  - In Android Chrome, tapping *Settings -> Site Settings -> Clear Data* removes local IndexedDB databases. Keep periodic JSON backups using the Export feature to safeguard your bookmarks.
- **PDF Password Protection:**
  - Encrypted PDFs prompt for a password when opened. Passwords are used only in-memory to decrypt the session and are never saved to disk.

---

## 8. Automated Verification & Physical Phone Checks

### Automated Test Suite Results (12 / 12 PASSED)
The built production app was verified through an end-to-end automated test suite (`npx tsx test_flows.mjs`):
- `[PASS]` **Stable Content Fingerprint:** Deterministic SHA-256 hashes generated across identical and distinct files.
- `[PASS]` **PDF Rendering Engine:** Multi-page PDF parsed, page count validated, text snippets extracted.
- `[PASS]` **EPUB Engine:** Spine chapters extracted, scripts stripped, images mapped to offline blob URLs.
- `[PASS]` **TXT Engine:** Text paginated preserving paragraphs and reading typography.
- `[PASS]` **Independent Progress:** Multiple books retain distinct, independent reading progress.
- `[PASS]` **Bookmark Separation:** Manual bookmark fixed at page 20 while reading stopped and resumed at page 35.
- `[PASS]` **Duplicate Detection:** Re-importing duplicate book alerts user and preserves existing progress.
- `[PASS]` **Backup & Restore:** Full JSON export and schema validation.
- `[PASS]` **Unmatched Backup Persistence:** Queued records preserved and auto-applied when book is imported later.
- `[PASS]` **Deletion Isolation:** Deleting a book leaves other books, blobs, and bookmarks completely intact.
- `[PASS]` **Settings Persistence:** Theme, PDF filter, and typography settings persist across sessions.
- `[PASS]` **Subpath Deployment:** Validated that production bundle uses relative `./` URLs for GitHub Pages compatibility.

### Browser UI Test Results (PASSED)
- Executed via browser automation on `http://localhost:4173/`.
- Verified Header `✦ Book Reader`, empty state, theme switching (Dark Obsidian <-> Light Alabaster), Settings modal opening, and device storage reporting.

### Checks Requiring Physical Phone:
- Adding the app to the physical Android home screen via Chrome's native prompt.
- Testing reading with the phone set to physical Airplane Mode.

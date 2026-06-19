# Financico — PWA

A tiny installable web app for logging income/expense from the phone to the
Financico Apps Script endpoint (built in Steps 1–2). Two forms (income / expense),
Hebrew RTL, datalist suggestions that grow with use, works offline as an app shell.
**No secrets in this repo** — the endpoint URL and token are entered once on the
device and saved to `localStorage`.

## Enable GitHub Pages
1. Push this repo to GitHub as a **public** repo named `financico-web`.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Branch: **`main`**, folder: **`/ (root)`** → **Save**.
4. Wait ~1 minute, then copy the published URL (e.g. `https://<you>.github.io/financico-web/`).
5. Open that URL on your phone. On first run, enter the `/exec` endpoint URL and token
   in the settings panel (gear icon reopens it later). Use **Add to Home Screen** to install.

## Installable entry points (Step 3b)
Two standalone, separately-installable pages — each opens its form directly and
installs as its own home-screen icon:
- `…/financico-web/income/` → green "הכנסה" form
- `…/financico-web/expense/` → blue "הוצאה" form

On each page, use **Add to Home Screen** to get a distinct icon (green / blue).
The root `…/financico-web/` still works as a chooser fallback. The `?type=income` /
`?type=expense` query form is also still honored.

## Structure
- `index.html` (+ `income/`, `expense/` entry pages) are thin shells.
- `styles.css` + `app.js` hold the shared UI and logic (`app.js` reads its mode from
  `window.FIN_TYPE`, else `?type=`, else shows the chooser).
- `sw.js` caches the app shell (GET, same-origin only) — bump `CACHE` on every change.

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

## Direct links
- `…/financico-web/?type=expense` → opens the expense form
- `…/financico-web/?type=income` → opens the income form

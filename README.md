# Ledger — finance tracker

A personal finance tracker (budgets, targets, quarterly bonus calculator,
net worth forecasting) that installs as a desktop app, synced through
Supabase — same approach as Sheldon Actions.

## 1. Create the Supabase table

1. Go to your Supabase project (or create a new one at supabase.com).
2. Dashboard -> SQL Editor -> New query.
3. Paste the contents of `supabase-setup.sql` and run it.
4. Dashboard -> Settings -> API. Copy the **Project URL** and the
   **anon public key**.

## 2. Add your Supabase credentials

Open `src/supabaseClient.js` and replace:

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

with the values you copied.

## 3. Set your repo name

Open `vite.config.js` and set `REPO_NAME` to match your GitHub repo, e.g.
if your repo is `github.com/yourname/finance-tracker`, keep it as
`/finance-tracker/`. If you rename the repo, update this to match.

## 4. Push to GitHub

```bash
cd finance-tracker-app
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/finance-tracker.git
git push -u origin main
```

## 5. Turn on GitHub Pages

1. On GitHub: repo -> Settings -> Pages.
2. Under "Build and deployment", set Source to **GitHub Actions**.
3. Push (or re-run the workflow under the Actions tab) — the included
   workflow (`.github/workflows/deploy.yml`) builds and deploys
   automatically on every push to `main`.
4. Your app will be live at `https://YOUR-USERNAME.github.io/finance-tracker/`.

## 6. Install it as a desktop app

Once it's live:

1. Open the URL in Chrome or Edge.
2. Click the install icon in the address bar (or menu -> "Install Ledger…").
3. It opens in its own window with its own icon, like any other desktop app,
   from then on.

## Local development

```bash
npm install
npm run dev
```

## Notes

- Data is stored in a single Supabase table (`kv_store`) as one JSON blob,
  keyed by `finance-tracker-data-v1` — matches the same one-key pattern
  used in Sheldon Actions.
- The service worker uses a network-first strategy with `cache: "no-store"`
  so GitHub Pages' HTTP caching doesn't serve you a stale build after a
  deploy — same fix that was needed for Sheldon Actions.
- The RLS policy in `supabase-setup.sql` is permissive (anyone with the
  anon key, which is public in the deployed JS, can read/write). Fine for
  a private personal tool; don't put anything you'd mind leaking behind it.

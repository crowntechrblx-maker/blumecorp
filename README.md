# Westbridge OS

A macOS-style desktop UI in the browser, built with Vite + React + TypeScript.

Includes a menu bar, desktop icons, a dock, and draggable windows for:
Transport for London, Uber, Swift Corporate, Maps, PS C&M Rolls, Royal Family, Blume, Instagram, and Messages. Each app opens with generic placeholder content.

## Local development

```bash
npm install
npm run dev
```

## Roblox sign-in setup (local dev)

The app now requires signing in with Roblox before the desktop loads, and the signed-in Roblox username is used inside Instagram and Messages.

1. Go to https://create.roblox.com/credentials → **OAuth Apps** → **Create app**.
2. Give it any name (e.g. "Westbridge OS").
3. Under **Redirect URIs**, add:
   ```
   http://localhost:5173/api/auth/callback
   ```
   (adjust the port if your dev server picks a different one — check the terminal output when you run `npm run dev`)
4. Under **Scopes**, enable `openid` and `profile`.
5. Save, then copy the **Client ID** and **Client Secret**.
6. In the project folder, copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
7. Fill in `.env.local` with your real Client ID and Client Secret. `.env.local` is already gitignored, so your secret never gets committed.
8. Restart the dev server (`npm run dev`) so it picks up the new env vars.
9. Open `http://localhost:5173` — you'll be prompted to sign in with Roblox before the desktop appears.

For local dev, auth is an in-memory session handled by Vite's dev server middleware (see `vite.config.ts`). It only works while `npm run dev` is running. Production uses a completely separate implementation — see below.

## Deploy to GitHub + Vercel

1. Create a new GitHub repo and push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Westbridge OS"
   git branch -M main
   git remote add origin https://github.com/<your-username>/westbridge-os.git
   git push -u origin main
   ```
2. Go to https://vercel.com/new, import the GitHub repo.
3. Vercel auto-detects Vite — framework preset "Vite", build command `npm run build`, output directory `dist`. Click Deploy.

Every push to `main` will auto-redeploy.

## Production sign-in, backgrounds, and posts (Vercel)

The dev-server middleware in `vite.config.ts` doesn't exist once deployed — Vercel serves a static build plus a separate `/api` folder of serverless functions. Those functions (`api/auth/*`, `api/wallpapers`, `api/posts`) are what actually power sign-in, backgrounds, and the Instagram feed in production. Serverless functions are stateless and have no persistent local disk, so this version uses:

- A signed cookie for sessions (no server-side memory needed to verify who's logged in).
- **Upstash Redis** (via Vercel's Marketplace) to store wallpaper and post metadata.
- **Vercel Blob** to store uploaded images.

To wire it up, in your Vercel project dashboard:

1. **Storage** tab → under **Marketplace Database Providers**, click **Upstash** → create a Redis database and connect it to this project. This adds either `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (the code checks for both, so either naming works).
2. **Storage** tab → **Create** → **Blob** → connect it to this project. This automatically adds `BLOB_READ_WRITE_TOKEN`.
3. **Settings** → **Environment Variables**, add:
   - `ROBLOX_CLIENT_ID` and `ROBLOX_CLIENT_SECRET` — same values from your Roblox OAuth app.
   - `ROBLOX_REDIRECT_URI` — set to `https://<your-vercel-domain>/api/auth/callback`.
   - `SESSION_SECRET` — a long random string. Generate one locally with `openssl rand -hex 32` and paste the result in.
4. On the Roblox Creator Dashboard, open your OAuth app and add a second Redirect URI (in addition to your `localhost` one): `https://<your-vercel-domain>/api/auth/callback`.
5. Redeploy — new environment variables only take effect on a fresh deployment, so trigger one (push a commit, or use "Redeploy" in the Vercel dashboard).

Once that's done, sign-in, background uploads, and the Instagram feed all work on the live site, backed by real shared storage instead of the local-only dev setup.

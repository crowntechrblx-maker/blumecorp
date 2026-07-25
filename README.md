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

Auth is currently implemented as an in-memory session handled by Vite's dev server middleware (see `vite.config.ts`), so it only works while `npm run dev` is running locally. It is not wired up for the Vercel deployment yet — that would need a real backend (e.g. Vercel serverless functions) since Vercel doesn't run this dev-only middleware in production.

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

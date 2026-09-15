# Provisions

A self-hosted shopping list app (like Listonic): multiple lists, items auto-sorted
into aisle categories (Produce, Dairy & Eggs, Meat & Seafood, etc.), quantities,
and a "checked/in cart" section. Data is stored in a single JSON file on a
volume you control, so it survives container restarts and updates.

No database server, no native modules, no build step — just Node + Express,
so it runs on any QNAP NAS regardless of CPU architecture (ARM or x86).

## Step 1 — push this to GitHub

```bash
cd provisions
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/provisions.git
git push -u origin main
```
(Create the empty repo on GitHub first — either public or private both work.)

This repo includes `.github/workflows/docker-publish.yml`, a GitHub Actions
workflow that automatically builds a Docker image for both Intel/AMD and ARM
CPUs and pushes it to GitHub Container Registry (`ghcr.io`) every time you
push to `main`. Check the **Actions** tab on your repo after pushing — once
it's green, your image is ready at
`ghcr.io/YOUR_GITHUB_USERNAME/provisions:latest`.

Then open `docker-compose.yml` in the repo and replace
`YOUR_GITHUB_USERNAME` in the `image:` line with your actual GitHub username.
Commit and push that change too.

**If your repo is private**, the built image is private by default too. Your
NAS will need to authenticate to pull it — see "Authenticating to a private
GHCR image" below. Simplest fix: after the first successful Action run, go to
your GitHub profile → **Packages** → the `provisions` package → **Package
settings** → change visibility to **Public**. Then no login is needed on
the NAS side.

## Step 2 — deploy on your QNAP NAS

### Option A — Container Station, from Git (recommended)

1. Open **Container Station** → **Create** → **Create Application**.
2. Choose the option to create from a **Git repository / docker-compose.yml
   URL** (naming varies slightly by Container Station version — look for
   "Git" or "Import from URL" under the compose-file source).
3. Enter your repo URL, e.g. `https://github.com/YOUR_GITHUB_USERNAME/provisions.git`.
4. Before deploying, edit the `volumes:` line in the compose file so the
   left-hand side is a real folder on your NAS storage, e.g.:
   ```yaml
   volumes:
     - /share/Container/provisions-data:/app/data
   ```
   This is where your lists are saved — keep it outside the app folder so it
   isn't touched by future updates.
5. Deploy. Container Station will pull the pre-built image from GHCR (fast —
   no build step on the NAS) and start it.
6. Visit `http://<your-nas-ip>:3000` in a browser (on your phone too — it's
   mobile-friendly).

If your Container Station version doesn't support creating directly from a
Git URL, use Option B instead.

### Option B — SSH / command line

If you have SSH access and Docker/Container Station's CLI enabled:

```bash
cd /share/Container
git clone https://github.com/YOUR_GITHUB_USERNAME/provisions.git
cd provisions
docker compose up -d
```

To pick up a new version later (after pushing changes and the Action
finishes building):
```bash
cd /share/Container/provisions
git pull
docker compose pull
docker compose up -d
```

### Authenticating to a private GHCR image

If you'd rather keep the package private than make it public, log in to
GHCR on the NAS once, using a GitHub [personal access token](https://github.com/settings/tokens)
with `read:packages` scope:
```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
# paste the token as the password when prompted
```

### Option C — build locally instead of pulling from GHCR

If you don't want to use GitHub Actions at all, edit `docker-compose.yml`:
comment out the `image:` line and uncomment `build: .`. Then:
```bash
docker compose up -d --build
```
This builds the image directly on the NAS from the source files instead of
pulling a pre-built one.

## Backing up your data

Everything lives in one file: `db.json` inside the folder you mounted to
`/app/data`. Back up that folder (or just that file) the same way you'd back
up any other shared folder on the NAS — Hybrid Backup Sync, rsync, or a
scheduled copy job all work fine.

## Notes on the "auto-categorize" feature

When you add an item, it's matched against a keyword list (e.g. "milk" →
Dairy & Eggs, "toilet paper" → Household) and dropped into that category
automatically. You can add quantity shorthand right in the input, like
`2x eggs` or `eggs x2`. Unrecognized items land in "Other" — the keyword
list lives in `server.js` under `CATEGORY_KEYWORDS` if you want to extend it.

## Local development (without Docker)

```bash
npm install
npm start
```
Then open `http://localhost:3000`. Data is written to `./data/db.json` by
default.

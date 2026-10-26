# Deploying Drimindesign to Cloudflare

The site runs on **Cloudflare Workers** through the **OpenNext adapter** (`@opennextjs/cloudflare`, which supports Next.js 16.4.1 and later). Every page is prerendered at build time. Cloudflare serves the HTML, the JavaScript, the fonts and the images from its edge locations close to each visitor. The Worker itself only handles the inquiry form's Server Action and image resizing.

**Cost:** the Workers Free plan covers this site. It includes 100,000 requests a day, and static assets are free and unlimited. Cloudflare Images' free tier includes 5,000 unique transformations a month.

---

## What's already set up in the repo

| File | What it does |
|---|---|
| `wrangler.jsonc` | Worker name (`drimindesign`), Node.js compatibility, static assets, image binding |
| `open-next.config.ts` | Cache: read-only static assets (pages served exactly as built, no extra Cloudflare products needed) |
| `public/_headers` | Long-term caching for `/_next/static/*`, a week for project and team images |
| `.dev.vars.example` | Local Worker variables (copied to `.dev.vars`, which is git-ignored) |
| `package.json` | `preview`, `deploy`, `upload`, `cf-typegen` scripts |
| `next.config.ts` | `initOpenNextCloudflareForDev()`, so `next dev` sees the Cloudflare bindings |

---

## Option A (recommended on Windows): deploy from GitHub

The OpenNext team doesn't guarantee its build on Windows. This route builds on Cloudflare's Linux machines instead, and redeploys automatically on every push.

### 1. Create a Cloudflare account
Sign up at <https://dash.cloudflare.com/sign-up> (free). Verify your email.

### 2. Put the project on GitHub
1. Create a **private** repository on GitHub, for example `drimindesign`.
2. Commit the project and push it. Your current local branch is `master`; push it as `main`:
   ```bash
   git remote add origin https://github.com/<your-username>/drimindesign.git
   ```
   ```bash
   git push -u origin master:main
   ```

### 3. Connect the repository in Cloudflare
1. In the Cloudflare dashboard, open **Workers & Pages** and choose **Create**.
2. Choose **Import a repository**, connect your GitHub account, and pick the `drimindesign` repository.
3. Fill in the build settings:

   | Setting | Value |
   |---|---|
   | Project name | `drimindesign` (must match `name` in `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | `npx opennextjs-cloudflare build` |
   | Deploy command | `npx opennextjs-cloudflare deploy` |
   | Root directory | `/` |

4. Under **Build variables**, add:

   | Variable | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `NEXT_PUBLIC_SITE_URL` | `https://drimindesign.<your-subdomain>.workers.dev` for now (your own domain later, see step 5) |

   `NEXT_PUBLIC_SITE_URL` feeds the canonical URLs, Open Graph tags, sitemap and robots.txt. It's read at build time.

5. Choose **Save and Deploy**. The first build takes a few minutes. When it finishes, the dashboard shows the live `*.workers.dev` URL.

From now on, every push to `main` redeploys the site. Pushes to other branches get their own preview URL.

### 4. Check the live site
- Open the `workers.dev` URL. Scroll through every section and send a test inquiry.
- In the Worker's **Logs** tab (observability is on), check for errors.

### 5. Attach your own domain
1. In the dashboard, choose **Add a domain**, enter your domain, and pick the **Free** plan.
2. Cloudflare shows two nameservers. At your domain registrar (GoDaddy, Namecheap, Hostinger…), replace the domain's nameservers with those two. This can take from minutes to a few hours.
3. Open **Workers & Pages → drimindesign → Settings → Domains & Routes → Add → Custom domain**. Enter `drimindesign.com` (and `www.drimindesign.com` if you want it).
4. Change the `NEXT_PUBLIC_SITE_URL` build variable to `https://drimindesign.com`, then redeploy (**Deployments → Retry deployment**, or push any commit).
5. Recommended domain settings:
   - **SSL/TLS → Overview:** Full (strict).
   - **SSL/TLS → Edge Certificates:** Always Use HTTPS on.
   - **Speed → Optimization:** leave Rocket Loader **off**, because it rewrites scripts and breaks the intro's pre-paint script.

---

## Option B: deploy from your computer

This works on macOS, Linux or WSL. On plain Windows it may work, but OpenNext doesn't guarantee it.

```bash
npx wrangler login
```
```bash
npm run deploy
```

`wrangler login` opens the browser once to authorise your account. `npm run deploy` builds with OpenNext and uploads the Worker.

---

## Testing the Workers build locally

```bash
npm run preview
```

This builds with OpenNext and serves the site in Cloudflare's local Workers runtime at <http://localhost:8787>. For day-to-day work, keep using `npm run dev`.

---

## Before launch

- **Inquiry storage:** submissions currently go to an in-memory store (`src/server/repositories/inquiry-repository.ts`), which loses everything whenever Cloudflare recycles the Worker. Pick a database before launch. **Cloudflare D1** (SQLite, free tier) fits naturally here; only the repository implementation changes. The appointment flow will need it too.
- **Email notifications** for new inquiries (provider TBD).
- **Rate limiting** is in memory per Worker instance. Add Cloudflare's rate-limiting rules or a KV-backed limiter if spam appears.

## Later: R2 cache (when pages need revalidation)

The static-assets cache serves pages exactly as built. When content needs to refresh without a redeploy (appointment availability, a CMS):

1. In the dashboard, open **R2**, enable it, and create a bucket, for example `drimindesign-cache`.
2. Add the binding in `wrangler.jsonc`:
   ```jsonc
   "r2_buckets": [{ "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "drimindesign-cache" }]
   ```
3. In `open-next.config.ts`, switch to `@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache`.

## Limits to keep in mind

- **Worker size:** 3 MiB compressed on the Free plan, 10 MiB on Paid. The build prints the size; the 3D code isn't part of it, because it ships as static assets.
- **Node middleware** isn't supported by OpenNext yet. This project doesn't use any.
- **Never export `runtime`** from a route. AGENTS.md already forbids it.

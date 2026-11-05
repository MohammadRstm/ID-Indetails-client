# Deployment

Development doesn't change and needs no Docker: `npm run dev`, with Vite proxying `/api` and `/hubs` to the API
(see the README). Docker is only for production. CI builds and checks the image, and the deployment runs it. The
deploy button lives in the **API repository**, which deploys both the API and this client.

## What runs in production

```
Browser ──HTTPS──▶ TLS proxy / load balancer (hosting) ──HTTP──▶ client container :8080 (nginx)
                                                                   ├─ /            the app (index.html, /assets)
                                                                   ├─ /api/*   ─┐
                                                                   └─ /hubs/*  ─┴─▶ API_UPSTREAM (the API container)
```

The browser must see the app and the API on **one origin**. The API calls are relative (`/api`), and the refresh
cookie is `SameSite=Strict` with `Path=/api/auth` (the client portal's own is on `/api/portal/auth`). That's why the
client's nginx proxies the API instead of the app calling another domain. The client portal's pages (`/portal/...`)
are part of the same app and need nothing more from nginx.

- **Image:** built from `Dockerfile`. `node:24-alpine` installs from the lockfile and builds; the runtime is
  `nginx-unprivileged` (uid 101, port 8080) with only the built files and `deploy/nginx/`.
- **Settings**, read when the container starts:

  | Variable | Example | Meaning |
  |---|---|---|
  | `API_UPSTREAM` | `http://api:8080` | Where `/api` and `/hubs` go. Without it the container refuses to start. Its host name must resolve when the container starts, so start the API first. |
  | `CONTENT_STORE_ORIGIN` | `https://<account>.r2.cloudflarestorage.com` | The origin of the file storage behind the client portal's files. The browser sends the files there directly and loads previews from it, so it is added to the policy's `connect-src`, `img-src` and `media-src`. Empty (the default) adds nothing. The storage bucket's own CORS rules must allow `PUT` from the app's origin. |

  Nothing about an environment is built into the bundle, so the same image runs everywhere. **Never pass secrets as
  `VITE_*` variables.** Vite builds them into the JavaScript that every visitor downloads, and CI fails a build that
  contains anything resembling a secret or a local address.
- **Health:** `GET /healthz` answers `ok` (nginx only; the API has its own). The image has a `HEALTHCHECK`.
- **Shutdown:** `SIGQUIT` lets nginx finish requests in flight.
- **Run it hardened:** read-only root filesystem, with writable tmpfs at `/tmp` and `/etc/nginx/conf.d` owned by
  uid 101, all capabilities dropped and `no-new-privileges`. CI runs it exactly that way. The site and its security
  headers are templates the image fills in when it starts, both into `/etc/nginx/conf.d` (the headers into its
  `snippets/` folder), so nothing else needs to be writable.

## What nginx does (`deploy/nginx/`)

- Serves the app and falls back to `index.html` for app routes (`/design/projects` and so on). A missing
  `/assets/*` file is a 404, which the app answers by reloading once onto the new build.
- **Caching:**
  - `index.html` is `no-cache`, so a deploy shows at once.
  - `sw.js` and `manifest.webmanifest` are `no-cache` too, so a new service worker is found at once (see
    [The installed app](#the-installed-app)). A missing `sw.js` is a 404, never `index.html`: a browser can't update or
    remove a worker whose file comes back as a page.
  - `/assets/*` (content-hashed names) is `max-age=31536000, immutable`.
  - Other files (the favicon, the icons, the offline page) are cached for 1 hour.
  - API answers are never cached or compressed by nginx.
- **gzip** for the app's text files.
- **Security headers** on every app response:
  - a strict `Content-Security-Policy` (same-origin only, plus `data:` and `blob:` images and media for avatars and
    uploads, inline styles for the toast library, and `CONTENT_STORE_ORIGIN` for the client portal's files);
  - `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `frame-ancestors`;
  - `Permissions-Policy` (no camera, location or payment; the microphone only on the app's own origin, for talking
    to Proton) and `Cross-Origin-Opener-Policy`.

  Talking to Proton needs no CSP change: the browser sends its connection offer to the API, and the voice audio
  itself travels over WebRTC, which `connect-src` doesn't cover.

  The app turns zod's code generation off (`src/main.tsx`), so the CSP needs no `unsafe-eval`.
- **WebSockets** for `/hubs`, kept open for up to an hour of quiet. Uploads are allowed up to 101 MB, matching the
  API's limit. A picture checked for the website's watermark (`/api/website/watermark-check`) is sent as it is, up to
  16 MB, the API's limit there. Any other API request is refused over 1 MB.
- **Logs** go to stdout **without query strings or referrers**. The live connection sends the access token as
  `?access_token=`, and sign-up and reset links carry their token in the page's query string. Configure the TLS
  proxy's logs the same way.

## The installed app

Staff can install the app on a phone or a computer: on Android through Chrome, on iOS through Safari's Share → Add to
Home Screen. It opens on its own, without the browser's bars, and it is the same app, signed in the same way. On iOS
the installed app keeps its own sign-in, apart from Safari's.

- **Installing from the app** (`src/app/pwa/install.ts`):
  - Chromium (Android, and computers) offers its own install prompt once, early. The app catches it as it starts
    (`main.tsx`) and holds back the browser's own install bar. "Install ID-Indetails" then shows that prompt.
  - iOS has no prompt, so "Install ID-Indetails" shows the Share → Add to Home Screen steps.
  - Both account menus have "Install ID-Indetails" while the browser can install the app. On phones, a banner above the
    page suggests it too. Using the banner or putting it away keeps it away for 30 days in that browser.
  - Opened from its icon, or once installed, the app offers nothing. A browser that can't install it (Firefox, or Safari
    on a Mac) shows nothing either.
  - Staff only, for now: the client portal's pages leave the manifest out, so the browser offers no install there. A
    client who adds a portal page to their home screen gets a plain shortcut to it. The portal is to become an app of
    its own.
- **Its files** are made by `vite-plugin-pwa` (`vite.config.ts`):
  - `manifest.webmanifest`: the name "ID-Indetails", opens at `/`, standalone, the top bar's colour, and the icons in
    `public/icons` (iOS takes `public/apple-touch-icon.png`, named in `index.html`);
  - `sw.js`, the service worker, built from `src/sw.ts` with Workbox's own modules (`tsconfig.sw.json` type-checks it).
- **What the worker keeps:** only `offline.html`, the icons, the favicon and the manifest, which are the same for
  everyone. It never keeps the app's pages or code (`index.html`, `/assets`), or anything from the API. Nobody's data
  is ever in its cache, so signing out has nothing to clear, and the next person on a shared phone sees nothing of the
  last.
- **What it does:** opening a page always goes to the network. Only when there is no connection does it show
  `offline.html` ("You're offline", with Try again). It never touches `/api`, `/hubs`, `/openapi` or `/healthz`, so
  the access token and the refresh cookie go past it as before.
- **Notifications on this device** (`src/app/pwa/push.ts`), in place of the phone app's (the API's
  `docs/notifications.md`, "Browsers"):
  - Both account menus have "Turn on notifications" where the browser can get them and the server sends them (its
    VAPID key is set). The browser asks permission from that tap, which iOS requires; there, only the installed app
    (iOS 16.4 or later) can get them. The installed app also shows a banner until they are on, which stays away 30 days
    once put away. "Turn off notifications" stops them; "Notifications blocked" means the person refused, and only the
    browser's site settings allow them again.
  - Turning them on subscribes with the server's public key and registers the subscription with the API for this
    session (`PUT /api/auth/web-push`). The app registers it again when it opens and after an hour away, so a new session
    keeps them, and subscribes again by itself if the server's key changed.
  - The browser remembers who turned them on: anyone else signing in there drops the subscription, and signing out
    forgets it (the API already stopped it with the session).
  - The worker shows every push (browsers may stop a site's pushes otherwise), silently during quiet hours where the
    browser allows it, and sets the icon's count; the open app keeps that count to what is unread.
  - A tap opens `/open-push` (`PushOpener`): a notification opens what the bell would and is marked read, a message its
    chat, a labour reminder the site's labour week; anything the person may not open goes to their notifications. An open
    window does this without reloading.
  - The installed app tells the API so at sign-in and on every refresh (`installedApp`), and its session then lasts 30
    days since last use, so the pushes keep coming while it isn't opened.
- **Updates:**
  - A deploy shows at the next load, as before, since the worker never serves the app.
  - `sw.js` is never cached: nginx says so, and the page registers it with `updateViaCache: "none"`. A new worker takes
    over at once.
  - An app left open (an installed app is mostly brought back rather than opened again) looks for a new worker at most
    once an hour when it comes back. It also checks for a new version of the app at most every 15 minutes
    (`src/app/pwa/newVersion.ts`), and the shell then offers to reload ("A new version of ID InDetails is ready"). It
    never reloads by itself, so nothing typed is lost.
- **Production builds only:** `npm run dev` and the tests register nothing. To try it locally, run `npm run build`,
  then `npm run preview` (`http://localhost:4173`). Browsers treat localhost as secure, and so does an Android phone
  reaching it through `chrome://inspect`'s port forwarding.
- **Removing the worker:** never by deploying a build without `sw.js`, or an older image, because browsers keep a
  worker whose file has gone. Build with `selfDestroying: true` in the plugin's options instead. Its `sw.js` unregisters
  itself and deletes its cache on every device that had it, after which the option and the files can go.
- **Security headers:** the CSP needs nothing more. The worker falls under `script-src 'self'` and the manifest under
  `default-src 'self'`.

## CI (`.github/workflows/ci.yml`)

CI runs on every pull request to `main` and on every push to `main`. It publishes and deploys nothing.

1. **verify:**
   - `npm ci`, `tsc -b`, `eslint`, `vitest run` and `vite build`;
   - a scan of the bundle for secrets, local addresses and source maps;
   - `npm audit --omit=dev --audit-level=high`, which fails on high or critical advisories in what ships to the
     browser.
2. **image:**
   - builds the image without pushing it, then runs it read-only;
   - checks the non-root user, `/healthz`, the deep-link fallback, the cache and security headers, the service
     worker's and the manifest's types and cache headers, and that a missing asset is a 404;
   - checks the container refuses to start without `API_UPSTREAM`;
   - a Trivy scan that fails on fixable high or critical issues.

The Actions are pinned to commit SHAs. `.github/dependabot.yml` opens weekly grouped update PRs for npm, the base
images and the Actions, and those are merged by hand.

## Deploying (from the API repository)

The API repository's manual workflow deploys the client. For the client it needs to:

1. Check out this repository at the chosen ref (a commit, `main` or a `v*` tag), and build `Dockerfile`, or pull an
   image it published earlier.
2. Tag the image with the commit (`sha-<short>`, plus `vX.Y.Z` for a release tag). Never overwrite a tag, so a
   rollback is just redeploying an earlier tag.
3. Run it beside the API with `API_UPSTREAM` pointing at the API's private address, behind the TLS proxy, and wait
   for `/healthz` before switching traffic.

## Before the first production deployment (API and hosting)

These are outside this repository, and the client can't enforce them:

- **API behind a proxy:**
  - forwarded headers (`UseForwardedHeaders`, trusting the client container), so HTTPS redirection, rate limits and
    logs see the visitor and not nginx;
  - the refresh cookie `Secure`;
  - `Email:BaseUrl` set to the public address, for invitation and reset links;
  - CORS can stay closed, since the browser never calls the API cross-origin.
- **Hosting:**
  - TLS and HSTS at the edge, with HTTP redirected to HTTPS;
  - only the client container exposed (the API and MySQL stay on a private network);
  - edge logs without query strings.

## Branch protection (GitHub settings)

On `main`: require a pull request and the CI checks **Types, lint, tests and build** and **Docker image**, and block
force-pushes. Set the default `GITHUB_TOKEN` permission to read (the workflow asks for nothing more).

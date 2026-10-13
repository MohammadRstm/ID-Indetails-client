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
  - `/assets/*` (content-hashed names) is `max-age=31536000, immutable`.
  - Other files (the favicon) are cached for 1 hour.
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
  API's limit.
- **Logs** go to stdout **without query strings or referrers**. The live connection sends the access token as
  `?access_token=`, and sign-up and reset links carry their token in the page's query string. Configure the TLS
  proxy's logs the same way.

## CI (`.github/workflows/ci.yml`)

CI runs on every pull request to `main` and on every push to `main`. It publishes and deploys nothing.

1. **verify:**
   - `npm ci`, `tsc -b`, `eslint`, `vitest run` and `vite build`;
   - a scan of the bundle for secrets, local addresses and source maps;
   - `npm audit --omit=dev --audit-level=high`, which fails on high or critical advisories in what ships to the
     browser.
2. **image:**
   - builds the image without pushing it, then runs it read-only;
   - checks the non-root user, `/healthz`, the deep-link fallback, the cache and security headers, and that a
     missing asset is a 404;
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

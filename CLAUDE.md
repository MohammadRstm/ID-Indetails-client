# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This project is for ID-InDetails, a company whose staff include architectural engineers. This repository is the web client of the internal system being built for the company (internal codename "Hourline"). It covers:

- **Hours** that employees log against projects, with timers, overtime and hours balances.
- **Financial management**: project money, costs, invoices and payments, salaries, company expenses and financial reports.
- **Project management**: projects, clients, requirements, meetings, activity and a client portal where clients follow their project.
- **Proton**, the system's AI assistant, which answers questions and can fill in forms.
- **Domains**, the company's businesses: **Design** (architectural design work, which runs on logged hours) and **Execution** (construction sites, which run on materials, weekly labour and client statements).
- **Services** run from the same system: the company **Website** (its projects, services, locations, contact and analytics), with **Social media** and others planned.
- A **Company** area above the domains, for super admins: overview, salaries, schedules, settings and permissions.

The client talks to the separate ASP.NET API ([ID-Indetails-api](https://github.com/MohammadRstm/ID-Indetails-api)) and ports an approved prototype screen by screen. `docs/build-plan.md` holds the rules, the phases and a long list of past decisions ("Notes and open items"). Check it before changing behaviour that looks odd: most quirks there are deliberate.

## Start here

Read this, in every new session, before planning or changing anything.

### The repositories

| Repo | Local checkout | What it is |
|---|---|---|
| Client (this one) | `C:\Users\masst\Desktop\Ident-Internal-Management-System-client` (`main`) | React 19 + TypeScript + Vite + TanStack Query |
| API | `C:\Users\masst\source\repos\ID-Indetails` (`master`) | ASP.NET Core .NET 10 + MySQL. Its CLAUDE.md section 0 explains the business. Its `docs/` describe every endpoint and rule. |
| Website | `C:\Users\masst\Desktop\id-indetails-website` (`master`) | The public website. Admins manage its content from this client's Website area. It has its own CLAUDE.md. |
| Prototype | `C:\Users\masst\source\repos\hourline` | The approved HTML/JS prototype that every screen ports. **Read-only: never change, branch, commit or push it.** |

A feature usually needs the API and the client together: one `MR-<Topic>` branch and one PR in each. The API PR merges first.

### What to read before working on a feature

1. [docs/build-plan.md](docs/build-plan.md): the rules, the phases and "Notes and open items". Many oddities are deliberate decisions recorded there.
2. **The API doc for the area**, in the API repo's `docs/`, e.g. `projects.md`, `execution.md`, `finance.md`, `billing.md`, `design.md`, `authorization.md` or `website.md`. It lists every endpoint, its permission and its rules. The client follows it and never adds rules of its own.
3. **The prototype screen you're porting or changing.** It is in `hourline/js/` (and `hourline/css/` for the look). The files are named by area, for example:
   - `55-project.js`, `56-project-finance.js` for the project page and its money;
   - `54-materials.js`, `54-labour.js`, `54-exec-money.js` for Execution sites;
   - `57-billing.js`, `57-statement.js` for invoices and statements;
   - `65-financials.js`, `66-company.js`, `67-salaries.js` for money and the company area;
   - `70-employee.js`, `72-workday.js`, `76-hours-ledger.js`, `78-my-pay.js` for people, hours and pay;
   - `75-messages-*.js` for messages.

   Copy its markup and class names. Don't redesign.
4. **The existing code of that area** in `src/domains/<area>`: its `*Api.ts` hooks, then its pages and tests. Reuse the shared components in `src/shared/components` before writing new ones.

### Changes that always come together

- **An API shape change:**
  - start the API, then run `npm run api:types` to regenerate `src/api/schema.d.ts`;
  - never edit that file by hand;
  - if the regeneration drops types from API work that isn't merged yet, merge only your additions.
- **A new screen or route:**
  - add it in `src/app/routing/routeTable.tsx` (admin and employee pages and the access rule) and `routing/pages.ts` (lazy load);
  - update the pins in `routing/permissionMatrix.test.ts` and the sidebar lists in `routing.test.tsx`.
- **A new permission:** add it to `P.*` in `src/app/permissions/codes.ts`, `src/test/personas.ts` (each role's defaults, matching the API's `PermissionCatalog`) and its wording in `src/domains/shared/settings/permissionWords.ts`.
- **New queries:**
  - put the query key in `src/api/keys.ts`;
  - make the mutations that change that data invalidate it, e.g. billing changes also invalidate `keys.box`.
- **Forms** show each validation error live, next to its field (`useFormErrors`, `FieldError`). Money amounts use `AmountField`, which shows commas as you type.

### Working on this machine

- **One core, low priority.** The development laptop shuts down under load, and other sessions may be running checks.
  - Run `npx vitest run --maxWorkers=1 --no-file-parallelism <files>`, only for the files you touched.
  - Run `tsc -b` and `eslint` the same way.
  - CI runs the whole suite.
- The first test or two of a page-heavy file can time out locally on a cold start. Re-run before treating it as a failure.
- **Deploying** is by hand from the API repo (Actions → Deploy). Never start it unless asked.

### Known quirks

- **Testing:**
  - MSW fails any request without a handler. A test's own handlers come before `siteHandlers` and `shellHandlers`.
  - The shared `Select` renders `role="option"` items. Click the select's label, then the option.
  - Edit JSON fixtures in `src/test/fixtures` by hand, with minimal diffs. Re-serialising them rewrites the whole file.
- **ESLint `react-refresh/only-export-components`:** a component file exports only components. Put helpers and constants in a `*Api.ts` or a plain `.ts` file.
- **`clickable(..., "link")`** sets `role="link"`. Wrap the element in another element if it must also be a `listitem`.
- **Execution employees** (site staff) see only Daily log, My sites and Profile. Design-only pages use `designOnly(...)` in the route table, and Execution-only pages use `executionOnly(...)`.

## Commands

- `npm run dev`: Vite at http://localhost:5173 (strict port). It proxies `/api`, `/hubs` (WebSocket) and `/openapi` to the API at `https://localhost:7187`, or to `HOURLINE_API` if set. The API must be running for the app to work. Tests don't need it.
- `npm run build`: `tsc -b` and then `vite build`.
- `npm run lint`: ESLint. `npm run lint:summary` prints a short summary.
- `npm test`: Vitest, run once. `npm run test:watch` re-runs on change.
- Single file: `npx vitest run src/app/routing/routing.test.tsx`. Single test: add `-t "test name"`.
- `npm run api:types`: regenerates `src/api/schema.d.ts` from the running API's OpenAPI document. Don't edit `schema.d.ts` by hand.
- `node scripts/seed-dev.mjs`: seeds an empty dev database through the API. It needs `SETUP_KEY` and Mailpit.

Vitest is capped at 2 workers with a 15s timeout because the development laptop crashes under heavy load. Don't raise those limits or start large parallel runs.

CI (`.github/workflows/ci.yml`) runs `tsc -b`, lint, tests and `vite build`, then fails if the bundle contains `localhost:<port>`, `127.0.0.1`, secret-like strings or source maps.

## Architecture

The path alias is `@/` → `src/`.

- **`src/api`**: `http.ts` (axios) keeps the access token in memory only (`tokenStore`). On a 401 it refreshes once through the `/api/auth` refresh cookie and retries; refreshes are coordinated within a tab and across tabs. Errors come back as `ApiError` (status, code, message, field errors). `keys.ts` is the single query-key scheme: every key starts with its area (`["projects", ...]`), and mutations list what they invalidate with `useInvalidate`. `download.ts` fetches files, PDFs and CSVs as blobs because they need the token.
- **`src/app`**: the shell, the session, live updates (`app/live`, SignalR on `/hubs/live`) and permissions (`permissions/codes.ts` has the `P.*` codes, plus `usePermissions()` and `<Can>`). `routing/routeTable.tsx` lists every screen once, with the admin page and the employee page and what each needs. The route guard and the sidebar both read it. `routing/pages.ts` lazy-loads every page as its own chunk, and reloads once if a chunk is missing after a deploy.
- **`src/domains`**: the screens, by business area: `design`, `execution`, `company`, `website`, and `shared` (anything both Design and Execution use, such as projects, clients, finance, billing, people, meetings and messages). Each area holds its own React Query hooks (`*Api.ts`), components and pages.
- **`src/portal`**: the client portal at `/portal`. It has its own session, top bar and pages, outside the staff guards and shell.
- **`src/auth`**: sign-in, password flows and invitation acceptance.
- **`src/shared`**: the UI kit (`components/*`), charts, the prototype's icon set, formatting (dates in the company's time zone, durations, money) and the theme.
- **`src/styles`**: `hourline.css` is the prototype's stylesheet, used unchanged as the design system. Components render its markup and class names. Put client-only adjustments in `client.css`. Don't restyle or invent new looks: screens must look exactly like the prototype.

Rules that hold everywhere:
- **The client never calculates money, overtime or access rules.** Every figure comes from the API, which enforces every rule. The client only hides what the person's permissions (from `GET /api/auth/me`) don't allow.
- Every route, nav item, action and money figure is gated by permission codes.
- Repeated UI patterns are one shared component under `src/shared`. Pages compose them.
- Loading shows skeletons. A failure shows a small inline error with a retry where it helps. Toasts are only for the outcome of an action the person just took (the prototype's own toast, not `sonner`).

## Tests

Tests use Vitest, Testing Library and jsdom. `src/test/setup.ts` starts MSW with `onUnhandledRequest: "error"`, so every API call a test triggers needs a handler. It also mocks `@microsoft/signalr` with `src/test/liveHub.ts`; send live signals with `live.emit`.

- `renderApp(path, user, ...handlers)` (`src/test/renderApp.tsx`) renders the whole app signed in at a route. `shellHandlers` answer the calls every page makes, and a test's own handlers take precedence over them.
- `src/test/personas.ts` has the six kinds of user (superAdmin, designAdmin, executionAdmin, designEmployee, executionEmployee, websiteAdmin) with the API's default permissions, and `withPermissions` for variants. Pages are tested as each relevant persona.
- `src/app/routing/permissionMatrix.test.ts` pins what each persona gets on every route. A route-rule change shows up there and must be updated on purpose.
- Shared fixtures are in `src/test/fixtures`.

## Conventions

- Comments, commit messages and UI text are plain, descriptive English, written from the user's point of view (e.g. "Let the website's description boxes grow to 25 rows as they're typed in"). Match that voice.
- Work happens on `MR-<Topic>` branches with one PR per piece of work into `main`. Deployment is started by hand from the API repository (`docs/deployment.md`). In production, nginx (`deploy/nginx`) serves the build and proxies `/api` and `/hubs`.

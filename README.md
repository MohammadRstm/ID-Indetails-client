# ID InDetails client

The web app for ID InDetails, the company's internal project, time and money platform. It talks to the ID InDetails API ([ID-Indetails-api](https://github.com/MohammadRstm/ID-Indetails-api)), and ports the approved prototype screen by screen. [docs/build-plan.md](docs/build-plan.md) has the plan and progress.

## Running it

1. **Start the API** in Development with its `https` profile, at `https://localhost:7187`. The API's `docs/local-development.md` explains how.
2. **Install and start the client:**

   ```bash
   npm install
   ```

   ```bash
   npm run dev
   ```

   The app is at http://localhost:5173. Vite proxies `/api`, `/hubs` and `/openapi` to the API, so the browser sees one origin and the refresh cookie works. To point it at another API, set `HOURLINE_API`.

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build |
| `npm run lint` | ESLint |
| `npm test` | Tests, once (Vitest, at most 2 workers) |
| `npm run test:watch` | Tests, re-run on change |
| `npm run api:types` | Regenerates `src/api/schema.d.ts` from the running API's OpenAPI document |
| `node scripts/seed-dev.mjs` | Fills an empty development database with a sample company through the API. Needs `SETUP_KEY` (the API's `Setup:SuperAdminKey`) and Mailpit. Writes the accounts to `dev-accounts.local`, which is git-ignored |

## How it's built

- **`src/api`: talking to the API.**
  - `http` sends the access token, which is kept in memory only. On a 401 it refreshes once and repeats the request. Refreshes never overlap, within a tab or across tabs.
  - Failures are `ApiError`s: status, code, message and field errors, from the API's uniform error body.
  - `schema.d.ts` holds the API's types, generated from its OpenAPI document; `types.ts` names the common ones.
  - Files, PDFs and CSVs are fetched as blobs (`download.ts`), since they need the token too.
- **`src/styles`: the prototype's stylesheet, unchanged.** It is the design system, so the client looks exactly like the prototype. `fonts.css` points its font tokens at the bundled Archivo and Martian Mono.
- **`src/shared`: what every screen uses.**
  - The UI kit and charts, ported from the prototype.
  - Icons: the prototype's own set.
  - Formatting in the prototype's style: dates and times in the company's time zone, durations and money.
  - The light and dark theme (dark by default).
- **`src/domains`: the screens.**
  - `design`, `execution` and `company` hold what only that area has.
  - `shared` holds what both domains use: projects, clients, financials, invoices, people and meetings.
  - Each area holds its React Query hooks, components and pages.
- **`src/auth`: signing in and out.** Sign-in, the password flows and accepting an invitation.
- **`src/app`: the frame around the screens.**
  - The app shell and the session.
  - Permissions: `usePermissions()` and `<Can>`.
  - The route table (`routing/routeTable.tsx`). Every screen is listed once, with the permission it needs. The route guard and the sidebar both read it.
- **`src/services`: app-wide services,** such as live updates.

The client never calculates money or decides access. Every figure comes from the API, and every rule is enforced there. The client hides what someone can't see or do, based on the permissions `GET /api/auth/me` returns.

## Tests

- Vitest with Testing Library, in jsdom.
- MSW stands in for the API. A request with no handler fails the test.
- Pages are tested as each kind of user (super admin, Design and Execution admins and employees), to check what they can and can't see.

# Hourline client: build plan

The React client for the Hourline API (`ID-Indetails-api`). It ports the approved prototype (the `hourline` folder) screen by screen. The user approved this plan on 30 Sep 2026.

## Rules

- **It looks exactly like the prototype.** The prototype's stylesheet is the design system and is used as-is (`src/styles/hourline.css`). Components render the prototype's markup and class names. Nothing is restyled.
- **Reusable components.** Every pattern the prototype repeats (tables, filter bars, KPI strips, pills, period pickers, steppers, pagers, person chips, modals, charts) is one shared component under `src/shared`. Pages compose them.
- **Permissions everywhere.**
  - Every route, nav item, action and money figure is gated by the permission codes from `GET /api/auth/me`, through `usePermissions()` and `<Can>`.
  - Routes declare what they need in one table. The route guard and the sidebar both read it.
  - The layout (admin or employee workspace) follows the role; each figure and action follows permissions.
  - The server enforces everything regardless; the client gating keeps people from seeing or trying what they can't do.
- **Server data through React Query.**
  - One query-key scheme per area and a hook per endpoint.
  - Mutations invalidate a fixed list of queries.
  - The client never calculates money.
- **Loading and errors.**
  - Loading skeletons where content is on its way.
  - Small inline error texts next to what failed, with a retry where it helps.
  - Toasts only for the outcome of an action the person just took.
- **Backend features the prototype lacks get screens** in the prototype's style. Examples: managing a person's individual permissions, the invitation, password and change-password flows, exchange rates, teams.
- **Avatars:** DiceBear "Notionists" (CC0), bundled and generated from the person's name, as in the prototype. Uploaded photos win.
- **Workflow:** one branch and one PR per phase. When a phase is done, the tests are run, then the PR is opened and merged.

## Stack

- React 19, TypeScript, Vite, React Router, TanStack Query, zod (forms).
- Tests: Vitest, Testing Library, MSW. Vitest runs with at most 2 workers, because of load limits on the development laptop.
- API types are generated from the API's OpenAPI document (`npm run api:types`), with the API running in Development.
- Live updates: `@microsoft/signalr` on `/hubs/live`.
- In development, Vite proxies `/api`, `/hubs` and `/openapi` to the API (`https://localhost:7187`), so the refresh cookie is same-origin.

## Phases

- [x] **0. Foundations:**
  - repo history;
  - test tools, API types, the proxy, path aliases;
  - the prototype stylesheet, fonts and icons;
  - docs.
- [ ] **1. Sign-in and app shell:**
  - sign in, session restore and refresh, change password, forgot and reset password, accept an invitation;
  - the permission model;
  - the route table and guards;
  - sidebar and top bar, the company launcher and switching domain;
  - error pages.
- [ ] **2. Shared UI kit and charts.**
- [ ] **3. Projects and clients:**
  - project list with totals, creating a project;
  - the project header and status changes;
  - requirements and meetings;
  - clients;
  - the search palette.
- [ ] **4. Design work:**
  - employee home, log work with the overtime preview, the timer;
  - my work, my pay, entries and comments;
  - project overview, analytics and timeline;
  - people and profiles;
  - activity, reports, the overview board.
- [ ] **5. Money:**
  - financials, project money, expenses;
  - invoices, payments;
  - billing settings, exchange rates;
  - the project report.
- [ ] **6. Execution:**
  - sites, materials, labour weeks, pricing, site money;
  - statements;
  - the Execution employee views.
- [ ] **7. Company and settings:**
  - company overview, overhead, salaries and excuses, project pay, schedules, working time;
  - company, domain and billing settings, the logo, teams, invitations;
  - managing a person's permissions.
- [ ] **8. Messages, notifications and live updates.**
- [ ] **9. Hardening:**
  - accessibility, responsive layouts, light and dark;
  - code-splitting;
  - the full permission matrix;
  - a final pass against the API.

## Left out on purpose

Everything that only served the demo:
- the persona sign-in and account switcher;
- the demo guide and demo clock;
- seed data, local save and "reset data";
- "Appear offline", which has no API support;
- the prototype's unused components (`EX.PricingModal`, `EX.SiteBreakdown`, `UI.ShortHoursAlert`).

## Notes and open items

Decisions made along the way, and anything skipped because it needs the user's input, are listed here as the work goes on.

- **Styles.** The plan said "CSS Modules per component". To keep the look identical, the prototype's stylesheet is used whole instead, and components render its class names.
- **Toasts.** The template's `sonner` is replaced by the prototype's own toasts, which look different.
- **Avatars.** DiceBear's Notionists artwork is CC0 1.0 and its code MIT, so it is bundled (v9, as in the prototype). No backend storage is needed: an avatar is drawn from the person's name, identically for everyone.
- **API types.** `openapi-typescript` only lists TypeScript 5 as a peer, so `package.json` overrides it to use the repo's TypeScript 6. It only uses the compiler to print the file.
- **Folders.** The repo already had empty placeholder folders: `src/domains/{design,execution,company}/…`, `src/shared/components/{Charts,Data-Tables,Feedback,Forms}`, `src/auth` and `src/services`. The code follows that layout instead of the planned `features/`. Anything both domains share goes in `src/domains/shared`.
- **Missing permissions.**
  - A route the person's workspace has no page for (an employee opening an admin page) sends them home, as the prototype does.
  - A page their permissions don't cover says so, with a link home.
- **Sample data.** `scripts/seed-dev.mjs` fills the development database through the API. The one thing the API can't do is backdate a join date (it is the day an invitation is accepted), so the sample staff's join dates are moved back in the database directly, as the API's own integration tests do. The database was backed up before seeding (`%USERPROFILE%\mysql-backup-2026-09-30-before-client-seed.sql`).
- **Strict numbers in the API** (API PR #27). JSON numbers are strict there, so the generated types say `number`, not `number | string`.

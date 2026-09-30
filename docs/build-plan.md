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
- [x] **1. Sign-in and app shell:**
  - sign in, session restore and refresh, change password, forgot and reset password, accept an invitation;
  - the permission model;
  - the route table and guards;
  - sidebar and top bar, the company launcher and switching domain;
  - error pages.
- [x] **2. Shared UI kit and charts.** Every piece is on the development-only page `/dev/kit`.
- [x] **3. Projects and clients:**
  - project list with totals, creating a project;
  - the project header and status changes;
  - requirements and meetings;
  - clients;
  - the search palette.
- [x] **4. Design work**, in parts:
  - [x] 4a-1: the employee home, log work with the drag timeline and the overtime preview, the timer, an employee's project;
  - [x] 4a-2: my work (both domains), my pay, the hours balance and the behind-on-hours notice;
  - [x] 4b-1: a Design project's overview for admins: work KPIs, contributors and their drawer, the work timeline, analytics, the entry window and comments;
  - [x] 4b-2: the project Timeline tab: the project at any moment, progress and status over time, the history day by day, and a day as cards;
  - [x] 4c-1: employees, Add employee, someone's profile and your own, Edit profile with pay from a date;
  - [x] 4c-2: activity and reports;
  - [x] 4c-3: the overview board and the client page's recent activity.
- [x] **5. Money**, in parts:
  - [x] 5a: Design's financials: overview, projects, clients and costs;
  - [x] 5b: a project's money: the money band, cost curve, customer payment, expenses and closing out;
  - [x] 5c: invoices and payments, and the Financials billing tab;
  - [x] 5d: the project report. Billing settings and exchange rates moved to phase 7: the prototype keeps them in Settings → Finance.
- [ ] **6. Execution**, in parts:
  - [x] 6a-1: a site's overview for admins: its KPIs, project money, the fee and material profit, payments on account, ground labour and profit;
  - [x] 6a-2: materials: the table edited in place and the Add materials sheet;
  - [x] 6a-3: weekly labour and its defaults;
  - [x] 6a-4: client statements;
  - [x] 6b: the Execution employee views and profile;
  - [ ] 6c: Execution's dashboard, financials and people.
- [ ] **7. Company and settings:**
  - company overview, overhead, salaries and excuses, project pay, schedules, working time;
  - company, domain and billing settings (terms, bank details), exchange rates, the logo, teams, invitations;
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
- the prototype's unused components (`EX.PricingModal`, `EX.SiteBreakdown`, `UI.ShortHoursAlert`, and the single-material edit form behind `EX.MaterialModal`, which nothing opens: the materials table is edited in place).

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
- **Quirks mode.** The prototype's page has no doctype, so browsers draw it in quirks mode, where tables don't inherit the page's line height. The client stays in standards mode; one rule in `client.css` gives tables the prototype's line height, and the shell and table heights were measured against the prototype to match.
- **Screens that link ahead.** A few phase 3 screens point at pages from later phases:
  - "Send message" on a profile opens `messages?to=`, which arrives with phase 8.
- **The project history** is rebuilt in the client from the API's timeline, entries and events (`history.ts`), as the prototype's engine did. People's "role" there is their team.
  - Its earliest moment is the earliest of the project's creation, start and first work. The sample data records "project created" when it was seeded, after the backdated work.
  - In a day's cards each team keeps one colour for the whole project; the prototype's hashing gave two teams the same colour.
- **Demo-only words.** The burn-up chart's note drops the prototype's "this prototype has no hour budgets yet. Ask for them…".
- **Project margin filter.** The prototype's "Any margin" filter isn't there: filtering and sorting by money stay on the server's list (decision M7).
- **Export report for Execution.** The API's project report covers Design work (hours, people and their labour), so an Execution site's header and row menu leave it out. The site's document for the client is its materials statement (6a-4).
- **Overtime is the API's.** The client never works out overtime itself: every log form and the drag timeline ask `/api/me/overtime-preview`, a moment after the time stops changing, so the rule lives in one place.
- **The timer** remembers when it started in the browser (per person), so a reload keeps it running; stopping it opens Log work with the times filled in.
- **Profiles.** Someone's profile follows the prototype: the hours balance is for people with salary:view (the super admin), the cost panel for financial:view, and Edit profile for employee:manage (position and team) or employee:pay_manage (pay from a date on).
- **Activity and Reports.** The feed's words live in one place (`feedWords.ts`), shared with the client page's recent activity. Every sentence reads as well without the amounts people without financial:view don't get, and events the prototype never had (requirements, meetings, teams, permissions) are worded in its voice. Everyone's work (the Work logged filter, today at a glance, online now, the entries tab and Export) needs work_entry:view_all; the Money tab needs financial:view.
  - Client events now name their client (API PR #29), and the feed, the report and the timesheet export name clients by their display name, as the rest of the API does (API PR #30).
  - A quarter that hasn't started yet reports on its first day; the prototype asked for a range ending before it began.
  - The entries tab loads 50 at a time; the prototype showed 25 first.
- **The project report.** Its preview is laid out as the server's PDF is, section by section, so it shows what the PDF holds: the prototype's "Performance" charts and the employees' positions aren't in the PDF, so they are left out of the preview and the section list. The PDF and the CSV of the range's entries come from the API; arrays in query strings now go as repeated keys (sections=a&sections=b), as ASP.NET reads them.
- **Invoices and payments.** The invoice document is drawn on screen from the invoice, laid out as the server's PDF (MigraDoc) is, so the editor's live preview and the invoice window show what the client receives; the PDF button downloads the server's file. Email is really sent, by the server, with the PDF attached, so the prototype's "email delivery is simulated" note is replaced by how sending works; WhatsApp opens the chat with the message ready, as in the prototype. Sending a draft issues it first. The billing windows open through the link (?invoice=, ?edit=, ?send=, ?pay=), so an invoice can be linked to from anywhere. The register shows the latest 100 invoices.
- **A project's money.** The money band, financial breakdown and the two cost charts (inside Analytics, as in the prototype) come from the project's money and its cost timeline. The customer payment asks for a client when an internal project becomes client work, since the API needs one. An expense row opens a small "Remove this expense?" for people with expense:manage while the project is open: the prototype had no way to take back a mistaken expense. Execution's fee and materials arrive with phase 6.
- **Financials.** "All time" asks from 1 January 2000, since the API's default period is this quarter. The hours behind the labour cost come from the API (API PR #32). The export is the API's CSV of the period's projects. Execution's financials arrive with phase 6.
- **The overview board.** Each person's card order is saved on the server (`/api/me/board-layouts/overview-design`) instead of the prototype's browser storage, so it follows them to any browser; the prototype's "Export JSON" button, there to hand the layouts over while it had no server, is left out. Whether "Needs attention & deadlines" is folded stays in the browser, as in the prototype. The period's people, projects and this week's hours come from the API (API PR #31). Execution's dashboard arrives with phase 6.
- **A site's money.** The figures come from the project's money, and the week-by-week cash and the projection of when profit reaches zero from `/site-money/timeline`, so the rule lives in the API. "Fee & material profit" previews the new agreed amount over every material (fetched a hundred at a time); a material on a client statement keeps its price when the markup changes, as the API freezes it. A site takes payments on account, so Record payment is there before anything is invoiced, and a new invoice starts from what is still owed less what is invoiced and unpaid, as in the prototype.
- **Materials.** The filters, totals and pages (30 a page) come from the API, as do who may change a row (`canEdit`) and whether new ones can be added (`canAdd`). A material on a client statement keeps its type, cost and price, and can't be removed, since the API freezes it; its supplier and note can still change, and the row says why the rest is locked. Client prices and the material profit are shown to people who see money, and set only with project:pricing_manage while the site is open. A cell saves only what was typed in it, and a saved material goes straight into the loaded list, so a quick run of changes along a row never starts from a list that is still being fetched. The Add materials sheet sends a hundred rows at a time, the API's limit.
- **Weekly labour.** The weeks, the days a week not yet reported starts with (the defaults in force on each day, up to today) and who may change a week all come from the API. The prototype let anyone reporting on an open site change the defaults; the API keeps that to labour_report:manage, so for everyone else the defaults bar shows the numbers without fields. Saving a week or the defaults doesn't wait for the panel to refresh, so the confirmation isn't lost when the panel is drawn again from the fresh defaults.
- **Client statements.** The builder's preview is the API's own (`/statements/preview`), so it shows exactly what will be made, and the document is laid out as the server's PDF is: one table, with the earlier and new columns when earlier materials are in, and the client's name under "Prepared for", as the PDF has it. The prototype's two tables (new materials, then earlier ones) and the contact lines aren't in the PDF, so they aren't in the preview. Save PDF downloads the server's PDF, where the prototype opened the print window, and records a download for people with statement:send. Email really goes out, from the server, with the PDF attached, and WhatsApp opens the chat, as for invoices. An earlier type says how many of its deliveries were on earlier statements rather than naming them, since the materials list doesn't say which statement each was on. Making a statement numbers it and freezes its prices for good, so none were made against the development database while building this; the tests cover it.
- **Execution staff.** An Execution employee's home and site page are built around what they record: their cards come from the project list and `/projects/site-summary` (materials so far, and when they last recorded there), since `/api/me/projects` is built on logged work, which Execution staff don't have. The rows now carry their description (API PR #33). The site page has the same Materials and Weekly labour panels as the admin's, and every money figure stays out. A person's profile shows what they recorded (`/site-records`): the totals, the value week by week, the sites and the latest records. The prototype's "New" badge on a card isn't there: the project list doesn't say when a project was created.
- **Amounts keep what is typed.** The prototype's amount field turned "42." back into "42" as it was typed, so no amount with cents could be entered; the client's keeps the text as typed.
- **The account menu opens upwards.** The prototype opened it downwards from the foot of the sidebar, so on any page longer than the window it was drawn below the screen and Sign out was out of reach.
- **Your own phone** (API PR #28). The session now carries the phone, so editing your own name no longer sends an empty phone back.
- **Strict numbers in the API** (API PR #27). JSON numbers are strict there, so the generated types say `number`, not `number | string`.

### API follow-ups

Small API changes the screens would use. Until they're made, the client works around them.

- **Hours logged this quarter.** The prototype's project list says "… · 6,907h logged this quarter"; no cheap endpoint gives that total, so the line stops at the project counts.
- **The last activity on an employee's project cards lacks its length.** The prototype says "Sarah logged 2h · 3 hours ago"; `/api/me/projects` gives who and when, so the card says "Sarah logged work · 3 hours ago".
- **Your own profile lacks your join date.** The session doesn't carry it (only `/api/employees/{id}` does, with employee:view), so your own profile leaves out "Joined …" and the "since …" under Total recorded.
- **The meetings list has no domain filter.** Someone who sees both domains gets both domains' meetings; the Meetings page keeps its own domain's by project.

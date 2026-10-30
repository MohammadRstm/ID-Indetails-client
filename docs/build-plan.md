# ID InDetails client: build plan

The React client for the ID InDetails API (`ID-Indetails-api`). It ports the approved prototype (the `hourline` folder) screen by screen. The user approved this plan on 30 Sep 2026.

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
- [x] **6. Execution**, in parts:
  - [x] 6a-1: a site's overview for admins: its KPIs, project money, the fee and material profit, payments on account, ground labour and profit;
  - [x] 6a-2: materials: the table edited in place and the Add materials sheet (now the cost-only Expenses list, see "Expenses" below);
  - [x] 6a-3: weekly labour and its defaults;
  - [x] 6a-4: client statements, replaced by BOQs and VOs in the Execution BOQ rework (see "BOQs and VOs" below);
  - [x] 6b: the Execution employee views and profile;
  - [x] 6c-1: Execution's dashboard and financials;
  - [x] 6c-2: Execution's people: nothing to build. The prototype has no Employees, Activity or Reports page for Execution ("all built on logged hours"), and neither does the client; a person's profile is reached from their name.
- [x] **7. Company and settings**, in parts:
  - [x] 7a: Settings: the company, time tracking and working time, finance and invoicing (terms, numbering, bank details, exchange rates), projects, notifications, teams, admins & access with each person's permissions, data & export;
  - [x] 7b-1: the company overview and company expenses;
  - [x] 7b-2: salaries and excused hours;
  - [x] 7b-3: project pay and schedules.
- [x] **8. Messages, notifications and live updates**, in parts:
  - [x] 8a: the live connection, the bell and the notifications page;
  - [x] 8b: messages: the chat icon's list and the Messages page.
- [x] **9. Hardening**, in parts:
  - [x] 9a: a pass against the API: every endpoint the client never called was either given a screen (below) or noted;
  - [x] 9b: code-splitting;
  - [x] 9c: the full permission matrix;
  - [x] 9d: accessibility, responsive layouts, light and dark.

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
- **Export report for Execution.** The API's project report covers Design work (hours, people and their labour), so an Execution site's header and row menu leave it out. What a site's client receives are its client BOQ and its VOs, as PDFs (see "BOQs and VOs").
- **Overtime is the API's.** The client never works out overtime itself: every log form and the drag timeline ask `/api/me/overtime-preview`, a moment after the time stops changing, so the rule lives in one place.
- **The timer** remembers when it started in the browser (per person), so a reload keeps it running; stopping it opens Log work with the times filled in.
- **Profiles.** Someone's profile follows the prototype: the hours balance is for people with salary:view (the super admin), the cost panel for financial:view, and Edit profile for employee:manage (position and team) or employee:pay_manage (pay from a date on).
- **Activity and Reports.** The feed's words live in one place (`feedWords.ts`), shared with the client page's recent activity. Every sentence reads as well without the amounts people without financial:view don't get, and events the prototype never had (requirements, meetings, teams, permissions) are worded in its voice. Everyone's work (the Work logged filter, today at a glance, online now, the entries tab and Export) needs work_entry:view_all; the Money tab needs financial:view.
  - Client events now name their client (API PR #29), and the feed, the report and the timesheet export name clients by their display name, as the rest of the API does (API PR #30).
  - A quarter that hasn't started yet reports on its first day; the prototype asked for a range ending before it began.
  - The entries tab loads 50 at a time; the prototype showed 25 first.
- **The project report.** Its preview is laid out as the server's PDF is, section by section, so it shows what the PDF holds: the prototype's "Performance" charts and the employees' positions aren't in the PDF, so they are left out of the preview and the section list. The PDF and the CSV of the range's entries come from the API; arrays in query strings now go as repeated keys (sections=a&sections=b), as ASP.NET reads them.
- **Invoices and payments.** The invoice document is drawn on screen from the invoice, laid out as the server's PDF (MigraDoc) is, so the editor's live preview and the invoice window show what the client receives; the PDF button downloads the server's file. Email is really sent, by the server, with the PDF attached, so the prototype's "email delivery is simulated" note is replaced by how sending works; WhatsApp opens the chat with the message ready, as in the prototype. Sending a draft issues it first. The billing windows open through the link (?invoice=, ?edit=, ?send=, ?pay=), so an invoice can be linked to from anywhere. The register shows the latest 100 invoices.
- **A project's money.** The money band, financial breakdown and the two cost charts (inside Analytics, as in the prototype) come from the project's money and its cost timeline. The customer payment asks for a client when an internal project becomes client work, since the API needs one. An expense row opens a small "Remove this expense?" for people with expense:manage while the project is open: the prototype had no way to take back a mistaken expense. Execution's fee and expenses arrive with phase 6.
- **Financials.** "All time" asks from 1 January 2000, since the API's default period is this quarter. The hours behind the labour cost come from the API (API PR #32). The export is the API's CSV of the period's projects. Execution's financials arrive with phase 6.
- **The overview board.** Each person's card order is saved on the server (`/api/me/board-layouts/overview-design`) instead of the prototype's browser storage, so it follows them to any browser; the prototype's "Export JSON" button, there to hand the layouts over while it had no server, is left out. Whether "Needs attention & deadlines" is folded stays in the browser, as in the prototype. The period's people, projects and this week's hours come from the API (API PR #31). Execution's dashboard arrives with phase 6.
- **A site's money.** The figures come from the project's money, and the week-by-week cash and the projection of when profit reaches zero from `/site-money/timeline`, so the rule lives in the API. Pricing sets only the supervision rate and the TVA, and why they change. A site expense is a cost with no client price: a site's agreed amount is its work price plus supervision, so "Where the profit comes from" lists the work price and supervision as income and the site expenses, ground labour and other costs as costs. A site takes payments on account, so Record payment is there before anything is invoiced, and a new invoice starts from what is still owed less what is invoiced and unpaid, as in the prototype.
- **Expenses** (the Execution BOQ rework, phase 3: `docs/execution-boq-plan.md`). The Materials panel is now a cost-only list of everything spent on a site (`domains/execution/expenses`): materials, a contractor, equipment, fees. Nothing in it is charged to the client, so the client prices, the markup, Material margins and the price-source column and action are gone, and so is the markup field in Pricing.
  - **Columns.** Item, quantity, unit, unit cost, amount, currency, supplier / payee, spent on, category, account label, note and who added it. The API's `name` and `supplier` keep their JSON names and show as "Item" and "Supplier / payee". Only the API's `/site-expenses` routes are used; the `/materials` alias is the phone app's.
  - **Edited in place.** As before: a cell saves what was typed in it, a saved expense goes straight into the loaded list, and whoever may change a row (`canEdit`) can change or remove it. The whole row is sent each time, label included, because a label left out would clear it. A currency, category or account label is picked in the cell, and a day is typed the way people write it (`23/9/2026`, `Sep 23`).
  - **Filters, totals and pages** (30 a page) come from the API: item, category, account label, supplier / payee, who added it, and the day it was *spent* (this week, this month, the last 30 days or 3 months; the API filters `spentOn`). Someone who may edit the labels (`company_settings:manage`) also finds the archived ones in the label filter, to see what is filed under them.
  - **Currencies.** Dollars and pounds are never added. The headline and the table footer show the dollars, with a footer row and a chip for each other currency; the Add sheet totals each currency apart, and its profit strip counts the dollars only and says the pounds are counted at the day's rate once added (the API converts a cost at the rate of the day it was spent). A pound expense on a day with no exchange rate is refused with `exchange_rate_missing`: the sheet says so in a banner above the rows (it is about the sheet, not a cell), and a cell edit says so in its "Not saved" notice and shows the old currency again.
  - **Account labels** come from the shared labels hook. An archived label can't be newly picked, but an expense keeps its own and shows it as "(archived)", and only that expense offers it.
  - **The Add sheet.** A new row starts in dollars, spent today, under materials, with no label; those defaults don't make a blank row "in use". Pasting from Excel reads the same columns (a currency, day, category or label that is empty or not on offer keeps the default). Errors show beside the cell and under its row ("Row 5: At most 3 decimals"), live once the cell is left and for every cell once a save was tried. The API's `items[2].unitCost` errors go on the third row sent, and clear as soon as something is changed. The sheet still sends a hundred rows at a time.
  - **No project-expense window on an Execution site.** The menu item, the `?money=expense` link and Proton's "add project expense" surface are for Design only; the API refuses the call on a site (`expense_execution_uses_site_expenses`). What a site's old project expenses cost moved into its expenses list.
  - **Words.** "Expense(s)" on screen: the KPI, the panel, the sheet, the feed ("added Scaffolding to … - 895k LBP", in the expense's own currency), notifications, blocked-change summaries and the help articles (`record-expenses`, `site-costs`). A project's or a client's cost says `siteExpenses`, while a period's or the company's still says `materials`; the cost tables read either (`projectCostOf`) and label it "Site expenses". A site's old "other expenses" are "Other costs".
  - **Kept as they were**, because the API keeps them: the `?materials=add` link and Proton's `materials` form, the `material:create` / `material:manage` permissions (their descriptions come from the API), and the `materials` keys of `site-summary` and `me/site-records` (the staff pages say "expenses"). Old payment-history rows still show their material profit, and old `material_markup_set` / `material_priced` events still read as they did.
- **A site's account, supervision taken and payment labels** (the Execution BOQ rework, phase 4: `docs/execution-boq-plan.md`). On a client site's Financials tab, for whoever holds `financial:view`; the code is in `domains/execution/account`.
  - **Account.** A panel built from `GET /api/projects/{id}/account-figures`. Every figure is the API's and none is worked out here; the client only words them. Two columns: what the client pays (work price, supervision x%, TVA y%, client total, received, rest to pay) and what the site has cost (site expenses, ground labour, staff, other costs, total, profit). A negative rest to pay reads "Paid ahead", and supervision taken beyond what is due reads "Over by". Below: the supervision due, taken and left; the cash in the account (with the pocket money's moves in their own cards, only when there are some); the table "Rest in account by label"; spending by category and by payee; and any cost with no exchange rate, listed apart as left out of every figure.
  - **The label table** keeps the API's order, with the "Unlabelled" row last and a note on what it carries (ground labour, staff and other costs under Spent; supervision taken and the pocket money moves under Other). Its last row is the API's own received, total costs and cash in the account: the rows add up to them by construction on the server, and the client sums nothing.
  - **Where it sits.** After Project money. The Work price section keeps the price and its edit and history buttons, but no longer repeats the supervision, TVA and client total on a client site, because the Account carries them; an internal site still shows them under its price.
  - **Supervision taken** is a list under the Account (day, amount, note, who recorded it, latest first). "Record supervision taken" and the bin beside each row are for `payment:record`; reading needs `financial:view`, and neither implies the other. The form takes the amount, the day (today, never later: the day field takes no later day, and the API's `taken_date_in_future` shows beside it) and a note, with live errors; removing asks first. It works on a finished site too (the user's call): there is no closed-site handling. It is not a cost, so the profit does not change, but the Account and the feed refresh.
  - **Payment labels.** The record-payment form (Design and Execution) has an optional "Account label" select (the shared labels hook; an archived label isn't offered). Payment lists show the label in a column, and an invoice's payments show it after the reference. A "Label…" action in a live payment's menu files it under a label, changes it or clears it (`PUT /api/payments/{id}/label`); it needs both `payment:record` and `financial:view`, and a voided payment has no menu at all. A label the API refuses (`account_label_archived`, or `accountLabelId` in a validation error) shows beside the select until another is picked; `payment_already_voided` shows in the window's footer. A payment keeps an archived label it already has, shown as "(archived)". Saving the label it already has closes the window without a call.
  - **Payments received.** An Execution client site's Financials tab lists the site's payments (the same table as the Billing tab, with its menu), so a label can be set from the site. The query is the one Project money already makes.
  - **Words.** The feed words `payment_label_set` ("filed a $4k payment under Concrete", "moved … from Concrete to Finishing", "cleared the Concrete label from …"), `supervision_taken` and `supervision_withdrawal_removed`; Help articles `account-figures`, `supervision-taken` and `payment-labels`, and "?" hints beside the Account and Supervision taken titles.
  - **Not built.** The client payment report PDF waits for the user to agree its layout. Proton's record-payment tool doesn't offer a label yet (the API says so too).
- **Weekly labour.** The weeks, the days a week not yet reported starts with (the defaults in force on each day, up to today) and who may change a week all come from the API. The prototype let anyone reporting on an open site change the defaults; the API keeps that to labour_report:manage, so for everyone else the defaults bar shows the numbers without fields. Saving a week or the defaults doesn't wait for the panel to refresh, so the confirmation isn't lost when the panel is drawn again from the fresh defaults.
- **BOQs and VOs** (the Execution BOQ rework, phase 2: `docs/execution-boq-plan.md`). They replace the client statements, which are gone with everything that hung on them (the stated and sent state of materials, the sent-materials revenue, the "can't complete with unsent materials" rule). A client site's price is built from them.
  - **Where.** A "Bills of quantities" panel on the site's own BOQs tab, after Overview (`domains/execution/boqs`), for whoever holds boq:create, financial:view or project:pricing_manage on a client site. It shows the price the API adds up (agreed BOQ, agreed VOs, work price, supervision, TVA, client total), the client BOQs (once one is agreed the other drafts read "Not chosen"), the VOs (a new one only once a client BOQ is agreed) and the internal drafts. A BOQ opens in an editor through the link `?boq=12`, mounted by the project page like the billing windows, so it can be linked to from anywhere on the site.
  - **Who.** Permissions, never roles. project:pricing_manage writes every client BOQ and VO, sends, agrees and withdraws them, and sees and may edit every internal draft (with its author's name). boq:create writes the person's own internal drafts (it replaces statement:create and needs nothing else: an author may see no money at all). financial:view or project:pricing_manage reads the client BOQs, VOs, the price and the PDF. Writes need the site open.
  - **Money.** The API does every calculation: final quantities, line totals, the subtotal, the adjustment, the total, supervision, TVA and what the client pays are shown only from the last saved BOQ. A line changed since shows a dash in the cells it works out until it is saved, and the totals say they are the last save's. Waste and the adjustment percentage are typed as percents and sent as fractions. A negative rate (and a negative new total) is only for a VO.
  - **The editor.** Title, a VO's reason, the lines (add, remove, move up or down), the whole-BOQ adjustment (none, by %, to a new total) and Save. Errors show beside the field, live once a field was left or a save tried, with the API's limits (title 120, reason 500, code 20, description 500 and required, unit 20, quantity 0 or more, waste 0 to 100%, 1,000 lines). An agreed BOQ opens read-only. Duplicate, copy lines, send, agree and the PDF act on the saved BOQ, so they wait for a save.
  - **Sending.** Email (to, a note; a failed email records nothing and says so), WhatsApp (the chat opens with a short message, and the send is recorded) or the PDF downloaded and recorded. A plain PDF download is separate and records nothing. A BOQ stays editable after it is sent; each send is listed with the total it carried.
  - **Agreeing and withdrawing.** Both ask first, naming the BOQ and its total; withdrawing needs a reason. The profit floor holds only a lower price (a withdrawal, or a VO that takes money off; a rise never): its refusal opens the usual force-it flow in the window, and the change can also be forced or dismissed from its notification. The API's codes (`boq_locked`, `boq_already_agreed`, `boq_not_agreed_yet`, `boq_not_agreed`, `boq_has_agreed_vos`, `boq_empty`, `boq_internal`, `boq_negative_rate`, `boq_price_below_zero`, `boq_execution_only` and `email_delivery_failed`) are worded in `boqRules.ts`; its field errors (`title`, `reason`, `adjustmentValue`, `lines[2].rate`, `lineIds`) show beside the field or on the line they name, until something is changed.
  - **A finished site.** Every write needs the site open, deliveries and email included, so a finished site's BOQ screens only read, and the PDF still downloads.
- **Execution staff.** An Execution employee's home and site page are built around what they record: their cards come from the project list and `/projects/site-summary` (expenses so far, and when they last recorded there), since `/api/me/projects` is built on logged work, which Execution staff don't have. The rows now carry their description (API PR #33). The site page has the same Expenses and Weekly labour panels as the admin's, and every money figure stays out. A person's profile shows what they recorded (`/site-records`): the totals, the value week by week, the sites and the latest records. The prototype's "New" badge on a card isn't there: the project list doesn't say when a project was created.
- **Execution's dashboard and financials** are Design's pages, as in the prototype: the dashboard is the same board without the cards about logged work (hours, work entries, who is logging, who is online, needs attention, where the time went), and "Projects by status" takes the full width, as the prototype has it; its layout is saved apart from Design's. The prototype reused Design's words there too, so a site's materials and ground labour showed as "labour $0" and among "project expenses"; the client splits a site's cost into site expenses, ground labour and other costs wherever Design shows labour and expenses (the figures, the net-profit waterfall, the cost composition and the projects and clients tables), leaves out the hours columns, and in the Costs tab shows the site's cost by kind in place of labour by employee.
- **Settings.** Everyone who opens Settings sees every section, as in the prototype, and what they may change follows the API: the domain's rules, billing and teams for its admins; the company's details, working week, time format and currency, the working time, exchange rates and anyone's permissions for a super admin (the prototype let any admin change the company). Changes save as they are made, with a toast; a form (company details, bank details) says what went wrong beside it.
  - **Working time** is a series of versions, each from a day on, so past months never change; the API takes one change a day, so a second change made the same day applies from tomorrow, and every change starts from the latest version.
  - **What the API adds**: the company's website and address in place of the prototype's fixed email domain, the invoice prefix, SWIFT, payment terms text and footer beside the bank details, the LBP rate with the rates before it, a Teams section, and a person's permissions (from Admins & access and from their profile, for permission:manage).
  - **Left out**: the prototype's "Reset the prototype", the count of people paid in another currency and the count of completed projects that would be archived: no endpoint gives either.
  - **The logo** is cropped to a 128px square before it is uploaded, as in the prototype, and its address carries its file (API PR #34), so a new logo shows at once. Your own profile now says when you joined (API PR #34).
- **The company area.** The Company overview measures one window, picked as in the prototype (this month, quarter or year, a year or quarter, or a range), which is remembered while moving between the company's pages; its figures are the API's (`/company/overview`), and its board's layout is saved like the Design overview's. Company expenses are the API's ledger: kept per currency and never converted, a new amount or currency applies from the first of a month, and a cancelled line is charged to the end of its month and can be taken back until then. The prototype's closing note that the company layer was still to come is left out.
- **Salaries.** The list is everyone the API pays for the month, admins with a pay record included, a page at a time with totals over every page, kept per currency. A month can be opened from a link (`?month=2026-08`), as the month-end notice will. The API's rules beyond the prototype are shown where they change the pay: an excuse can be unpaid (it comes off a salary, and an unpaid day off costs the full paid day), a salaried person outside the hours rule (Execution staff) can only be given unpaid leave, working days with nothing logged are counted in a person's details (each costs the full paid day once the month closes short), and someone who joined, left or came back partway through the month is pro-rated on the days they were employed. An excuse shows the day it was given rather than who gave it. The drawer's overtime days need `work_entry:view_all`, and excusing needs `hours:excuse`.
- **Notifications and live updates.** The API keeps each notification as its kind, who, the project, the subject and a few facts, so the client writes the sentence (`notificationWords.ts`): in the prototype's voice where it had the notice, and the same way for the kinds it didn't. A click marks it read and opens what it is about, but only a page the reader may open; a client's page is found through the client, since the notice doesn't say its business. The prototype's "View file" link on a work notice is left out: the notice doesn't carry the entry's files. The live connection (`/hubs/live`) opens once someone is signed in and only says that the bell or a chat changed; the pages then reload it, so the badges no longer poll. The connection asks for a fresh token when its own is about to expire, and keeps retrying slowly if the API is away.
- **Messages.** Who talks to whom is the API's (a team's chat has its people, their business's admins and the super admins; anyone messages their own business and the super admins). A chat opens through the link (`?group=13`, `?with=2`), so a notice or a name can lead to it; opening it, and each new message while it is open, marks it read. Photos and videos upload as they are picked, as on work entries. Who is online is asked again each minute, since nothing signals it. A shared task comment's card names the admin who wrote it without their role, which the message doesn't carry. The development seed has no messages, so the tests use chats written in the API's shape.
- **Accessibility, phones, light and dark.** The prototype's click targets (table rows, project tiles, dashboard rows, cost rows, "link" texts) were mouse-only; `clickable()` makes each one a Tab stop that Enter or Space opens, keeping a row's own role, and inputs without a visible label have a spoken one. The project timeline's lanes and hour cells stay mouse-only, as the drag timeline is. At 375px wide no page scrolls sideways (wide tables scroll inside their panel, as in the prototype), and Messages stacks the chat list above the chat by the prototype's own rules. The light theme follows the prototype's colour tokens; the only fixed colours are the printed report's and the day story's team palette, as in the prototype.
- **The permission matrix.** `permissionMatrix.test.ts` spells out, for each kind of person, what every route of both businesses and of the company area does: open, send them home, or say they lack the permission. Checked against the running API on 30 Sep 2026: the client knows the same 49 permission codes, and the five test personas hold exactly the permissions `/auth/me` gives the seeded super admin, admins and employees.
- **Code-splitting.** Every page is its own chunk, loaded the first time it is opened, with a page-shaped skeleton in the shell meanwhile; so are the signed-out pages, the log-work form and the command palette. The first download went from 1,652 kB (480 kB gzipped) to 714 kB (226 kB gzipped). What is left is shared by every page: React, the router, React Query, the live connection and the avatars. A page whose code can't be fetched (usually because a new version went out) reloads the app once to get the new one; a page that fails keeps the shell around it.
- **The API's features without a prototype screen.** A pass over every endpoint found some the client never called. They now have screens in the prototype's style:
  - on someone's profile, a menu (employee:manage) to change their role, move them to the other business (only for someone who sees both), deactivate them from a last working day, reactivate them (asking whether time away this month is paid) and resend an invitation (employee:invite);
  - on a payment, in the billing tab and the invoice window, applying money received on account to an issued invoice (payment:record) and voiding a payment with a reason (payment:void).

  `GET /company/overhead/monthly` is still unused: Company expenses reads each month's cost from the company months, as the prototype does.
- **Project pay and schedules.** Project pay is the API's pricing of each entry (`/company/project-pay`), grouped by department in the client; a project's title opens it in Design only for someone who may. Schedules lists everyone the API does, admins and super admins included (people without a team come after their business's departments, the super admins last, under "Company"); a super admin's week needs `employee:invite_super_admin` to change. A change applies from today, or from tomorrow when one already starts today, as the company week's does in Settings; a change already set for a later day is mentioned in the editor and stays.
- **Amounts keep what is typed.** The prototype's amount field turned "42." back into "42" as it was typed, so no amount with cents could be entered; the client's keeps the text as typed.
- **The account menu opens upwards.** The prototype opened it downwards from the foot of the sidebar, so on any page longer than the window it was drawn below the screen and Sign out was out of reach.
- **Your own phone** (API PR #28). The session now carries the phone, so editing your own name no longer sends an empty phone back.
- **Strict numbers in the API** (API PR #27). JSON numbers are strict there, so the generated types say `number`, not `number | string`.

### Waiting for the user

- **The price shown twice.** The Financials tab's "Work price" section (supervision, TVA, client total) and the BOQs tab's price summary say the same figures, from the project's money and from the BOQs' own price. They are on different tabs now; one of them could still be dropped.

### Decided

- **Colleagues' hours stay private** (the user, 30 Sep 2026). An employee's project cards say "Sarah logged work · 3 hours ago", not the prototype's "Sarah logged 2h": employees never see how long a colleague worked.
- **No Activity page for Execution** (the user, 30 Sep 2026). The prototype has none, and it stays that way, although the API records site events and the client words them.
- **The company's own events are worded.** Schedules, working time, excused hours and company expenses read like the rest of the feed ("excused Sarah Haddad for 3 days off in September 2026", "changed the company's working hours from Oct 1"). The client always asks for one domain's feed, so only the schedule and excuse events, which carry the person's domain, reach a page today (Design's Activity page). The company ones would show on a company-wide feed, if one is ever wanted.

- **An Execution site's price comes from BOQs and VOs** (the user, 29 Oct 2026). Its work price is not typed in anywhere: the Financials tab shows it read-only ("Set when a BOQ is agreed" while there is none), and More → Pricing edits only the supervision rate and the TVA (the material profit went with the client prices of materials: site expenses are costs only). Supervision is its own line next to the work price and TVA. A new client project's TVA starts at 11% everywhere. Execution sites have no quotes: no "Send the quote?" prompt after creating or pricing a site, and none from a `?quote=new` link. Design keeps them.
- **boq:create is given person by person** (the user, 29 Oct 2026). It stays a super-admin-only default; a super admin gives it to the admins who write internal drafts. They need no money permission for it: the BOQs tab opens with boq:create alone and shows them only their own drafts.
- **Account labels** are one company-wide list that a super admin keeps in Settings → Account labels (add, rename, archive and restore, reorder with the arrows). The `useAccountLabels` hook (`domains/shared/accountLabels`) is what payments and expenses pick from, through the shared `AccountLabelSelect` (payments) and `labelChoices` (the expenses grid too).

- **An Execution site has one tab for its money, with parts** (30 Oct 2026). Its old Overview, BOQs and Supervision tabs are parts of the Financials tab, chosen with `?part=`: Overview (financial:view: the work price and the project money), Client payments, Accounts, BOQs, Supervision, Overall expenses and Site staff. The Financials tab is open to everyone who sees the site and each part is gated on its own (`siteParts` in `ExecutionOverview.tsx`); a part a person may not open falls back to their first. An old `?tab=overview|boqs|supervision` link is forwarded to its part (`movedTabs` in `ProjectRoute.tsx`, read by `ProjectPage.tsx`). Overall expenses has two views, `?view=`: the expenses and the ground labour. The supervision taken can't go above what is left of the supervision due: the record window shows what is left and refuses more, as the API does.

### API follow-ups

None open. Done since:

- **Hours logged this quarter** on the projects list: read from the dashboard's own quarter overview (`/api/reports/overview`, report:view), so no new endpoint was needed and the two share one cached request.
- **The meetings list takes a domain** (MohammadRstm/ID-Indetails-api#42), so the Meetings page asks for its own domain's meetings instead of filtering them by project.

# UI/UX review: what a Design employee sees

Reviewed on 18 Nov 2026 on branch `MR-UI-UX-Employee` (from `MR-Employee-Pages-2`), signed in as Sarah Khalil (Design employee) on the dev DB, at 1024px (laptop), 375px (phone) and in the source. Guidance: the `ui-ux-pro-max` skill's priority table (1 Accessibility, 2 Touch, 5 Layout, 6 Typography, 8 Forms, 9 Navigation).

Rules kept: client only, behaviour unchanged, the prototype's look kept (`hourline.css` untouched, adjustments in `client.css`), no logic changes in `DragDay.tsx`, `dragModel.ts`, `LogWork.tsx` or `DayTrack.tsx`, colleagues' hours stay private.

**Overall:** the pages are in good shape. Forms already show errors live next to their fields, empty states explain what to do, there's no page-wide horizontal scroll on a phone, and icon buttons mostly have names. The findings below are mostly about the laptop-width sidebar, touch targets on phones and a few screen-reader gaps.

Priority: **P1** fix now (broken or inaccessible), **P2** worth fixing (clarity), **P3** noted for later.

## The shell (sidebar, every page)

| # | What's wrong | Change | Why (skill) | Priority |
|---|---|---|---|---|
| S1 | Between 821px and 1120px the sidebar shows icons only and hides each tab's name with `display: none`. The tabs, **Log work**, **Home** and the user button then have no accessible name: a screen reader says "button". | Hide the names visually only (clipped), so they still name the buttons; the hover tip still shows. | Accessibility: icon-only buttons need labels (`aria-labels`). | P1 |
| S2 | The tab you are on isn't announced. | `aria-current="page"` on the current tab. | Navigation: the current location must be clear to everyone. | P1 |
| S3 | The user button opens a menu but doesn't say so. | `aria-haspopup="menu"` and its name ("Your account: Sarah Khalil"). | Accessibility: say what a control does. | P2 |

## Help, and Settings (in-page lists)

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| H1 | **Bug.** Between 821px and 1120px the Help page's topic list (Getting started, Your work, …) shows **empty 16px-high buttons**: the sidebar's "hide the names" rule also hides `.nav-label` and `.nav-count` inside the page. | Limit that rule to the sidebar; lists inside the page keep their names and counts. | Layout: content must not disappear at a breakpoint. | P1 |

## Log hours (home)

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| L1 | "Your week so far": each day's hours are only in a mouse tooltip. Keyboard, touch and screen-reader users can't get them (the bar label shows decimals only). | Each day's bar gets a text alternative ("Mon, Nov 16: 4h 06m logged"); the chart is announced as a list of days. | Charts: don't rely on hover alone; give charts a text alternative. | P1 |
| L2 | The Alert banner's toggle doesn't say how many things need attention to a screen reader beyond "3". | Name it "Alert, 3 things need your attention". (The heading stays "Alert", as decided on 17 Nov.) | Accessibility: meaningful names. | P2 |
| L3 | Small tap targets on a phone: **Add logs**, **Open My work** (27px), **Show details** (18px). | Covered by T1. | Touch: 44×44px. | P1 |

## Projects (table)

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| P1 | Rows without a location or description say "No description" under the title, in every such row: noise that pushes real descriptions out of the scan. | Show nothing there when there's nothing to say. Shared with the admins' table, so they get the same quieter row. | Typography & layout: remove filler, keep hierarchy. | P2 |

## A project's page and Project details

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| PR1 | On a phone the tab strip and the KPI strip run past the screen edge (they scroll inside; that's by design). | None now: the scroll is intended. | - | - |
| PR2 | "Team activity" repeats one line per entry ("Pay · Friday / Pay test drawings" six times). | One row per teammate per day, each task named once; days in a row with the same tasks fold into one row with the dates ("Pay · Nov 6 – Nov 13 · 6 days"). Approved by the user on 18 Nov. Still no hours shown. | Content: reduce repetition. | P2 |

## Log work window (and editing an entry)

`LogWork.tsx` is being changed by another session, so these are notes for later, not changes.

| # | What's wrong | Suggested change | Priority |
|---|---|---|---|
| W1 | The time span appears three times: under the times, on the timeline's box and in the footer ("9:00 AM → 10:00 AM · 1h 00m"), and the Log button repeats the length. | Done, CSS only: the line under the times is hidden in the Log work window (`.log-form .trange-sum`). The box and the footer stay. | P2 |
| W2 | "Tip: type “4pm”, “16:00” … and ⌘/Ctrl + Enter to save." The 17 Nov decision was no keyboard-shortcut help. | Done in part, CSS only: touch screens no longer show the tip. Still to do once the other branch is merged: drop "and ⌘/Ctrl + Enter to save" from the text in `LogWork.tsx`. | P3 |
| W3 | Day chips, the duration chips (30m, 1h, …) and "Use a timer instead" are 26–28px high on a phone. | Covered by T1 for the shared button classes. | P1 |

## My work

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| M1 | The period switch (This week, This month, …) is 26px high on a phone. | Covered by T1. | Touch. | P1 |
| M2 | The heatmap's day cells are 24px; on a phone the six months are wider than the screen. | No change needed: it already scrolls sideways and opens on the latest weeks (checked at 375px), and each day has a name for screen readers. | - |

## Calendar

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| C1 | The month says "0 meetings" while the grid shows a meeting (on a day from the month before, at the grid's start). Reads as a contradiction. | "0 meetings in November". | Clarity: say what a number counts. | P2 |
| C2 | Previous/Next/Today are 27px high. | Covered by T1. | Touch. | P1 |

## Messages and Proton

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| X1 | No page heading (`h1`), unlike every other page; screen-reader users can't jump to the page's start by heading. | A visually hidden `h1` ("Messages", "Proton"). Nothing changes on screen. | Accessibility: heading hierarchy. | P2 |

## Requirements, Meetings, Notifications, Time off, Salary advances, Profile, Edit profile, Settings

No problems beyond the touch targets (T1). Forms (time off, advance, edit profile) have visible labels, mark required fields and show errors live beside the field. Empty states explain what will appear.

## Touch targets on phones (all pages)

| # | What's wrong | Change | Why | Priority |
|---|---|---|---|---|
| T1 | On touch screens only the top bar, menus and sidebar tabs grow. Buttons (`.btn` 32px, `.btn-sm` 27px), icon buttons (32px), segmented switches (26px), tabs and text toggles stay mouse-sized. | In the existing `@media (pointer: coarse)` block: give them an invisible hit area of about 44px around them (as the "?" and switches already have), so the look doesn't change. | Touch & interaction: min 44×44px, never shrink the visual for it. | P1 |

## Typography

| # | What's wrong | Change | Priority |
|---|---|---|---|
| Y1 | Table headers (10px uppercase), field-style labels (10px), weekday labels (10.5px), message times (9.5px) were under the 11px floor. | Done: those go to 11px (message times and heatmap labels 10.5px). Dense charts, timelines and the ⌘K hint keep their sizes. | P3 |

## Changes made

On `MR-UI-UX-Employee`, checked live on port 5180 at 1024px and 375px (no local tests or builds run; CI runs them):

| Rows | Commit |
|---|---|
| S1, S2, S3 (as `aria-expanded`; the account popover isn't an ARIA menu, so no `aria-haspopup`), H1 | Name the sidebar's tabs for screen readers while it shows icons only, and keep Help's topic names at that width |
| T1, L3, W3, M1, C2 | Give buttons, switches, chips, small selects and page tabs room for a finger on touch screens |
| L1, L2 | Log hours: say each day's hours to keyboards and screen readers, and what the Alert banner holds |
| P1 | Projects: leave the line under a project's name empty when it has no location or description |
| C1 | Calendar: say which month the meeting count is for |
| X1 | Give Messages and Proton a page heading for screen readers |
| PR2 | Project page: group the team's activity by teammate and day |
| W1, W2 (touch part) | Log work: say the time span once less, and hide the keyboard tip on touch screens |
| Y1 | Make small labels a step larger: table headings, field labels, weekdays and message times |

Left for later: the text half of W2 (in `LogWork.tsx`, after the other branch merges).

## Toasts (added 18 Nov, chosen by the user)

Every toast was the same dark pill, so a failure ("Log wasn't saved") looked like a confirmation. Four styles were shown; the user picked **B, tinted**:

| Kind | When (from the icon the toast already passes) | Look |
|---|---|---|
| Done | `checkCircle`, `check` or no icon | pale green, dark green text |
| Failed | `alert` | pale red, dark red text, the reason under it |
| Notice | any other icon (send, download, refresh, bell, …) | pale teal, dark teal text |
| Removed / cancelled | `trash`, `x` (usually with Undo) | plain white card |

No call site changed: `Toasts.tsx` picks the kind, `client.css` colours it. The tints are mixed into the surface, so they stay opaque over the page in light and dark mode. Commit: "Tint toasts by what they say".

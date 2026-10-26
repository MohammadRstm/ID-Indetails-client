import { P } from "@/app/permissions/codes";
import { or as orFact } from "../helpFacts";
import {
    and, has, hasAny, isEmployee, link, links, list, note, only, para, sees, step, steps, tracksOwnHours, type Article,
} from "../helpModel";

/** They log Design work: the Log work button and the timer. */
const logs = and(sees("design"), has(P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN));
const designEmployee = and(isEmployee, sees("design"), has(P.WORK_ENTRY_VIEW_OWN));
const executionEmployee = and(isEmployee, sees("execution"), has(P.REQUIREMENT_VIEW));

export const work: Article[] = [
    {
        id: "log-work",
        title: "Logging your work",
        category: "work",
        who: logs,
        summary: "Log work from the Log work button: pick the project, drag across the day to set the time, and say what you did.",
        ask: ["log work", "log time", "log hours", "add hours", "time entry", "record time", "fill timesheet", "add entry"],
        blocks: [
            steps(
                step("Choose **Log work** (at the top of the sidebar, or on your projects page).", "Log work"),
                step("Pick the **Project** and the **Day**."),
                step("Press on free time on the day's timeline and drag to draw the entry. Drag an entry's edges to change it."),
                step("Write **What did you work on?** and save."),
            ),
            list(
                "An entry is 5 minutes to 16 hours long.",
                "Only active projects take new work (and projects on hold, if the business allows it).",
                "Entries count on the day they start, even if they run past midnight.",
                (f) => `Your company's working day is ${orFact(f.day, "set by the company")}${f.days ? `, ${f.days}` : ""}. Work outside it counts as overtime.`,
            ),
            note("Months close for logging: from the 1st, last month's entries can't be added or changed (on the 1st itself, last month is still open)."),
            links(link("Open my work", { business: "my-work", only: "design" })),
        ],
        related: ["edit-entry", "timer", "overtime", "closed-months"],
    },
    {
        id: "timer",
        title: "Timing your work with the timer",
        category: "work",
        who: logs,
        summary: "Start timer at the top runs a clock while you work; Stop opens Log work with the times filled in.",
        ask: ["timer", "start timer", "stop timer", "clock in", "track time", "stopwatch"],
        blocks: [
            only((ctx) => ctx.p.canSeeDomain("design"), para((f) => (f.timerOn === false
                ? "Your business has the timer turned off, so **Start timer** isn't shown. An admin can turn it on in Settings → Time tracking."
                : "Choose **Start timer** in the top bar when you start, and **Stop** when you finish."))),
            list(
                "Stopping opens **Log work** with the start and end filled in: pick the project and description, and save.",
                "A run shorter than 5 minutes is logged as 5, the shortest an entry can be.",
                "The timer keeps running in this browser if you close the page, but it doesn't follow you to another device.",
            ),
        ],
        related: ["log-work"],
    },
    {
        id: "log-overtime",
        title: "Logging overtime",
        category: "work",
        who: logs,
        summary: "Log overtime the same way as any work. Log overtime appears on your projects page once the working day is over.",
        ask: ["log overtime", "overtime", "extra hours", "worked late", "weekend work", "after hours"],
        blocks: [
            para("Overtime isn't a different kind of entry: you log the time you worked, and the app works out which part is overtime from your hours."),
            steps(
                step("After your working day ends, choose **Log overtime** on your projects page (or **Log work** at any time).", "Projects"),
                step("Draw the time on the day's timeline. The window says how much of it counts as overtime before you save."),
            ),
            links(link("Open my projects", { business: "projects", only: "design" })),
        ],
        related: ["overtime", "hours-balance"],
    },
    {
        id: "edit-entry",
        title: "Changing or deleting an entry",
        category: "work",
        who: logs,
        summary: "Open the project, find your entry and choose Edit entry. In Log work you can also move, resize or delete entries on the timeline.",
        ask: ["edit entry", "change entry", "delete entry", "remove entry", "wrong time", "fix my hours", "undo"],
        blocks: [
            steps(
                step("Open the project, then in **your work** on it, open the entry's menu and choose **Edit entry**.", "Projects", "the project"),
                step("Or, in **Log work**, drag a logged entry on the timeline to move it, or drag its edges to resize it."),
                step("To delete one there, right-click it and delete it, or select it (double-click, or Enter) and press **Delete**. **Ctrl+Z** brings it back; it is only deleted when you save."),
            ),
            para((f) => `You can change an entry ${orFact(f.editWindow, "for as long as your business's edit window allows")}. Nobody can change someone else's entries.`),
            note("Entries in a closed month can't be changed by anyone. If last month's hours are wrong, a super admin corrects it with an excuse."),
        ],
        related: ["log-work", "closed-months"],
    },
    {
        id: "my-work-page",
        title: "Seeing the hours you logged",
        category: "work",
        who: designEmployee,
        summary: "My work lists every entry you logged, with filters by period and project, as a list or a week.",
        ask: ["my work", "my hours", "my entries", "my timesheet", "hours this week", "what did i log"],
        blocks: [
            list(
                "Pick the period and project at the top, or search your descriptions.",
                "**List** shows each entry; **Week** shows the week as a calendar.",
                "Your deadlines and charts of where your time went are on the same page.",
            ),
            links(link("Open my work", { business: "my-work", only: "design" })),
        ],
        related: ["log-work", "my-pay"],
    },
    {
        id: "my-pay",
        title: "Checking your pay",
        category: "work",
        who: designEmployee,
        summary: "My pay shows what you've earned so far this month, what the full month comes to as things stand, and how your hours add up.",
        ask: ["my pay", "my salary", "how much have i earned", "payslip", "pay this month", "earnings"],
        blocks: [
            list(
                "Step through the months with the arrows.",
                "**Day by day** shows each day's required hours, what you logged inside your hours, and the difference.",
                "**How it adds up** explains the month's pay.",
            ),
            para("The figures for this month are an estimate until it ends; past months are final, unless an excuse or a pay change is added later."),
            links(link("Open my pay", { business: "pay", only: "design" })),
        ],
        related: ["pay", "my-pay-estimates", "hours-balance", "deductions"],
    },
    {
        id: "behind",
        title: "Am I behind on my hours?",
        category: "work",
        who: tracksOwnHours,
        summary: "Your projects page and My pay show your hours balance for the month: on track, behind, or short.",
        ask: ["behind on hours", "hours short", "am i behind", "missing hours", "hours balance", "make up hours"],
        blocks: [
            para((f) => `Each working day asks for ${orFact(f.required, "the day's required hours")} of work inside your hours. While the month runs, "behind" means you have logged less than the days so far asked for. Overtime makes up for missing hours first.`),
            para("If you're on a monthly salary and a month ends short, the missing hours come off that month's pay, unless a super admin excuses them. If you're paid by the hour, you're paid for the hours you logged."),
            links(link("Open my pay", { business: "pay", only: "design" })),
        ],
        related: ["hours-balance", "deductions", "excuses"],
    },
    {
        id: "tick-requirement",
        title: "Ticking off a requirement",
        category: "work",
        who: hasAny(P.REQUIREMENT_COMPLETE_OWN, P.REQUIREMENT_MANAGE),
        summary: "Open the project's Requirements tab and tick the requirement when it's done.",
        ask: ["tick requirement", "complete requirement", "mark done", "task done", "requirements", "checklist", "my tasks"],
        blocks: [
            steps(step("Open the project, go to **Requirements**, and tick it.", "Projects", "the project", "Requirements")),
            only(has(P.REQUIREMENT_MANAGE), para("You may tick, untick, add, edit, assign and remove any requirement.")),
            only(and(has(P.REQUIREMENT_COMPLETE_OWN), (ctx) => !ctx.p.has(P.REQUIREMENT_MANAGE)), para("You can tick the requirements assigned to you, and untick the ones you ticked.")),
            para("Ticking requirements moves the project's progress."),
        ],
        related: ["progress"],
    },
    {
        id: "meetings",
        title: "Setting up a meeting",
        category: "work",
        who: hasAny(P.MEETING_CREATE, P.MEETING_MANAGE),
        summary: "Meetings → New meeting: pick the project, the topic, the day and the time.",
        ask: ["meeting", "new meeting", "schedule meeting", "book a meeting", "client meeting", "site visit", "move meeting", "cancel meeting"],
        blocks: [
            steps(
                step("Open **Meetings** and choose **New meeting**.", "Meetings"),
                step("Pick the **Project**, the **Topic**, the **Date** and the **Time**, then **Schedule meeting**."),
            ),
            only(has(P.MEETING_MANAGE), para("You may record and remove anyone's meetings.")),
            only(and(has(P.MEETING_CREATE), (ctx) => !ctx.p.has(P.MEETING_MANAGE)), para("You can move or remove the meetings you set. Whoever manages meetings is told about the ones you set.")),
            links(link("Open meetings", { business: "meetings" })),
        ],
    },
    {
        id: "colleague-hours",
        title: "Why can't I see my colleagues' hours?",
        category: "work",
        who: isEmployee,
        summary: "How long each person works is private. You see your own hours; only managers see other people's.",
        ask: ["colleagues hours", "team hours", "other people's hours", "who worked how long", "privacy"],
        blocks: [
            para("On a project you can see who worked on it and when, but not for how long. Your own hours, pay and balance are yours; admins with the right permission see everyone's."),
        ],
        related: ["privacy"],
    },
    {
        id: "record-materials",
        title: "Recording materials on a site",
        category: "work",
        who: and(sees("execution"), hasAny(P.MATERIAL_CREATE, P.MATERIAL_MANAGE)),
        summary: "Open the site, then Materials → Add materials. Type them in, or paste rows straight from Excel.",
        ask: ["add materials", "record materials", "materials", "supplies", "delivery", "paste from excel", "supplier"],
        blocks: [
            steps(
                step("Open the site from **Projects**, then on its overview choose **Add materials**.", "Projects", "the site", "Materials"),
                step("Fill a row per material: name, quantity, unit and unit cost (or just the amount), supplier and a note. You can paste rows straight from Excel."),
                step("Save. Up to 100 at a time."),
            ),
            list(
                "A material's cost is quantity × unit cost when both are given, otherwise the amount you typed.",
                "Materials with the same name are grouped by type (capitals and extra spaces don't matter).",
            ),
            only(and(has(P.MATERIAL_CREATE), (ctx) => !ctx.p.has(P.MATERIAL_MANAGE)), para("You can change or remove the materials you recorded; an admin can correct anyone's.")),
            only(has(P.MATERIAL_MANAGE), para("You can correct or remove anyone's materials.")),
            note("A finished site takes no new materials."),
            links(link("Open sites", { business: "projects", only: "execution" })),
        ],
        related: ["materials-labour", "execution-pricing"],
    },
    {
        id: "labour-week",
        title: "Reporting a week of ground labour",
        category: "work",
        who: and(sees("execution"), hasAny(P.LABOUR_REPORT_CREATE, P.LABOUR_REPORT_MANAGE)),
        summary: "On the site's Weekly labour panel, fill in how many ground workers were on site each day, and what each was paid.",
        ask: ["labour", "labor", "ground labour", "weekly labour", "workers", "site workers", "daily pay", "report week"],
        blocks: [
            steps(
                step("Open the site, go to **Weekly labour** and pick the week.", "Projects", "the site", "Weekly labour"),
                step("For each day, enter the number of workers and the pay per worker, then submit the week."),
            ),
            list(
                "A labour week runs Monday to Saturday; nobody works on Sundays.",
                "A week you haven't reported starts from the site's defaults for each day.",
                "Each day costs workers × pay per worker. Ground labour is a cost of the site; it is never billed to the client.",
                "You can report weeks from the site's first week up to this one. Reporting a week again replaces its days.",
            ),
            only(and(has(P.LABOUR_REPORT_CREATE), (ctx) => !ctx.p.has(P.LABOUR_REPORT_MANAGE)), para("You can change the weeks you submitted; an admin can change anyone's.")),
            links(link("Open sites", { business: "projects", only: "execution" })),
        ],
        related: ["labour-defaults", "materials-labour"],
    },
    {
        id: "daily-log",
        title: "Writing the daily log",
        category: "work",
        who: executionEmployee,
        summary: "Daily log is your home: write what happened on a site as it happens, one log at a time, and find any earlier one by its site, day or words.",
        ask: ["daily log", "log", "summary", "what happened", "site diary", "delivery", "missing", "delay", "my sites"],
        blocks: [
            steps(
                step("Open **Daily log**, pick the site and say what happened: a delivery, a shortage, a delay.", "Daily log"),
                step("Save. Each log is kept on its own with the time you wrote it, so a day can have several."),
            ),
            list(
                "You can change a log until the end of the day you wrote it; after that it stays as it is.",
                "You write on the sites you oversee. **My sites** lists them; an admin puts you on a site.",
                "Your earlier logs are under the form: filter them by site and days, or search their words.",
            ),
            links(link("Open the daily log", { business: "daily-log", only: "execution" })),
        ],
        related: ["labour-week"],
    },
];

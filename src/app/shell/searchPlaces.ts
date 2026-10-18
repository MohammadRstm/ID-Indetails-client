import { P } from "@/app/permissions/codes";
import { DOMAINS, type Domain, type Permissions } from "@/app/permissions/permissions";
import { hasSeveralAreas } from "@/app/routing/areas";
import { domainHome } from "@/app/routing/home";
import { canOpen, companyRoutes } from "@/app/routing/routeTable";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import type { IconName } from "@/shared/icons/icons";
import { myProfilePath } from "./profilePath";
import type { ShellArea } from "./useArea";

/*
 * Every page and action the search can take someone to, with the words people use for it. Search is how new
 * people find their way around, so each place lists what someone might type when looking for it, not just its
 * name: "payroll", "wages" and "employee pay" all find Salaries. Where a place leads depends on who is asking
 * (teams are a company overview tab for super admins and a Settings section for a business's admins), and a
 * place this person can't open isn't offered at all. The API checks every request again.
 */

export type PlaceContext = {
    p: Permissions;
    area: ShellArea;
    userId: number;
    /** Actions a place can run instead of opening a page. */
    run: { logWork: () => void; toggleTheme: () => void; signOut: () => void; openProton: () => void };
    /** The theme now, to name the switch. */
    dark: boolean;
};

/** Who is asking and where they are: all a page's link needs (Help's links use it too). */
export type Where = Pick<PlaceContext, "p" | "area">;

/** Where a place leads for this person: a page, or something to do. */
export type Target = { path: string; sub?: string } | { act: () => void; sub?: string };

export type Place = {
    key: string;
    label: string | ((ctx: PlaceContext) => string);
    icon: IconName;
    /** What people type looking for it, besides its label. */
    words: string[];
    targets: (ctx: PlaceContext) => Target[];
    /** Offered before anything is typed, for these people. */
    starter?: "admin" | "employee" | "company";
};

/** A matched place, ready to list. */
export type Found = { key: string; label: string; icon: IconName; target: Target; score: number };

/**
 * A business page, in the business being looked at, or from the company area in each business this person may
 * open it in (named, when there are several).
 */
export function inBusinesses(ctx: Where, path: string, only?: Domain): Target[] {
    const { p, area } = ctx;
    const domains = (area.kind === "domain" ? [area.domain] : DOMAINS.filter((d) => p.canSeeDomain(d)))
        .filter((d) => (!only || d === only) && canOpen(p, d, path));
    return domains.map((d) => ({ path: `/${d}/${path}`, sub: area.kind === "company" && domains.length > 1 ? DOMAIN_LABEL[d] : undefined }));
}

/** A company page, when this person may open it. */
export function company(ctx: Where, path: string): Target[] {
    const route = companyRoutes.find((r) => r.path === path.split("?")[0]);
    return route?.access(ctx.p) ? [{ path: `/company/${path}` }] : [];
}

/** A Settings section: in the company area for those who reach it, otherwise in the business. */
export function settings(ctx: Where, section: string): Target[] {
    if (ctx.area.kind === "company") return company(ctx, `settings?section=${section}`);
    return inBusinesses(ctx, `settings?section=${section}`);
}

const when = (ok: boolean, targets: () => Target[]): Target[] => (ok ? targets() : []);

/** Teams: a company overview tab for those who see the company, a business's Settings section otherwise. */
function teams(ctx: PlaceContext): Target[] {
    if (ctx.p.has(P.COMPANY_VIEW)) return company(ctx, "overview?tab=teams");
    return inBusinesses(ctx, "settings?section=teams");
}

/** Everyone in the company for those who see it; a business's employees for its admins. */
function people(ctx: PlaceContext): Target[] {
    if (ctx.p.hasAll(P.COMPANY_VIEW, P.EMPLOYEE_VIEW)) return company(ctx, "overview?tab=people");
    return inBusinesses(ctx, "people");
}

function invite(ctx: PlaceContext): Target[] {
    if (ctx.p.has(P.COMPANY_VIEW) && ctx.p.hasAny(P.EMPLOYEE_INVITE, P.EMPLOYEE_INVITE_SUPER_ADMIN)) return company(ctx, "overview?tab=people&invite=1");
    return when(ctx.p.has(P.EMPLOYEE_INVITE), () => inBusinesses(ctx, "people?invite=1"));
}

export const PLACES: Place[] = [
    // ---- a business's pages ----
    {
        key: "overview", icon: "overview", starter: undefined,
        label: (ctx) => (ctx.area.kind === "domain" && ctx.area.domain === "execution" ? "Open dashboard" : "Open overview"),
        words: ["overview", "dashboard", "home", "home page", "start page", "main page", "summary", "kpis", "key figures", "stats", "statistics",
            "at a glance", "how are we doing", "numbers", "this month", "this quarter", "hours logged this week", "who is online"],
        targets: (ctx) => inBusinesses(ctx, "overview"),
    },
    {
        key: "projects", icon: "projects", label: "Open projects",
        words: ["projects", "project list", "all projects", "active projects", "jobs", "work", "sites", "site list", "construction sites",
            "ongoing projects", "current projects", "completed projects", "archived projects", "on hold"],
        targets: (ctx) => inBusinesses(ctx, "projects"),
    },
    {
        key: "new-project", icon: "plus", label: "New project", starter: "admin",
        words: ["new project", "create project", "add project", "start project", "start a project", "open a project", "new job", "new site",
            "add site", "start a site", "create site", "new client project", "new internal project"],
        targets: (ctx) => when(ctx.p.has(P.PROJECT_CREATE), () => inBusinesses(ctx, "projects?new=1")),
    },
    {
        key: "clients", icon: "briefcase", label: "Open clients", starter: "admin",
        words: ["clients", "client list", "customers", "customer list", "accounts", "contacts", "buyers", "client contacts",
            "who we work for", "client details", "phone numbers", "client emails"],
        targets: (ctx) => inBusinesses(ctx, "clients"),
    },
    {
        key: "new-client", icon: "userPlus", label: "Add client",
        words: ["add client", "new client", "create client", "add customer", "new customer", "create customer", "add contact"],
        targets: (ctx) => when(ctx.p.has(P.CLIENT_CREATE), () => inBusinesses(ctx, "clients?new=1")),
    },
    {
        key: "people", icon: "people", label: "Open employees",
        words: ["employees", "staff", "people", "team members", "colleagues", "workers", "personnel", "hr", "human resources",
            "employee list", "staff list", "who works here", "designers", "workforce", "users", "accounts", "everyone",
            "deactivate", "reactivate", "change role", "end sessions", "sign in suspended", "restore sign in", "super admins"],
        targets: people,
    },
    {
        key: "invite", icon: "userPlus", label: "Add employee", starter: "admin",
        words: ["invite", "invitation", "add employee", "new employee", "hire", "new hire", "onboard", "onboarding", "add person",
            "add staff", "add team member", "send invitation", "invite someone", "add user", "new user", "create account",
            "new account", "add admin", "add super admin"],
        targets: invite,
    },
    {
        key: "teams", icon: "people", label: "Open teams",
        words: ["teams", "team", "groups", "departments", "department", "squads", "units", "crews", "team list", "manage teams",
            "create team", "new team", "add team", "rename team", "delete team", "team members"],
        targets: teams,
    },
    {
        key: "financials", icon: "card", label: "Open financials", starter: "admin",
        words: ["financials", "finance", "finances", "money", "revenue", "profit", "income", "earnings", "margin", "margins",
            "p&l", "pnl", "profit and loss", "accounting", "books", "cash flow", "turnover", "sales", "how much we made",
            "expected revenue", "revenue received"],
        targets: (ctx) => inBusinesses(ctx, "financials"),
    },
    {
        key: "billing", icon: "file", label: "Billing and invoices", starter: "admin",
        words: ["invoices", "invoice", "billing", "bills", "bill", "payments", "payment", "payments received", "collected",
            "collections", "receivables", "money owed", "owed to us", "debtors", "unpaid", "outstanding", "payment history",
            "record payment", "new invoice", "send invoice", "draft invoices", "aging", "ageing"],
        targets: (ctx) => inBusinesses(ctx, "financials?tab=billing"),
    },
    {
        key: "overdue", icon: "alert", label: "Overdue invoices", starter: "admin",
        words: ["overdue", "overdue invoices", "late payments", "late invoices", "past due", "unpaid invoices", "chase payment",
            "who hasn't paid", "late clients"],
        targets: (ctx) => inBusinesses(ctx, "financials?tab=billing&overdue=1"),
    },
    {
        key: "costs", icon: "card", label: "Costs and expenses",
        words: ["costs", "cost", "project expenses", "expenses", "spending", "spend", "expenses by category", "labour cost", "labor cost",
            "materials cost", "material costs", "ground labour", "where the money goes", "cost breakdown", "biggest expenses"],
        targets: (ctx) => inBusinesses(ctx, "financials?tab=costs"),
    },
    {
        key: "project-profit", icon: "reports", label: "Profit by project",
        words: ["profit by project", "project profit", "profitability", "most profitable", "project money", "project financials",
            "project margins", "losing projects", "projects losing money"],
        targets: (ctx) => inBusinesses(ctx, "financials?tab=projects"),
    },
    {
        key: "client-revenue", icon: "briefcase", label: "Revenue by client",
        words: ["revenue by client", "client revenue", "top clients", "best clients", "best customers", "revenue per client", "biggest clients"],
        targets: (ctx) => inBusinesses(ctx, "financials?tab=clients"),
    },
    {
        key: "reports", icon: "reports", label: "Open reports", starter: "admin",
        words: ["reports", "report", "analytics", "insights", "statistics", "hours report", "utilisation", "utilization", "productivity",
            "timesheets", "timesheet", "who worked on what", "time report", "work entries", "everyone's hours", "export hours"],
        targets: (ctx) => inBusinesses(ctx, "reports"),
    },
    {
        key: "activity", icon: "activity", label: "Open activity", starter: "admin",
        words: ["activity", "activity feed", "feed", "history", "log", "audit", "audit log", "changes", "what happened",
            "recent changes", "timeline", "events", "who changed"],
        targets: (ctx) => inBusinesses(ctx, "activity"),
    },
    {
        key: "deadlines", icon: "calendar", label: "Deadlines",
        words: ["deadlines", "deadline", "due dates", "due", "upcoming deadlines", "tasks", "task", "to do", "todo", "requirements",
            "checklist", "what's due", "assigned to me", "my tasks"],
        targets: (ctx) => (ctx.p.isAdmin ? inBusinesses(ctx, "overview") : inBusinesses(ctx, "my-work")),
    },
    {
        key: "site-records", icon: "projects", label: "Site materials and labour",
        words: ["materials", "material", "supplies", "deliveries", "suppliers", "supplier", "ground labour", "ground labor", "labour weeks",
            "site workers", "site labour", "workers on site", "client statement", "client statements", "statements", "markup"],
        targets: (ctx) => inBusinesses(ctx, "projects", "execution").map((t) => ({ ...t, sub: "on each site" })),
    },
    {
        key: "meetings", icon: "calendar", label: "Open meetings",
        words: ["meetings", "meeting", "calls", "call", "appointments", "appointment", "calendar", "schedule a meeting", "client meeting",
            "site visit", "minutes", "agenda"],
        targets: (ctx) => inBusinesses(ctx, "meetings"),
    },
    {
        key: "messages", icon: "chat", label: "Open messages",
        words: ["messages", "message", "chat", "chats", "inbox", "conversations", "conversation", "dm", "direct message", "talk",
            "send a message", "group chat", "write to"],
        targets: (ctx) => (ctx.area.kind === "company" ? company(ctx, "messages") : inBusinesses(ctx, "messages")),
    },
    {
        key: "notifications", icon: "bell", label: "Open notifications",
        words: ["notifications", "notification", "alerts", "alert", "updates", "bell", "what's new", "reminders", "unread"],
        targets: (ctx) => (ctx.area.kind === "company" ? company(ctx, "notifications") : inBusinesses(ctx, "notifications")),
    },

    // ---- Settings and its sections ----
    {
        key: "settings", icon: "settings", label: "Settings", starter: "admin",
        words: ["settings", "preferences", "configuration", "config", "options", "setup", "set up", "admin settings", "workspace settings"],
        targets: (ctx) => (ctx.area.kind === "company" ? company(ctx, "settings") : inBusinesses(ctx, "settings")),
    },
    {
        key: "company-details", icon: "building", label: "Company details",
        words: ["company details", "company settings", "company name", "logo", "company logo", "change logo", "address", "website",
            "branding", "letterhead", "week start", "first day of the week", "time format", "24 hour", "12 hour", "default currency"],
        targets: (ctx) => settings(ctx, "general"),
    },
    {
        key: "time-settings", icon: "clock", label: "Time tracking settings",
        words: ["time tracking", "time settings", "working hours", "work week", "working week", "working days", "office hours",
            "9 to 5", "break", "lunch break", "overtime rate", "overtime multiplier", "edit window", "timer", "overlapping entries",
            "future entries", "description required", "log reminder"],
        targets: (ctx) => settings(ctx, "time"),
    },
    {
        key: "finance-settings", icon: "card", label: "Finance settings",
        words: ["finance settings", "invoicing", "invoice settings", "set up invoicing", "bank details", "bank account", "iban", "swift",
            "payment details", "invoice numbering", "payment terms", "due days", "exchange rate", "exchange rates", "lbp rate",
            "dollar rate", "lira", "lebanese pound", "currency rate"],
        targets: (ctx) => when(ctx.p.hasAny(P.BILLING_SETTINGS_MANAGE, P.EXCHANGE_RATE_MANAGE, P.COMPANY_SETTINGS_MANAGE, P.WORKING_TIME_MANAGE),
            () => settings(ctx, "finance")),
    },
    {
        key: "project-settings", icon: "projects", label: "Project settings",
        words: ["project settings", "auto archive", "archiving", "archive projects", "logging on hold", "hold logging", "project rules"],
        targets: (ctx) => settings(ctx, "projects"),
    },
    {
        key: "notification-settings", icon: "bell", label: "Notification settings",
        words: ["notification settings", "email notifications", "notification rules", "weekly summary", "idle projects", "mute",
            "stop notifications", "too many notifications", "digest"],
        targets: (ctx) => settings(ctx, "notifications"),
    },
    {
        key: "access", icon: "shield", label: "Admins and access",
        words: ["admins", "access", "permissions", "permission", "roles", "role", "admin rights", "rights", "privileges", "who can see",
            "grant access", "revoke access", "make admin", "custom permissions"],
        targets: (ctx) => when(ctx.p.hasAny(P.EMPLOYEE_INVITE, P.EMPLOYEE_INVITE_SUPER_ADMIN, P.PERMISSION_MANAGE), () => settings(ctx, "admins")),
    },
    {
        key: "data", icon: "database", label: "Data and export",
        words: ["data", "export", "exports", "download", "download data", "csv", "backup", "data export", "spreadsheet", "excel"],
        targets: (ctx) => settings(ctx, "data"),
    },
    {
        key: "theme", icon: "settings",
        label: (ctx) => (ctx.dark ? "Switch to light mode" : "Switch to dark mode"),
        words: ["dark mode", "light mode", "theme", "night mode", "appearance", "colors", "colours", "dark theme", "light theme", "dark", "light"],
        targets: (ctx) => [{ act: ctx.run.toggleTheme }],
    },
    {
        key: "proton", icon: "chat", label: "Ask Proton",
        words: ["proton", "assistant", "ai", "ask", "help me", "chat with proton", "ai assistant"],
        targets: (ctx) => when(ctx.p.has(P.PROTON_USE), () => [{ act: ctx.run.openProton }]),
    },
    {
        key: "proton-chats", icon: "chat", label: "Proton chats",
        words: ["proton chats", "chat history", "past chats", "saved chats", "my chats with proton", "assistant history"],
        targets: (ctx) => when(ctx.p.has(P.PROTON_USE), () => (ctx.area.kind === "company" ? company(ctx, "assistant") : inBusinesses(ctx, "assistant"))),
    },

    // ---- someone's own ----
    {
        key: "my-work", icon: "clock", label: "My work", starter: "employee",
        words: ["my work", "my hours", "my time", "my timesheet", "my entries", "hours logged", "time entries", "what i did",
            "my requirements", "my tasks", "my deadlines"],
        targets: (ctx) => when(!ctx.p.isAdmin, () => inBusinesses(ctx, "my-work")),
    },
    {
        key: "log-work", icon: "plus", label: "Log work", starter: "employee",
        words: ["log work", "log time", "log hours", "add hours", "track time", "record time", "timer", "start timer", "clock in",
            "time entry", "new entry", "add entry", "add work"],
        targets: (ctx) => when(ctx.p.canSeeDomain("design") && ctx.p.has(P.WORK_ENTRY_CREATE), () => [{ act: ctx.run.logWork }]),
    },
    {
        key: "my-pay", icon: "card", label: "My pay",
        words: ["my pay", "my salary", "salary", "pay", "payslip", "pay slip", "wages", "my wages", "earnings", "how much i earn",
            "hours balance", "overtime", "paycheck", "compensation", "hours short", "behind on hours"],
        targets: (ctx) => when(!ctx.p.isAdmin, () => inBusinesses(ctx, "pay")),
    },
    {
        key: "profile", icon: "user", label: "My profile", starter: "employee",
        words: ["profile", "my profile", "my account", "account", "my details", "my info", "photo", "picture", "avatar",
            "profile picture", "phone number", "edit profile", "my name", "me"],
        targets: (ctx) => {
            const path = myProfilePath(ctx.p, ctx.area, ctx.userId);
            return path ? [{ path }] : [];
        },
    },
    {
        key: "password", icon: "lock", label: "Change password",
        words: ["password", "change password", "new password", "update password", "reset password", "security"],
        targets: () => [{ path: "/change-password" }],
    },
    {
        key: "help", icon: "help", label: "Open help",
        words: ["help", "how do i", "how to", "guide", "guides", "faq", "questions", "manual", "instructions", "support",
            "explain", "explanation", "what does this mean", "how is it calculated", "glossary", "tutorial"],
        targets: (ctx) => [{ path: ctx.area.kind === "domain" ? `/${ctx.area.domain}/help` : "/company/help" }],
    },
    {
        key: "sign-out", icon: "logout", label: "Sign out",
        words: ["sign out", "log out", "logout", "signout", "exit", "leave"],
        targets: (ctx) => [{ act: ctx.run.signOut }],
    },

    // ---- the company area ----
    {
        key: "company-overview", icon: "chartTile", label: "Open company overview", starter: "company",
        words: ["company overview", "company dashboard", "both businesses", "company profit", "net profit", "company net profit",
            "profit and loss", "p&l", "company figures", "what the company keeps", "totals", "combined", "overall", "the whole company"],
        targets: (ctx) => company(ctx, "overview"),
    },
    {
        key: "company-expenses", icon: "card", label: "Open company expenses", starter: "company",
        words: ["company expenses", "expenses", "overhead", "overheads", "subscriptions", "subscription", "running costs", "rent",
            "office rent", "utilities", "electricity", "internet", "recurring costs", "recurring expenses", "fixed costs",
            "monthly costs", "software costs", "office costs", "operating costs"],
        targets: (ctx) => company(ctx, "overhead"),
    },
    {
        key: "add-company-expense", icon: "plus", label: "Add company expense",
        words: ["add expense", "new expense", "add company expense", "add subscription", "new subscription", "add overhead",
            "add running cost", "record expense", "add rent"],
        targets: (ctx) => when(ctx.p.has(P.OVERHEAD_MANAGE), () => company(ctx, "overhead?add=1")),
    },
    {
        key: "salaries", icon: "people", label: "Open salaries", starter: "company",
        words: ["salaries", "salary", "payroll", "employee pay", "staff pay", "pay", "wages", "pay run", "payslips", "compensation",
            "monthly pay", "who gets paid", "overtime pay", "overtime", "shortfall", "hours owed", "short on hours", "deductions",
            "excuse hours", "excused hours", "unpaid leave", "leave", "day off", "days off", "sick leave", "vacation"],
        targets: (ctx) => company(ctx, "salaries"),
    },
    {
        key: "project-pay", icon: "briefcase", label: "Open project pay", starter: "company",
        words: ["project pay", "labour cost by project", "labor cost by project", "what projects paid", "project payroll",
            "pay per project", "people cost per project", "hours cost", "cost of hours"],
        targets: (ctx) => company(ctx, "project-pay"),
    },
    {
        key: "schedules", icon: "calendar", label: "Open schedules", starter: "company",
        words: ["schedules", "schedule", "working hours", "work schedule", "personal schedule", "shifts", "shift", "roster", "rota",
            "timetable", "part time", "part-time", "someone's hours", "work days", "days off"],
        targets: (ctx) => company(ctx, "schedules"),
    },
    {
        key: "website", icon: "browser", label: "Open the company website's content",
        words: ["website", "company website", "public website", "portfolio", "moving strip", "conveyor", "website projects", "services",
            "offices", "locations", "social links", "contact email", "favicon"],
        targets: (ctx) => company(ctx, "website"),
    },
    {
        key: "areas", icon: "grid", label: "All areas",
        words: ["all areas", "areas", "launcher", "switch business", "switch area", "choose business", "home", "start"],
        targets: (ctx) => when(hasSeveralAreas(ctx.p), () => [{ path: "/company" }]),
    },
    ...DOMAINS.map((d): Place => ({
        key: `go-${d}`, icon: d === "design" ? "palette" : "building", label: `Go to ${DOMAIN_LABEL[d]}`,
        words: d === "design"
            ? ["design", "design business", "interior design", "interiors", "design studio"]
            : ["execution", "execution business", "construction", "build", "contracting", "sites"],
        targets: (ctx) => when(ctx.p.canSeeDomain(d) && !(ctx.area.kind === "domain" && ctx.area.domain === d), () => [{ path: domainHome(ctx.p, d) }]),
    })),
];

/** Lower case, "&" as "and", punctuation as spaces, and plurals as their singular ("salaries" is "salary"). */
export function words(text: string): string[] {
    return text.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean).map(singular);
}

function singular(word: string): string {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
}

/** Edits (insert, delete, change, swap) between two short words, up to a limit. */
function distance(a: string, b: string, limit: number): number {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
    }
    return rows[a.length][b.length];
}

/** Whether a typed word is (the start of) a word of the term, allowing a typo in longer words. */
function wordMatch(typed: string, word: string): "exact" | "prefix" | "typo" | null {
    if (typed === word) return "exact";
    if (word.startsWith(typed)) return "prefix";
    const limit = typed.length >= 8 ? 2 : typed.length >= 4 ? 1 : 0;
    if (!limit) return null;
    // a typo in a word typed in full, or in the part of a longer word typed so far
    return distance(typed, word, limit) <= limit || distance(typed, word.slice(0, typed.length), limit) <= limit ? "typo" : null;
}

/**
 * How well a search fits one of a place's terms: 100 for the term itself, 90 for its start, 75 when every typed word
 * starts a word of it (65 when the term has more words than were typed), 55 when that takes a typo. 0 when it doesn't fit.
 */
export function termScore(typed: string[], term: string[]): number {
    const phrase = typed.join(" "), whole = term.join(" ");
    // "log out" is "logout", "pay slips" is "payslips"
    const joined = typed.join(""), solid = term.join("");
    if (phrase === whole || joined === solid) return 100;
    if (whole.startsWith(phrase) || solid.startsWith(joined)) return 90;
    let typos = false;
    for (const t of typed) {
        const best = term.map((w) => wordMatch(t, w)).sort((a, b) => rank(a) - rank(b))[0];
        if (!best) return 0;
        if (best === "typo") typos = true;
    }
    return typos ? 55 : term.length > typed.length ? 65 : 75;
}

const rank = (m: ReturnType<typeof wordMatch>) => (m === "exact" ? 0 : m === "prefix" ? 1 : m === "typo" ? 2 : 3);

/** A score this good puts the place above the API's projects, clients and people. */
export const STRONG = 75;

/** The places this person may open that fit what they typed, best first; the starters of their area when nothing is typed. */
export function findPlaces(ctx: PlaceContext, query: string): Found[] {
    const typed = words(query);
    const starter = ctx.area.kind === "company" ? "company" : ctx.p.isAdmin ? "admin" : "employee";
    const found: Found[] = [];
    PLACES.forEach((place, order) => {
        const label = typeof place.label === "function" ? place.label(ctx) : place.label;
        const score = typed.length === 0
            ? (place.starter === starter ? 1 : 0)
            : Math.max(...[label.replace(/^Open /, ""), label, ...place.words].map((t) => termScore(typed, words(t))));
        if (!score) return;
        for (const target of place.targets(ctx)) {
            // in the company area its own pages win a tie with a business's
            const home = ctx.area.kind === "company" && "path" in target && target.path.startsWith("/company") ? 0.5 : 0;
            found.push({ key: `${place.key}:${"path" in target ? target.path : "act"}`, label, icon: place.icon, target, score: score + home - order / 1000 });
        }
    });
    return found.sort((a, b) => b.score - a.score);
}

import type { ReactNode } from "react";
import { matchPath } from "react-router";
import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import type { IconName } from "@/shared/icons/icons";
import {
    ActivityPage,
    ClientPage,
    ClientsPage,
    CompanyExpensesPage,
    DailyLogPage,
    MySitesPage,
    SiteLogsPage,
    BoxPage,
    CompanyOverviewPage,
    CompanyProfilePage,
    CompanySettingsPage,
    FinancialsRoute,
    HelpPage,
    MeetingsPage,
    MessagesPage,
    ProtonPage,
    MyProfilePage,
    MyWorkRoute,
    NotificationsPage,
    OverviewRoute,
    PeoplePage,
    PersonProfilePage,
    ProjectPayPage,
    ProjectRoute,
    ProjectsPage,
    ProtonBudgetPage,
    ReportsPage,
    SalariesPage,
    SchedulesPage,
    SettingsPage,
    WebsiteAnalyticsPage,
    WebsiteContactPage,
    WebsiteLocationsPage,
    WebsiteProjectsPage,
    WebsiteServicesPage,
    WebsiteSitePage,
    WebsiteStaffPage,
} from "./pages";
import MovedWebsite from "./MovedWebsite";

/*
 * Every screen, once. A route names the page an admin sees and the page an employee sees, what each needs,
 * and its place in the sidebar. A page that has only an admin version is the one an employee gets too, as
 * soon as their permissions allow it: what they see in it then follows their permissions, part by part. The
 * route guard and the sidebar both read this table, so a nav item and the route behind it can never disagree.
 *
 * Access here decides what the client shows; the API checks every request again.
 */

export type AccessContext = { p: Permissions; domain: Domain };
export type AccessRule = (ctx: AccessContext) => boolean;

export type RoutePage = { element: ReactNode; access: AccessRule };

export type NavEntry = {
    label: string | ((domain: Domain) => string);
    icon: IconName;
    /** Under the "Workspace" heading. */
    section?: "workspace";
    /** A count next to the label. */
    count?: "projects" | "clients" | "people";
};

export type DomainRoute = {
    path: string;
    /** Which nav item lights up; defaults to the first segment of the path. */
    navKey?: string;
    nav?: NavEntry;
    admin?: RoutePage;
    employee?: RoutePage;
};

export type CompanyRoute = {
    path: string;
    navKey?: string;
    nav?: NavEntry;
    element: ReactNode;
    access: (p: Permissions) => boolean;
};

const signedIn: AccessRule = () => true;
const all = (...codes: Parameters<Permissions["hasAll"]>): AccessRule => ({ p }) => p.hasAll(...codes);
const any = (...codes: Parameters<Permissions["hasAny"]>): AccessRule => ({ p }) => p.hasAny(...codes);
const designOnly = (rule: AccessRule): AccessRule => (ctx) => ctx.domain === "design" && rule(ctx);
const executionOnly = (rule: AccessRule): AccessRule => (ctx) => ctx.domain === "execution" && rule(ctx);

/** Anything a settings page lets someone manage. */
const SETTINGS_CODES = [
    P.DOMAIN_SETTINGS_MANAGE,
    P.BILLING_SETTINGS_MANAGE,
    P.EXCHANGE_RATE_MANAGE,
    P.COMPANY_SETTINGS_MANAGE,
    P.WORKING_TIME_MANAGE,
    P.TEAM_MANAGE,
    P.EMPLOYEE_INVITE,
    P.EMPLOYEE_INVITE_SUPER_ADMIN,
    P.PERMISSION_MANAGE,
] as const;

export const domainRoutes: DomainRoute[] = [
    {
        // an Execution site staff member's home: what happened on their sites, one log at a time
        path: "daily-log",
        nav: { label: "Daily log", icon: "file" },
        employee: { element: <DailyLogPage />, access: executionOnly(all(P.SITE_LOG_CREATE)) },
    },
    {
        path: "sites",
        nav: { label: "My sites", icon: "projects" },
        employee: { element: <MySitesPage />, access: executionOnly(any(P.SITE_LOG_CREATE, P.LABOUR_REPORT_CREATE)) },
    },
    {
        path: "overview",
        nav: { label: (d) => (d === "execution" ? "Dashboard" : "Overview"), icon: "overview" },
        admin: { element: <OverviewRoute />, access: all(P.REPORT_VIEW) },
    },
    {
        // the pool of every site's client payments, and the money moved to sites in the red
        path: "box",
        nav: { label: "The box", icon: "database" },
        admin: { element: <BoxPage />, access: executionOnly(all(P.FINANCIAL_VIEW)) },
    },
    {
        path: "projects",
        nav: { label: "Projects", icon: "projects", count: "projects" },
        admin: { element: <ProjectsPage />, access: all(P.PROJECT_VIEW) },
        // site staff reach their sites from My sites
        employee: { element: <ProjectsPage />, access: designOnly(all(P.PROJECT_VIEW)) },
    },
    {
        path: "projects/:id",
        navKey: "projects",
        admin: { element: <ProjectRoute />, access: all(P.PROJECT_VIEW) },
    },
    {
        path: "clients",
        nav: { label: "Clients", icon: "briefcase", count: "clients" },
        admin: { element: <ClientsPage />, access: all(P.CLIENT_VIEW) },
    },
    {
        path: "clients/:id",
        navKey: "clients",
        admin: { element: <ClientPage />, access: all(P.CLIENT_VIEW) },
    },
    {
        // Built on logged hours, so Design only; an Execution person's profile is still reachable from their name.
        path: "people",
        nav: { label: "Employees", icon: "people", count: "people" },
        admin: { element: <PeoplePage />, access: designOnly(all(P.EMPLOYEE_VIEW)) },
    },
    {
        path: "people/:id",
        navKey: "people",
        admin: { element: <PersonProfilePage />, access: all(P.EMPLOYEE_VIEW) },
    },
    {
        path: "site-logs",
        nav: { label: "Daily logs", icon: "file" },
        admin: { element: <SiteLogsPage />, access: executionOnly(all(P.SITE_LOG_VIEW_ALL)) },
    },
    {
        path: "financials",
        nav: { label: "Financials", icon: "card" },
        admin: { element: <FinancialsRoute />, access: all(P.FINANCIAL_VIEW) },
    },
    {
        path: "my-work",
        nav: { label: "My work", icon: "clock" },
        employee: {
            element: <MyWorkRoute />,
            // site staff have their daily log instead
            access: designOnly(all(P.WORK_ENTRY_VIEW_OWN)),
        },
    },
    {
        path: "meetings",
        nav: { label: "Meetings", icon: "calendar" },
        // admins set meetings from their Overview's Meetings tab, super admins from the company overview's
        employee: { element: <MeetingsPage />, access: designOnly(all(P.PROJECT_VIEW)) },
    },
    {
        path: "activity",
        nav: { label: "Activity", icon: "activity" },
        admin: { element: <ActivityPage />, access: designOnly(all(P.ACTIVITY_VIEW)) },
        // an employee given activity:view sees it too; the feed leaves out what their other permissions don't cover
        employee: { element: <ActivityPage />, access: designOnly(all(P.ACTIVITY_VIEW)) },
    },
    {
        path: "reports",
        nav: { label: "Reports", icon: "reports" },
        admin: { element: <ReportsPage />, access: designOnly(all(P.REPORT_VIEW)) },
    },
    {
        path: "profile",
        nav: { label: "Profile", icon: "user" },
        employee: { element: <MyProfilePage />, access: signedIn },
    },
    {
        path: "settings",
        nav: { label: "Settings", icon: "settings", section: "workspace" },
        admin: { element: <SettingsPage />, access: any(...SETTINGS_CODES) },
    },
    {
        path: "notifications",
        admin: { element: <NotificationsPage />, access: signedIn },
        employee: { element: <NotificationsPage />, access: signedIn },
    },
    {
        path: "messages",
        admin: { element: <MessagesPage />, access: signedIn },
        employee: { element: <MessagesPage />, access: signedIn },
    },
    {
        // Proton's own page: the person's saved chats, reached from the panel's "Go to chat"
        path: "assistant/:chatId?",
        admin: { element: <ProtonPage />, access: ({ p }) => p.has(P.PROTON_USE) },
        employee: { element: <ProtonPage />, access: ({ p }) => p.has(P.PROTON_USE) },
    },
    {
        // reached from the top bar's "?", the account menu and search; each person reads what fits what they may do
        path: "help",
        admin: { element: <HelpPage />, access: signedIn },
        employee: { element: <HelpPage />, access: signedIn },
    },
];

export const companyRoutes: CompanyRoute[] = [
    { path: "overview", nav: { label: "Overview", icon: "chartTile" }, element: <CompanyOverviewPage />, access: (p) => p.has(P.COMPANY_VIEW) },
    { path: "overhead", nav: { label: "Expenses", icon: "card" }, element: <CompanyExpensesPage />, access: (p) => p.hasAny(P.COMPANY_VIEW, P.OVERHEAD_MANAGE) },
    { path: "salaries", nav: { label: "Salaries", icon: "people" }, element: <SalariesPage />, access: (p) => p.has(P.SALARY_VIEW) },
    { path: "project-pay", nav: { label: "Project pay", icon: "briefcase" }, element: <ProjectPayPage />, access: (p) => p.has(P.SALARY_VIEW) },
    { path: "schedules", nav: { label: "Schedules", icon: "calendar" }, element: <SchedulesPage />, access: (p) => p.has(P.SCHEDULE_MANAGE) },
    // the website moved to its own area: old links still land on the right page
    { path: "website", element: <MovedWebsite />, access: () => true },
    // the assistant's cost and budget: super admins only, everyone else sees just their question allowance
    { path: "proton", nav: { label: "Proton", icon: "compass", section: "workspace" }, element: <ProtonBudgetPage />, access: (p) => p.has(P.PROTON_BUDGET_MANAGE) },
    // the company's own settings and each business's, for whoever reaches the company area
    { path: "settings", nav: { label: "Settings", icon: "settings", section: "workspace" }, element: <CompanySettingsPage />, access: (p) => p.has(P.COMPANY_VIEW) && p.hasAny(...SETTINGS_CODES) },
    { path: "profile", element: <CompanyProfilePage />, access: () => true },
    { path: "notifications", element: <NotificationsPage />, access: () => true },
    { path: "messages", element: <MessagesPage />, access: () => true },
    { path: "assistant/:chatId?", element: <ProtonPage />, access: (p) => p.has(P.PROTON_USE) },
    { path: "help", element: <HelpPage />, access: () => true },
];

const website = (p: Permissions) => p.hasAny(P.WEBSITE_VIEW, P.WEBSITE_MANAGE);

/**
 * The Website area: what the company's public website shows, for its own staff, super admins and anyone given a
 * website permission (the area guard checks they may enter it). Nothing here involves projects, clients or money.
 */
export const websiteRoutes: CompanyRoute[] = [
    { path: "projects", nav: { label: "Projects", icon: "projects" }, element: <WebsiteProjectsPage />, access: website },
    // the website's visitors, from Google Analytics: a permission of its own, not part of seeing the content
    { path: "analytics", nav: { label: "Analytics", icon: "chartTile" }, element: <WebsiteAnalyticsPage />, access: (p) => p.has(P.WEBSITE_ANALYTICS_VIEW) },
    { path: "services", nav: { label: "Services", icon: "briefcase" }, element: <WebsiteServicesPage />, access: website },
    { path: "locations", nav: { label: "Locations", icon: "pin" }, element: <WebsiteLocationsPage />, access: website },
    { path: "contact", nav: { label: "Contact & social", icon: "mail" }, element: <WebsiteContactPage />, access: website },
    { path: "site", nav: { label: "Site", icon: "browser" }, element: <WebsiteSitePage />, access: website },
    // the website's own staff, for whoever may see people
    { path: "staff", nav: { label: "Staff", icon: "people", section: "workspace" }, element: <WebsiteStaffPage />, access: (p) => p.has(P.EMPLOYEE_VIEW) },
    { path: "profile", element: <CompanyProfilePage />, access: () => true },
    { path: "notifications", element: <NotificationsPage />, access: () => true },
    { path: "messages", element: <MessagesPage />, access: () => true },
    { path: "help", element: <HelpPage />, access: () => true },
];

/**
 * The page a person gets on a route: the admin page for admins; for employees their own page, or the admin
 * page where there is no employee version (it shows them what their permissions cover).
 */
export function pageFor(route: DomainRoute, p: Permissions): RoutePage | undefined {
    return p.isAdmin ? route.admin : route.employee ?? route.admin;
}

/** Whether this person may open a domain page, such as "clients/12" or "financials?tab=billing". */
export function canOpen(p: Permissions, domain: Domain, path: string): boolean {
    if (!p.canSeeDomain(domain)) return false;
    const pathname = `/${path.split("?")[0]}`;
    const route = domainRoutes.find((r) => matchPath(`/${r.path}`, pathname));
    const page = route && pageFor(route, p);
    return !!page && page.access({ p, domain });
}

export type NavItem = { key: string; path: string; label: string; icon: IconName; section?: "workspace"; count?: NavEntry["count"] };

/** The sidebar of a domain: the routes with a nav entry whose page this person may open. */
export function domainNav(p: Permissions, domain: Domain): NavItem[] {
    return domainRoutes.flatMap((route) => {
        const page = pageFor(route, p);
        if (!route.nav || !page || !page.access({ p, domain })) return [];
        const { label, icon, section, count } = route.nav;
        return [{ key: route.path, path: route.path, label: typeof label === "function" ? label(domain) : label, icon, section, count }];
    });
}

export function companyNav(p: Permissions): NavItem[] {
    return areaNav(companyRoutes, p);
}

export function websiteNav(p: Permissions): NavItem[] {
    return p.hasWebsiteArea ? areaNav(websiteRoutes, p) : [];
}

function areaNav(routes: CompanyRoute[], p: Permissions): NavItem[] {
    return routes.flatMap((route) => {
        if (!route.nav || !route.access(p)) return [];
        return [{ key: route.path, path: route.path, label: route.nav.label as string, icon: route.nav.icon, section: route.nav.section }];
    });
}

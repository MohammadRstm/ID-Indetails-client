import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { canOpen, companyRoutes, websiteRoutes } from "@/app/routing/routeTable";
import { previewPath } from "@/domains/design/projects/portal/previewApi";

export type ProtonSurface = NonNullable<Schemas["ProtonSurface"]>;

/** Where a surface opens: a route of this app (its own link opens it), or an opener a showing page registered. */
export type SurfaceTarget = { kind: "go"; path: string } | { kind: "opener"; id: string } | { kind: "log_work" };

/** `itemId`: a project file, for its comments or its thread in the discussion. */
type Ask = { p: Permissions; domain: Domain | null; id: number | null; section: string | null; tab: string | null; itemId?: number | null };

/** The settings sections and company tabs a link may name: the pages' own. */
const SETTINGS = ["general", "time", "finance", "projects", "notifications", "teams", "admins", "data"] as const;
const COMPANY_TABS = ["overview", "people", "teams"] as const;

const inArea = (a: Ask, path: string, allowed = true): SurfaceTarget | null =>
    allowed && a.domain && canOpen(a.p, a.domain, path.split("?")[0]) ? { kind: "go", path: `/${a.domain}/${path}` } : null;
const inCompany = (a: Ask, path: string, allowed = true): SurfaceTarget | null =>
    allowed && companyRoutes.find((r) => r.path === path.split("?")[0])?.access(a.p) ? { kind: "go", path: `/company/${path}` } : null;
const onRecord = (a: Ask, page: "projects" | "clients", query: string, allowed: boolean) =>
    a.id != null ? inArea(a, `${page}/${a.id}?${query}`, allowed) : null;
/** In the Website area, which isn't a business: for those who may enter it and open the page. */
const inWebsite = (a: Ask, path: string, allowed = true): SurfaceTarget | null =>
    allowed && a.p.hasWebsiteArea && websiteRoutes.find((r) => r.path === path.split("?")[0])?.access(a.p) ? { kind: "go", path: `/website/${path}` } : null;
/** A Design project's files and client portal tabs: the page itself works out who may see which part. */
const onDesignProject = (a: Ask, query: string, allowed = true) => (a.domain === "design" ? onRecord(a, "projects", query, allowed) : null);
const seesPortalFiles = (p: Permissions) => p.hasAny(P.CLIENT_PORTAL_MANAGE, P.CLIENT_ACCESS_MANAGE);

/**
 * Every surface the API can name, and where it is here: the same permissions the page itself checks before it shows
 * the window, so Proton never gets further than the person would. The API's list (ProtonSurfaces.cs) is the same;
 * one-click confirm dialogs (complete, void, delete, deactivate, top-up) are on neither, so nothing can open them.
 */
export const SURFACES: Record<ProtonSurface, (a: Ask) => SurfaceTarget | null> = {
    new_project: (a) => inArea(a, "projects?new=1", a.p.has(P.PROJECT_CREATE)),
    new_client: (a) => inArea(a, "clients?new=1", a.p.has(P.CLIENT_CREATE)),
    invite_person: (a) => inArea(a, "people?invite=1", a.p.has(P.EMPLOYEE_INVITE)),
    edit_project: (a) => onRecord(a, "projects", "details=1", a.p.has(P.PROJECT_EDIT)),
    edit_client: (a) => onRecord(a, "clients", "details=1", a.p.has(P.CLIENT_MANAGE)),
    project_report: (a) => onRecord(a, "projects", "report=1", a.domain === "design" && a.p.hasAll(P.FINANCIAL_VIEW, P.WORK_ENTRY_VIEW_ALL)),
    project_payment_terms: (a) => onRecord(a, "projects", "money=payment", a.domain === "design" && a.p.hasAll(P.FINANCIAL_VIEW, P.PROJECT_EDIT)),
    add_project_expense: (a) => onRecord(a, "projects", "money=expense", a.p.hasAll(P.FINANCIAL_VIEW, P.EXPENSE_MANAGE)),
    site_pricing: (a) => onRecord(a, "projects", "money=pricing", a.domain === "execution" && a.p.hasAll(P.FINANCIAL_VIEW, P.PROJECT_PRICING_MANAGE)),
    new_invoice: (a) => onRecord(a, "projects", "invoice=new", a.p.hasAll(P.FINANCIAL_VIEW, P.INVOICE_CREATE)),
    record_payment: (a) => onRecord(a, "projects", "pay=1", a.p.hasAll(P.FINANCIAL_VIEW, P.PAYMENT_RECORD)),
    new_statement: (a) => onRecord(a, "projects", "statement=new", a.domain === "execution" && a.p.has(P.STATEMENT_CREATE)),
    new_meeting: (a) => inArea(a, "meetings?new=1", a.p.hasAny(P.MEETING_CREATE, P.MEETING_MANAGE)),
    add_company_expense: (a) => inCompany(a, "overhead?add=1", a.p.has(P.OVERHEAD_MANAGE)),
    message_person: (a) => (a.id != null ? inArea(a, `messages?with=${a.id}`) : null),
    message_team: (a) => (a.id != null ? inArea(a, `messages?group=${a.id}`) : null),
    log_work: (a) => (a.domain === "design" && a.p.canSeeDomain("design") && a.p.has(P.WORK_ENTRY_CREATE) ? { kind: "log_work" } : null),
    report_bug: () => ({ kind: "opener", id: "report_bug" }),
    settings_section: (a) => (SETTINGS.includes(a.section as never) ? inArea(a, `settings?section=${a.section}`) : null),
    company_overview_tab: (a) => (COMPANY_TABS.includes(a.tab as never) ? inCompany(a, a.tab === "overview" ? "overview" : `overview?tab=${a.tab}`) : null),
    new_website_project: (a) => inWebsite(a, "projects?new=1", a.p.has(P.WEBSITE_MANAGE)),
    // whoever only sees the website gets the project's form to read
    edit_website_project: (a) => (a.id != null ? inWebsite(a, `projects?project=${a.id}`) : null),
    invite_website_staff: (a) => inWebsite(a, "staff?invite=1", a.p.hasAny(P.EMPLOYEE_INVITE, P.EMPLOYEE_INVITE_SUPER_ADMIN)),
    file_comments: (a) => (a.itemId != null ? onDesignProject(a, `tab=files&comments=${a.itemId}`, a.p.has(P.PROJECT_VIEW)) : null),
    // the discussion is for whoever takes part in it, which only the server knows: the tab shows it to them alone
    portal_discussion: (a) => onDesignProject(a, `tab=portal&part=discussion${a.itemId != null ? `&item=${a.itemId}` : ""}`),
    // the preview has a page of its own, outside the app's shell
    portal_preview: (a) => (a.domain === "design" && a.id != null && a.p.canSeeDomain("design") && seesPortalFiles(a.p) ? { kind: "go", path: previewPath(a.id) } : null),
};

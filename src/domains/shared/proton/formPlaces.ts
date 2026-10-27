import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import type { FormFill } from "./formFill";
import { inArea, inCompany, inWebsite, onDesignProject, onRecord, SURFACES, type Ask, type SurfaceTarget } from "./surfaces";

/** What a fill command says beside the fill: the record it is about (a project, a person) and its business. */
export type FillAt = { id: number | null; domain: Domain | null };

/**
 * Where each form Proton fills lives here, so a fill opens its own form when it isn't open yet: the same routes and
 * the same permissions the pages check, as for surfaces. A fill's `id` is the record the form edits (or the project or
 * person it is on); `at` is the record the API resolved it to. Null when the person couldn't open the form.
 */
export function placeOf(fill: FormFill, at: FillAt, p: Permissions, current: Domain | null): SurfaceTarget | null {
    const ask = (domain: Domain | null, id: number | null, extra: Partial<Ask> = {}): Ask =>
        ({ p, domain, id, section: null, tab: null, ...extra });
    const area = at.domain ?? current;
    const project = (domain: Domain | null = at.domain) => ask(domain, at.id);
    // the files, the client portal and work entries are Design's: never another business's record with the same id
    const design = at.domain == null || at.domain === "design" ? "design" as const : null;
    switch (fill.form) {
        case "client":
            return fill.id != null ? SURFACES.edit_client(ask(area, fill.id)) : SURFACES.new_client(ask(current, null));
        case "meeting":
            return SURFACES.new_meeting(ask(current, null));
        case "new_project":
            return SURFACES.new_project(ask(current, null));
        case "edit_project":
            return SURFACES.edit_project(project());
        case "report_bug":
            return SURFACES.report_bug(ask(null, null));
        case "invite":
            return SURFACES.invite_person(ask(current, null));
        case "log_work":
            return SURFACES.log_work(ask("design", null));
        case "requirement":
            return onRecord(project(), "projects", `tab=requirements${fill.id != null ? `&requirement=${fill.id}` : ""}`, p.has(P.REQUIREMENT_MANAGE));
        case "work_entry_comment":
            return design && at.id != null && fill.id != null ? inArea(ask(design, null), `people/${at.id}?entry=${fill.id}`, p.has(P.WORK_ENTRY_COMMENT)) : null;
        case "report_options":
            return SURFACES.project_report(project());
        case "team":
            return p.has(P.COMPANY_VIEW)
                ? inCompany(ask(null, null), "overview?tab=teams", p.has(P.TEAM_MANAGE))
                : inArea(ask(current, null), "settings?section=teams", p.has(P.TEAM_MANAGE));
        case "profile":
            // one's own profile page: in one's business, else the company area's, else the Website area's
            return (current ? inArea(ask(current, null), "profile?edit=1") : null)
                ?? (p.isWebsiteStaff ? inWebsite(ask(null, null), "profile?edit=1") : inCompany(ask(null, null), "profile?edit=1"));
        case "file_rename":
            return fill.id != null ? onDesignProject(project(design), `tab=files&rename=${fill.id}`, p.has(P.PROJECT_VIEW)) : null;
        case "file_comment":
            return design && SURFACES.file_comments(ask(design, at.id, { itemId: fill.id }));
        case "portal_intro":
            return onDesignProject(project(design), "tab=portal&part=presentation", p.has(P.CLIENT_PORTAL_MANAGE));
        case "portal_message":
            return design && SURFACES.portal_discussion(ask(design, at.id, { itemId: fill.portalMessage?.itemId ?? null }));
        case "website_project":
            return fill.id != null ? SURFACES.edit_website_project(ask(null, fill.id)) : SURFACES.new_website_project(ask(null, null));
        case "website_service":
            return inWebsite(ask(null, null), `services?${fill.id != null ? `edit=${fill.id}` : "add=1"}`, p.has(P.WEBSITE_MANAGE));
        case "website_location":
            return inWebsite(ask(null, null), `locations?${fill.id != null ? `edit=${fill.id}` : "add=1"}`, p.has(P.WEBSITE_MANAGE));
        case "website_social_link":
            return inWebsite(ask(null, null), `contact?${fill.id != null ? `edit=${fill.id}` : "add=1"}`, p.has(P.WEBSITE_MANAGE));
        case "company_details":
            return inCompany(ask(null, null), "settings?section=general", p.has(P.COMPANY_SETTINGS_MANAGE));
        case "company_expense":
            return fill.id != null ? inCompany(ask(null, null), `overhead?edit=${fill.id}`, p.has(P.OVERHEAD_MANAGE)) : SURFACES.add_company_expense(ask(null, null));
        case "materials":
            return at.domain === "execution" ? onRecord(project(), "projects", "materials=add", p.hasAny(P.MATERIAL_CREATE, P.MATERIAL_MANAGE)) : null;
        case "invoice":
            return fill.id != null
                ? onRecord(project(), "projects", `edit=${fill.id}`, p.hasAll(P.FINANCIAL_VIEW, P.INVOICE_CREATE))
                : SURFACES.new_invoice(project());
        case "payment":
            return SURFACES.record_payment(project());
        case "project_expense":
            return SURFACES.add_project_expense(project());
        case "labour_week":
            return at.domain === "execution"
                ? onRecord(project(), "projects", `labour=${fill.labourWeek?.week ?? "current"}`, p.hasAny(P.LABOUR_REPORT_CREATE, P.LABOUR_REPORT_MANAGE))
                : null;
        case "schedule":
            return inCompany(ask(null, null), `schedules?schedule=${fill.id}`, p.has(P.SCHEDULE_MANAGE));
        case "hour_excuse":
            return inCompany(ask(null, null), `salaries?person=${fill.id}`, p.has(P.HOURS_EXCUSE));
        default:
            return null;
    }
}

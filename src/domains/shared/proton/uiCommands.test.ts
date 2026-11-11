import { describe, expect, it } from "vitest";
import { permissionsOf } from "@/app/permissions/permissions";
import { personas } from "@/test/personas";
import { SURFACES, type ProtonSurface } from "./surfaces";
import { stepOf } from "./uiCommands";
import { pageContextOf } from "./useProtonPageContext";

const designAdmin = permissionsOf(personas.designAdmin);
const superAdmin = permissionsOf(personas.superAdmin);
const command = (fields: Record<string, unknown>) => ({ label: "It", id: null, domain: null, section: null, page: null, clientId: null, tab: null, ...fields });

describe("Proton's UI commands", () => {
    it("turn into this app's own routes", () => {
        expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section: "requirements" }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/projects/42?tab=requirements", label: "It" });
        // the project page's newer tabs
        for (const section of ["financials", "payments", "vos", "insights", "analytics", "contributors"]) {
            expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section }), designAdmin, "design"))
                .toEqual({ kind: "go", path: `/design/projects/42?tab=${section}`, label: "It" });
        }
        expect(stepOf(command({ type: "open_client", id: 3, domain: "design" }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/clients/3", label: "It" });
        // a company-wide person opens in the area the person is in
        expect(stepOf(command({ type: "open_person", id: 9, domain: null }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/people/9", label: "It" });
        expect(stepOf(command({ type: "open_page", page: "projects", domain: "design", clientId: 3 }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/projects?client=3", label: "It" });
        expect(stepOf(command({ type: "open_page", page: "company_overview" }), superAdmin, null))
            .toEqual({ kind: "go", path: "/company/overview", label: "It" });
        // the Financials page's tabs, its Insights tab included
        for (const tab of ["billing", "costs", "insights"]) {
            expect(stepOf(command({ type: "open_page", page: "financials", domain: "execution", tab }), superAdmin, "execution"))
                .toEqual({ kind: "go", path: `/execution/financials?tab=${tab}`, label: "It" });
        }
        expect(stepOf(command({ type: "open_page", page: "financials", domain: "design", tab: "risks" }), superAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/financials", label: "It" });
        expect(stepOf(command({ type: "refresh" }), designAdmin, "design")).toEqual({ kind: "refresh" });
    });

    it("reject what they don't know, can't parse, or the person may not open", () => {
        const refused = [
            command({ type: "navigate_to_url", url: "javascript:alert(1)" }),
            command({ type: "open_project", id: "42", domain: "design" }),
            command({ type: "open_project", id: -1, domain: "design" }),
            command({ type: "open_project", id: 1.5, domain: "design" }),
            command({ type: "open_project", id: 42, domain: "../admin" }),
            command({ type: "open_project", id: 42, domain: "execution" }), // a domain this admin can't see
            command({ type: "open_page", page: "admin_panel", domain: "design" }),
            command({ type: "open_page", page: "company_overview" }), // the company area isn't a Design admin's
            null,
            "open_project",
        ];
        for (const c of refused) expect(stepOf(c, designAdmin, "design")).toBeNull();
        // an unknown tab or section is dropped, not passed through
        expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section: "x\"><script>" }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/projects/42", label: "It" });
    });
});

describe("the page context", () => {
    it("names the area, page, record and tab only", () => {
        expect(pageContextOf("/design/projects/42", "?tab=requirements&report=1"))
            .toEqual({ area: "design", page: "projects", entityType: "project", entityId: 42, section: "requirements", part: null, surface: null });
        expect(pageContextOf("/design/projects/42", "?tab=contributors")?.section).toBe("contributors");
        expect(pageContextOf("/design/projects/42", "?tab=analytics")?.section).toBe("analytics");
        expect(pageContextOf("/execution/clients/7", "")).toEqual({ area: "execution", page: "clients", entityType: "client", entityId: 7, section: null, part: null, surface: null });
        expect(pageContextOf("/design/people/5", "?tab=requirements")).toEqual({ area: "design", page: "people", entityType: "person", entityId: 5, section: null, part: null, surface: null });
        expect(pageContextOf("/company/overhead", "")).toEqual({ area: "company", page: "company_expenses", entityType: null, entityId: null, section: null, part: null, surface: null });
        expect(pageContextOf("/design/settings", "?section=admins")).toEqual({ area: "design", page: "settings", entityType: null, entityId: null, section: null, part: null, surface: null });
        expect(pageContextOf("/design/projects/new-thing", "")).toEqual({ area: "design", page: "projects", entityType: null, entityId: null, section: null, part: null, surface: null });
        expect(pageContextOf("/company", "")).toEqual({ area: "company", page: "launcher", entityType: null, entityId: null, section: null, part: null, surface: null });
        expect(pageContextOf("/no-access", "")).toBeNull();
    });

    it("names a files or portal tab's part, and the Website area's pages and open project", () => {
        expect(pageContextOf("/design/projects/42", "?tab=portal&part=discussion&item=3")).toMatchObject({ section: "portal", part: "discussion" });
        expect(pageContextOf("/design/projects/42", "?tab=files&part=drawing")).toMatchObject({ section: "files", part: "drawing" });
        // a Design client project's client payments and variation orders
        expect(pageContextOf("/design/projects/42", "?tab=vos")).toMatchObject({ entityType: "project", section: "vos", part: null });
        expect(pageContextOf("/design/projects/42", "?tab=payments")).toMatchObject({ section: "payments" });
        // a Design client project's or a site's insights
        expect(pageContextOf("/execution/projects/7", "?tab=insights")).toMatchObject({ entityType: "project", section: "insights", part: null });
        // a part another tab doesn't have, or no tab at all, names none
        expect(pageContextOf("/design/projects/42", "?tab=files&part=discussion")?.part).toBeNull();
        expect(pageContextOf("/design/projects/42", "?part=access")?.part).toBeNull();
        expect(pageContextOf("/website/projects", "?project=8")).toEqual({
            area: "website", page: "website_projects", entityType: "website_project", entityId: 8, section: null, part: null, surface: null,
        });
        expect(pageContextOf("/website/analytics", "?project=8")).toMatchObject({ page: "website_analytics", entityType: null, entityId: null });
        expect(pageContextOf("/website/projects/8", "")).toMatchObject({ entityType: null, entityId: null });
    });

    it("names an Execution site's part, ground labour included, and Execution's own pages", () => {
        // a site's page is its Financials tab unless another tab is open
        expect(pageContextOf("/execution/projects/7", "?part=boqs")).toMatchObject({ entityType: "project", entityId: 7, section: "financials", part: "boqs" });
        expect(pageContextOf("/execution/projects/7", "?part=expenses&view=labour")?.part).toBe("labour");
        expect(pageContextOf("/execution/projects/7", "?tab=meetings&part=boqs")).toMatchObject({ section: "meetings", part: null });
        expect(pageContextOf("/execution/daily-log", "")?.page).toBe("daily_log");
        expect(pageContextOf("/execution/sites", "")?.page).toBe("my_sites");
        expect(pageContextOf("/execution/site-logs", "")?.page).toBe("site_logs");
        expect(pageContextOf("/execution/pocket", "")?.page).toBe("pocket");
    });
});

describe("Proton opening forms and windows", () => {
    const surface = (name: string, fields: Record<string, unknown> = {}) => command({ type: "open_surface", surface: name, ...fields });

    it("opens each through its own link, on the page it belongs to", () => {
        expect(stepOf(surface("edit_project", { id: 42, domain: "design" }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/projects/42?details=1", label: "It" });
        expect(stepOf(surface("new_project", { domain: "design" }), designAdmin, "design")).toMatchObject({ path: "/design/projects?new=1" });
        expect(stepOf(surface("message_person", { id: 9, domain: "design" }), designAdmin, "design")).toMatchObject({ path: "/design/messages?with=9" });
        expect(stepOf(surface("settings_section", { domain: "design", settingsSection: "finance" }), superAdmin, "design"))
            .toMatchObject({ path: "/design/settings?section=finance" });
        expect(stepOf(surface("company_overview_tab", { companyTab: "teams" }), superAdmin, null)).toMatchObject({ path: "/company/overview?tab=teams" });
        expect(stepOf(surface("report_bug"), designAdmin, "design")).toEqual({ kind: "opener", id: "report_bug", label: "It" });
        expect(stepOf(surface("log_work", { domain: "design" }), permissionsOf(personas.designEmployee), "design")).toEqual({ kind: "log_work", label: "It" });
    });

    it("opens nothing the person couldn't open themselves", () => {
        // the Design admin sees no money and no Execution
        expect(stepOf(surface("new_invoice", { id: 42, domain: "design" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("project_report", { id: 42, domain: "design" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("site_pricing", { id: 7, domain: "execution" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("add_company_expense"), designAdmin, "design")).toBeNull();
        // a made-up section, a missing id, an unknown surface
        expect(stepOf(surface("settings_section", { domain: "design", settingsSection: "x\"><script>" }), superAdmin, "design")).toBeNull();
        expect(stepOf(surface("edit_project", { domain: "design" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("complete_project", { id: 42, domain: "design" }), superAdmin, "design")).toBeNull();
    });

    it("can't reach a one-click confirm, whoever asks", () => {
        for (const name of Object.keys(SURFACES) as ProtonSurface[]) {
            for (const domain of ["design", "execution"] as const) {
                const target = SURFACES[name]({ p: superAdmin, domain, id: 1, section: "general", tab: "overview" });
                if (target?.kind === "go") expect(target.path).not.toMatch(/complete=|void|delete|discard|deactivate|top-?up/i);
            }
        }
    });

    it("changes the theme or the sounds, and nothing else", () => {
        expect(stepOf(command({ type: "set_preference", theme: "dark" }), designAdmin, "design")).toEqual({ kind: "theme", theme: "dark" });
        expect(stepOf(command({ type: "set_preference", sounds: false }), designAdmin, "design")).toEqual({ kind: "sounds", on: false });
        expect(stepOf(command({ type: "set_preference", theme: "javascript:" }), designAdmin, "design")).toBeNull();
    });

    it("opens an employee's own pages for them, and not for an admin, who has none", () => {
        const designer = permissionsOf(personas.designEmployee);
        expect(stepOf(command({ type: "open_page", page: "my_work", domain: "design" }), designer, "design")).toMatchObject({ path: "/design/my-work" });
        expect(stepOf(command({ type: "open_page", page: "my_profile", domain: "design" }), designer, "design")).toMatchObject({ path: "/design/profile" });
        // there is no pay page: employees don't see their pay
        expect(stepOf(command({ type: "open_page", page: "my_pay", domain: "design" }), designer, "design")).toBeNull();
    });

    it("opens the Website area for those who may enter it", () => {
        const webEditor = permissionsOf(personas.websiteAdmin);
        expect(stepOf(command({ type: "open_page", page: "website_projects" }), superAdmin, "design")).toMatchObject({ path: "/website/projects" });
        expect(stepOf(command({ type: "open_page", page: "website_analytics" }), webEditor, null)).toMatchObject({ path: "/website/analytics" });
        expect(stepOf(surface("new_website_project", { domain: "website" }), webEditor, null)).toMatchObject({ path: "/website/projects?new=1" });
        // a website project opens in its form
        expect(stepOf(surface("edit_website_project", { id: 8, domain: "website" }), superAdmin, "design")).toMatchObject({ path: "/website/projects?project=8" });
        expect(stepOf(surface("invite_website_staff", { domain: "website" }), superAdmin, "design")).toMatchObject({ path: "/website/staff?invite=1" });

        // a Design admin has no Website area; website staff see no people, so no staff page
        expect(stepOf(command({ type: "open_page", page: "website_projects" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("edit_website_project", { id: 8, domain: "website" }), designAdmin, "design")).toBeNull();
        expect(stepOf(command({ type: "open_page", page: "website_staff" }), webEditor, null)).toBeNull();
        expect(stepOf(surface("invite_website_staff", { domain: "website" }), webEditor, null)).toBeNull();
        // a business's form never opens in the Website area
        expect(stepOf(surface("new_project", { domain: "website" }), superAdmin, "design")).toBeNull();
    });

    it("opens a Design project's files and client portal on their parts", () => {
        expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section: "files", part: "drawing" }), designAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=files&part=drawing" });
        expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section: "portal", part: "discussion" }), designAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=portal&part=discussion" });
        // a part the tab doesn't have is dropped
        expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section: "files", part: "access" }), designAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=files" });

        expect(stepOf(surface("file_comments", { id: 42, domain: "design", itemId: 5 }), designAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=files&comments=5" });
        expect(stepOf(surface("view_project_file", { id: 42, domain: "design", itemId: 5 }), designAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=files&view=5" });
        expect(stepOf(surface("view_project_file", { id: 42, domain: "design" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("portal_discussion", { id: 42, domain: "design", itemId: 5 }), designAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=portal&part=discussion&item=5" });
        expect(stepOf(surface("portal_preview", { id: 42, domain: "design" }), superAdmin, "design")).toMatchObject({ path: "/design/projects/42/portal-preview" });

        // a file's comments need the file; the preview, the portal's files; neither is on a site
        expect(stepOf(surface("file_comments", { id: 42, domain: "design" }), designAdmin, "design")).toBeNull();
        expect(stepOf(surface("portal_preview", { id: 42, domain: "design" }), permissionsOf(personas.designEmployee), "design")).toBeNull();
        expect(stepOf(surface("portal_discussion", { id: 7, domain: "execution" }), superAdmin, "execution")).toBeNull();
    });

    it("opens an Execution site's parts, a BOQ, the pocket money windows and Execution's own pages, for those who may", () => {
        const siteStaff = permissionsOf(personas.executionEmployee);
        const site = (part: string) => command({ type: "open_project", id: 7, domain: "execution", section: "financials", part });
        expect(stepOf(site("boqs"), superAdmin, "execution")).toMatchObject({ path: "/execution/projects/7?tab=financials&part=boqs" });
        // ground labour is a view of the expenses part
        expect(stepOf(site("labour"), siteStaff, "execution")).toMatchObject({ path: "/execution/projects/7?tab=financials&part=expenses&view=labour" });
        // a site's part isn't a Design project's
        expect(stepOf(command({ type: "open_project", id: 42, domain: "design", section: "financials", part: "boqs" }), superAdmin, "design"))
            .toMatchObject({ path: "/design/projects/42?tab=financials" });

        expect(stepOf(surface("view_boq", { id: 7, domain: "execution", itemId: 3 }), superAdmin, "execution"))
            .toMatchObject({ path: "/execution/projects/7?tab=financials&part=boqs&boq=3" });
        expect(stepOf(surface("view_boq", { id: 7, domain: "execution" }), superAdmin, "execution")).toBeNull();
        expect(stepOf(surface("to_pocket", { id: 7, domain: "execution" }), superAdmin, "execution")).toMatchObject({ path: "/execution/projects/7?money=to-pocket" });
        // a Design project's departments window, for whoever may edit the project; a site has none
        expect(stepOf(surface("project_departments", { id: 42, domain: "design" }), superAdmin, "design")).toMatchObject({ path: "/design/projects/42?departments=edit" });
        expect(stepOf(surface("project_departments", { id: 7, domain: "execution" }), superAdmin, "execution")).toBeNull();
        expect(stepOf(surface("ask_pocket", { id: 7, domain: "execution" }), superAdmin, "execution")).toMatchObject({ path: "/execution/projects/7?money=ask-pocket" });
        expect(stepOf(surface("ask_pocket", { id: 7, domain: "execution" }), siteStaff, "execution")).toBeNull();
        expect(stepOf(surface("settings_section", { domain: "execution", settingsSection: "labels" }), superAdmin, "execution"))
            .toMatchObject({ path: "/execution/settings?section=labels" });

        expect(stepOf(command({ type: "open_page", page: "pocket", domain: "execution" }), superAdmin, "execution")).toMatchObject({ path: "/execution/pocket" });
        expect(stepOf(command({ type: "open_page", page: "site_logs", domain: "execution" }), superAdmin, "execution")).toMatchObject({ path: "/execution/site-logs" });
        expect(stepOf(command({ type: "open_page", page: "daily_log", domain: "execution" }), siteStaff, "execution")).toMatchObject({ path: "/execution/daily-log" });
        expect(stepOf(command({ type: "open_page", page: "my_sites", domain: "execution" }), siteStaff, "execution")).toMatchObject({ path: "/execution/sites" });
        // a site staff member's own pages are no admin's
        expect(stepOf(command({ type: "open_page", page: "daily_log", domain: "execution" }), superAdmin, "execution")).toBeNull();
    });

    it("opens the pages Proton couldn't reach before, for those who may", () => {
        expect(stepOf(command({ type: "open_page", page: "notifications", domain: "design" }), designAdmin, "design")).toMatchObject({ path: "/design/notifications" });
        expect(stepOf(command({ type: "open_page", page: "launcher" }), designAdmin, "design")).toMatchObject({ path: "/company" });
        expect(stepOf(command({ type: "open_page", page: "salaries" }), designAdmin, "design")).toBeNull();
        expect(stepOf(command({ type: "open_page", page: "proton_budget" }), superAdmin, "design")).toMatchObject({ path: "/company/proton" });
    });
});

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
        expect(stepOf(command({ type: "open_client", id: 3, domain: "design" }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/clients/3", label: "It" });
        // a company-wide person opens in the area the person is in
        expect(stepOf(command({ type: "open_person", id: 9, domain: null }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/people/9", label: "It" });
        expect(stepOf(command({ type: "open_page", page: "projects", domain: "design", clientId: 3 }), designAdmin, "design"))
            .toEqual({ kind: "go", path: "/design/projects?client=3", label: "It" });
        expect(stepOf(command({ type: "open_page", page: "company_overview" }), superAdmin, null))
            .toEqual({ kind: "go", path: "/company/overview", label: "It" });
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
            .toEqual({ area: "design", page: "projects", entityType: "project", entityId: 42, section: "requirements", surface: null });
        expect(pageContextOf("/execution/clients/7", "")).toEqual({ area: "execution", page: "clients", entityType: "client", entityId: 7, section: null, surface: null });
        expect(pageContextOf("/design/people/5", "?tab=requirements")).toEqual({ area: "design", page: "people", entityType: "person", entityId: 5, section: null, surface: null });
        expect(pageContextOf("/company/overhead", "")).toEqual({ area: "company", page: "company_expenses", entityType: null, entityId: null, section: null, surface: null });
        expect(pageContextOf("/design/settings", "?section=admins")).toEqual({ area: "design", page: "settings", entityType: null, entityId: null, section: null, surface: null });
        expect(pageContextOf("/design/projects/new-thing", "")).toEqual({ area: "design", page: "projects", entityType: null, entityId: null, section: null, surface: null });
        expect(pageContextOf("/company", "")).toEqual({ area: "company", page: "launcher", entityType: null, entityId: null, section: null, surface: null });
        expect(pageContextOf("/no-access", "")).toBeNull();
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

    it("opens the pages Proton couldn't reach before, for those who may", () => {
        expect(stepOf(command({ type: "open_page", page: "notifications", domain: "design" }), designAdmin, "design")).toMatchObject({ path: "/design/notifications" });
        expect(stepOf(command({ type: "open_page", page: "launcher" }), designAdmin, "design")).toMatchObject({ path: "/company" });
        expect(stepOf(command({ type: "open_page", page: "salaries" }), designAdmin, "design")).toBeNull();
        expect(stepOf(command({ type: "open_page", page: "proton_budget" }), superAdmin, "design")).toMatchObject({ path: "/company/proton" });
    });
});

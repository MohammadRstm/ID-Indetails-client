import { describe, expect, it } from "vitest";
import { permissionsOf } from "@/app/permissions/permissions";
import { personas } from "@/test/personas";
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
            command({ type: "open_page", page: "settings", domain: "design" }),
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
            .toEqual({ area: "design", page: "projects", entityType: "project", entityId: 42, section: "requirements" });
        expect(pageContextOf("/execution/clients/7", "")).toEqual({ area: "execution", page: "clients", entityType: "client", entityId: 7, section: null });
        expect(pageContextOf("/design/people/5", "?tab=requirements")).toEqual({ area: "design", page: "people", entityType: "person", entityId: 5, section: null });
        expect(pageContextOf("/company/overhead", "")).toEqual({ area: "company", page: "company_expenses", entityType: null, entityId: null, section: null });
        expect(pageContextOf("/design/settings", "?section=admins")).toEqual({ area: "design", page: null, entityType: null, entityId: null, section: null });
        expect(pageContextOf("/design/projects/new-thing", "")).toEqual({ area: "design", page: "projects", entityType: null, entityId: null, section: null });
        expect(pageContextOf("/company", "")).toEqual({ area: "company", page: null, entityType: null, entityId: null, section: null });
        expect(pageContextOf("/no-access", "")).toBeNull();
    });
});

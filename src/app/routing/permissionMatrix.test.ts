import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/api/types";
import type { Domain } from "@/app/permissions/permissions";
import { permissionsOf } from "@/app/permissions/permissions";
import { personas, type PersonaName } from "@/test/personas";
import { companyRoutes, domainRoutes, pageFor } from "./routeTable";

/*
 * The whole matrix: what each kind of person gets on every route of both businesses and of the company
 * area, with the permissions the API gives their role. "open" shows the page, "home" sends them home (the
 * business isn't theirs, or no page fits them), "denied" says they lack the permission. An employee gets an
 * admin page when it has no employee version, so without its permission they are denied, not sent home.
 * A change to any route's rule shows up here, to be looked at on purpose.
 */

type Outcome = "open" | "home" | "denied";

function outcome(user: CurrentUser, domain: Domain, path: string): Outcome {
    const p = permissionsOf(user);
    if (!p.canSeeDomain(domain)) return "home";
    const route = domainRoutes.find((r) => r.path === path)!;
    const page = pageFor(route, p);
    if (!page) return "home";
    return page.access({ p, domain }) ? "open" : "denied";
}

const PATHS = [
    "overview", "projects", "projects/:id", "clients", "clients/:id", "people", "people/:id", "financials",
    "my-work", "pay", "meetings", "activity", "reports", "profile", "settings", "notifications", "messages", "assistant/:chatId?", "help",
] as const;

// one letter per path, in PATHS order: o open, h home, d denied (everyone here has Proton, so its page opens in their business)
const MATRIX: Record<PersonaName, Record<Domain, string>> = {
    superAdmin:        { design: "oooooooohhooohooooo", execution: "ooooodoohhoddhooooo" },
    // admins: no Financials until a super admin hands them the money
    designAdmin:       { design: "ooooooodhhooohooooo", execution: "hhhhhhhhhhhhhhhhhhh" },
    executionAdmin:    { design: "hhhhhhhhhhhhhhhhhhh", execution: "ooooododhhoddhooooo" },
    designEmployee:    { design: "doodddddoooddodoooo", execution: "hhhhhhhhhhhhhhhhhhh" },
    executionEmployee: { design: "hhhhhhhhhhhhhhhhhhh", execution: "doodddddododdodoooo" },
};

const LETTER: Record<string, Outcome> = { o: "open", h: "home", d: "denied" };

describe("the permission matrix", () => {
    for (const name of Object.keys(MATRIX) as PersonaName[]) {
        for (const domain of ["design", "execution"] as Domain[]) {
            it(`${name} in ${domain}`, () => {
                const expected = MATRIX[name][domain].replace(/\s/g, "");
                expect(expected).toHaveLength(PATHS.length);
                const got = PATHS.map((path) => outcome(personas[name], domain, path));
                expect(Object.fromEntries(PATHS.map((path, i) => [path, got[i]])))
                    .toEqual(Object.fromEntries(PATHS.map((path, i) => [path, LETTER[expected[i]]])));
            });
        }
    }

    it("covers every route", () => {
        expect([...PATHS].sort()).toEqual(domainRoutes.map((r) => r.path).sort());
    });

    it("keeps the company area to those whose permissions reach it", () => {
        const company = (name: PersonaName) =>
            Object.fromEntries(companyRoutes.map((r) => [r.path, r.access(permissionsOf(personas[name])) ? "open" : "denied"]));
        // a domain admin manages settings in their business: the company's Settings need the company area too
        const onlyInbox = {
            overview: "denied", overhead: "denied", salaries: "denied", "project-pay": "denied", schedules: "denied", proton: "denied", settings: "denied",
            profile: "open", notifications: "open", messages: "open", "assistant/:chatId?": "open", help: "open",
        };
        expect(company("superAdmin")).toEqual({ ...onlyInbox, overview: "open", overhead: "open", salaries: "open", "project-pay": "open", schedules: "open", proton: "open", settings: "open" });
        for (const name of ["designAdmin", "executionAdmin", "designEmployee", "executionEmployee"] as PersonaName[]) {
            expect(company(name), name).toEqual(onlyInbox);
        }
    });
});

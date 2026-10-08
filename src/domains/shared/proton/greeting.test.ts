import { describe, expect, it } from "vitest";
import { permissionsOf } from "@/app/permissions/permissions";
import { personas } from "@/test/personas";
import { greetingFor, startersFor } from "./greeting";

const at = (hour: number) => new Date(2026, 9, 8, hour, 30);

describe("Proton's greeting", () => {
    it("says hello by first name for the time of day", () => {
        expect(greetingFor("Nadia", at(8))).toBe("Good morning, Nadia.");
        expect(greetingFor("Nadia", at(14))).toBe("Good afternoon, Nadia.");
        expect(greetingFor("Nadia", at(21))).toBe("Good evening, Nadia.");
        expect(greetingFor(" ", at(3))).toBe("Good evening.");
    });

    it("starts with questions for the page, only ones whose answer the person may see", () => {
        const admin = permissionsOf(personas.designAdmin);
        const project = { area: "design", page: "projects", entityType: "project", entityId: 4, section: null } as const;
        expect(startersFor(project, admin)).toEqual(["How is this project doing?", "What's still open on it?", "Who has worked on it this month?"]);

        // money questions only for those who see money
        const financials = { area: "design", page: "financials", entityType: null, entityId: null, section: null } as const;
        expect(startersFor(financials, admin).join(" ")).not.toMatch(/invoice|compare with last month/i);
        expect(startersFor(financials, permissionsOf(personas.superAdmin))).toContain("Which invoices are overdue?");

        // anywhere else, the general ones, three at most
        expect(startersFor(null, admin)).toEqual(["What needs my attention?", "What changed this week?", "How did hours compare with last week?"]);
        expect(startersFor(null, permissionsOf(personas.executionAdmin))).toEqual(["What needs my attention?", "What changed this week?"]);
    });
});

import { describe, expect, it } from "vitest";
import { permissionsOf } from "@/app/permissions/permissions";
import { personas } from "@/test/personas";
import type { FormFill } from "./formFill";
import { placeOf } from "./formPlaces";

const superAdmin = permissionsOf(personas.superAdmin);
const designAdmin = permissionsOf(personas.designAdmin);
const designEmployee = permissionsOf(personas.designEmployee);
const executionAdmin = permissionsOf(personas.executionAdmin);
const fill = (fields: Partial<FormFill>): FormFill => ({ form: "client", id: null, ...fields }) as FormFill;
const go = (path: string) => ({ kind: "go", path });

describe("where a form Proton fills lives", () => {
    it("is the record's own page, with the link that opens the form", () => {
        expect(placeOf(fill({ form: "requirement", id: 7 }), { id: 42, domain: "design" }, designAdmin, "design"))
            .toEqual(go("/design/projects/42?tab=requirements&requirement=7"));
        expect(placeOf(fill({ form: "requirement" }), { id: 42, domain: "design" }, designAdmin, "design"))
            .toEqual(go("/design/projects/42?tab=requirements"));
        expect(placeOf(fill({ form: "file_rename", id: 3 }), { id: 42, domain: "design" }, designAdmin, "design"))
            .toEqual(go("/design/projects/42?tab=files&rename=3"));
        expect(placeOf(fill({ form: "materials" }), { id: 8, domain: "execution" }, executionAdmin, "execution"))
            .toEqual(go("/execution/projects/8?materials=add"));
        expect(placeOf(fill({ form: "company_expense", id: 4 }), { id: null, domain: null }, superAdmin, null))
            .toEqual(go("/company/overhead?edit=4"));
        expect(placeOf(fill({ form: "hour_excuse", id: 9 }), { id: 9, domain: null }, superAdmin, null))
            .toEqual(go("/company/salaries?person=9"));
    });

    it("opens a money form only for someone who sees money and may record it", () => {
        const payment = fill({ form: "payment", id: 42 });
        expect(placeOf(payment, { id: 42, domain: "design" }, superAdmin, "design")).toEqual(go("/design/projects/42?pay=1"));
        expect(placeOf(payment, { id: 42, domain: "design" }, designEmployee, "design")).toBeNull();
    });

    it("is nowhere for a form the person can't open, or one on the wrong kind of project", () => {
        expect(placeOf(fill({ form: "schedule", id: 9 }), { id: 9, domain: null }, designEmployee, "design")).toBeNull();
        // materials and labour are on Execution sites only
        expect(placeOf(fill({ form: "materials" }), { id: 42, domain: "design" }, superAdmin, "design")).toBeNull();
        expect(placeOf(fill({ form: "portal_intro" }), { id: 8, domain: "execution" }, superAdmin, "execution")).toBeNull();
    });
});

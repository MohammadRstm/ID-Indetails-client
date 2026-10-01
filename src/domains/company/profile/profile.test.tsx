import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { permissionsOf } from "@/app/permissions/permissions";
import { myProfilePath } from "@/app/shell/profilePath";
import { companyHandlers } from "@/test/fixtures/company";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

describe("my profile", () => {
    it("is in the company area for a super admin, with their details and password", async () => {
        renderApp("/company/overview", personas.superAdmin, ...companyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Account" }));
        await userEvent.click(screen.getByRole("button", { name: "My profile" }));
        expect(await screen.findByRole("heading", { name: "Rana Test" })).toBeInTheDocument();
        expect(screen.getByText("rana@hourline.test")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit your profile" });
        expect(within(dialog).getByDisplayValue("Rana Test")).toBeInTheDocument();
    });

    it("is wherever each person's own page is", () => {
        const path = (name: keyof typeof personas, area: "design" | "execution" | "company") =>
            myProfilePath(permissionsOf(personas[name]), area === "company" ? { kind: "company", section: null } : { kind: "domain", domain: area, section: null }, personas[name].id);
        expect(path("superAdmin", "design")).toBe("/company/profile");
        expect(path("superAdmin", "company")).toBe("/company/profile");
        expect(path("designAdmin", "design")).toBe(`/design/people/${personas.designAdmin.id}`);
        expect(path("executionAdmin", "execution")).toBe(`/execution/people/${personas.executionAdmin.id}`);
        expect(path("designEmployee", "design")).toBe("/design/profile");
        expect(path("executionEmployee", "execution")).toBe("/execution/profile");
        // an admin who can't see profiles has no page to go to
        const blind = withPermissions(personas.designAdmin, { revoke: [P.EMPLOYEE_VIEW] });
        expect(myProfilePath(permissionsOf(blind), { kind: "domain", domain: "design", section: null }, blind.id)).toBeNull();
    });
});

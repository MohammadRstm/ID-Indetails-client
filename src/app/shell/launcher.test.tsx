import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { companyHandlers } from "@/test/fixtures/company";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

describe("The launcher", () => {
    it("shows the person's picture, name and email, with Messages, the bell and Settings beside the logo", async () => {
        renderApp("/company", personas.superAdmin);
        expect(await screen.findByRole("heading", { name: "What would you like to manage?" })).toBeInTheDocument();
        expect(screen.getByText("Rana Test")).toBeInTheDocument();
        expect(screen.getByText("rana@hourline.test")).toBeInTheDocument();
        for (const name of ["Messages", "Notifications", "Settings"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
        // the theme is in Settings now, not here
        expect(screen.queryByRole("button", { name: /^Switch to (dark|light) mode$/ })).not.toBeInTheDocument();
    });

    it("opens the person's own profile from their picture", async () => {
        renderApp("/company", personas.superAdmin, ...companyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Open your profile" }));
        expect(await screen.findByRole("heading", { name: "Rana Test" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/company/profile");
    });

    it("opens the company's Settings, or a business's for someone who doesn't see the company", async () => {
        renderApp("/company", personas.superAdmin, ...companyHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
        expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/company/settings");
    });

    it("sends an admin of both businesses without the company overview to their first business's Settings", async () => {
        const both = withPermissions(personas.designAdmin, { grant: [P.PROJECT_PRICING_MANAGE], visibleDomains: ["design", "execution"] });
        renderApp("/company", both);
        await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
        expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/design/settings");
    });
});

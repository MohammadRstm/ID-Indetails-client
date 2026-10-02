import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { tokenStore } from "@/api/tokenStore";
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

    it("lists a super admin's permissions, described", async () => {
        renderApp("/company/profile", personas.superAdmin, ...companyHandlers,
            http.get("/api/me/permissions", () => HttpResponse.json([{ code: "salary:view", description: "See everyone's salaries", explanation: "See what each person is owed each month.", source: "role" }])));
        await userEvent.click(await screen.findByRole("button", { name: /^View \d+ permissions?$/ }));
        const dialog = await screen.findByRole("dialog", { name: "Your permissions" });
        expect(await within(dialog).findByText("See everyone's salaries")).toBeInTheDocument();
        expect(within(dialog).getByText("A super admin holds every permission.")).toBeInTheDocument();
    });

    it("changes a super admin's own sign-in address only with their password", async () => {
        const sent: unknown[] = [];
        const rana = personas.superAdmin;
        renderApp("/company/profile", rana, ...companyHandlers,
            http.put("/api/me/profile", () => HttpResponse.json(rana)),
            http.post("/api/auth/change-email", async ({ request }) => {
                sent.push(await request.json());
                return sent.length === 1
                    ? HttpResponse.json({ type: "validation", code: "current_password_incorrect", message: "The current password is incorrect.", errors: { currentPassword: ["The current password is incorrect."] } }, { status: 400 })
                    : HttpResponse.json({ accessToken: "a-new-session", accessTokenExpiresAt: "2026-10-02T12:00:00Z", user: { ...rana, email: "rana.k@hourline.test" } });
            }));
        await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
        const dialog = await screen.findByRole("dialog", { name: "Edit your profile" });
        expect(within(dialog).queryByLabelText("Your password")).not.toBeInTheDocument();
        const email = within(dialog).getByLabelText("Work email");
        await userEvent.clear(email);
        await userEvent.type(email, "rana.k@hourline.test");

        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(within(dialog).getByText("Enter your password to change your sign-in address.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.type(within(dialog).getByLabelText("Your password"), "not-it");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("The current password is incorrect.")).toBeInTheDocument();

        await userEvent.clear(within(dialog).getByLabelText("Your password"));
        await userEvent.type(within(dialog).getByLabelText("Your password"), "the-right-one");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(sent).toEqual([{ email: "rana.k@hourline.test", currentPassword: "not-it" }, { email: "rana.k@hourline.test", currentPassword: "the-right-one" }]);
        expect(await screen.findByText(/You now sign in with rana.k@hourline.test/)).toBeInTheDocument();
        // the answer is a new session, used from now on
        expect(tokenStore.get()).toBe("a-new-session");
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

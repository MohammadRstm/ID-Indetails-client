import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { PortalAuthResponse } from "./portalApi";

/*
 * The client portal: a client opens their invitation, chooses their own password and lands on their projects, apart
 * from the staff session.
 */

const auth: PortalAuthResponse = {
    accessToken: "portal-token",
    accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    account: { id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun", projects: [{ id: 2, title: "Villa Mounir interiors", status: "active" }] },
};
const preview = { email: "rania@client.test", projectTitle: "Villa Mounir interiors", expiresAt: "2026-10-14T09:00:00Z" };
const noPortalSession = http.post("/api/portal/auth/refresh", () =>
    HttpResponse.json({ type: "authentication", code: "refresh_token_invalid", message: "No session." }, { status: 401 }));
const refused = (code: string) => http.post("/api/portal/invitations/validate", () =>
    HttpResponse.json({ type: "validation", code, message: code }, { status: 400 }));

describe("a client's invitation", () => {
    it("lets the client choose their own password, takes the token out of the address bar and signs them in", async () => {
        const sent: unknown[] = [];
        renderApp("/portal/invite?token=abc123", null, noPortalSession,
            http.post("/api/portal/invitations/validate", () => HttpResponse.json(preview)),
            http.post("/api/portal/invitations/accept", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(auth); }));

        expect(await screen.findByRole("heading", { name: "Set up your account" })).toBeInTheDocument();
        expect(screen.getByText("Villa Mounir interiors")).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toHaveValue("rania@client.test");
        expect(window.location.search).toBe("");

        await userEvent.type(screen.getByLabelText(/First name/), "Rania");
        await userEvent.type(screen.getByLabelText(/Last name/), "Aoun");
        await userEvent.type(screen.getByLabelText(/Choose a password/), "olive tree garden");
        await userEvent.type(screen.getByLabelText(/Repeat the password/), "olive tree garden");
        await userEvent.click(screen.getByRole("button", { name: "Set up my account" }));

        expect(await screen.findByRole("heading", { name: "Welcome, Rania" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Villa Mounir interiors" })).toBeInTheDocument();
        expect(sent).toEqual([{ token: "abc123", firstName: "Rania", lastName: "Aoun", password: "olive tree garden" }]);
        expect(window.location.pathname).toBe("/portal");
    });

    it("shows the password mistakes before anything is sent", async () => {
        let accepted = false;
        renderApp("/portal/invite?token=abc123", null, noPortalSession,
            http.post("/api/portal/invitations/validate", () => HttpResponse.json(preview)),
            http.post("/api/portal/invitations/accept", () => { accepted = true; return HttpResponse.json(auth); }));

        await userEvent.type(await screen.findByLabelText(/First name/), "Rania");
        await userEvent.type(screen.getByLabelText(/Last name/), "Aoun");
        await userEvent.type(screen.getByLabelText(/Choose a password/), "short");
        await userEvent.type(screen.getByLabelText(/Repeat the password/), "other");
        await userEvent.click(screen.getByRole("button", { name: "Set up my account" }));

        expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
        expect(screen.getByText("The two passwords don't match.")).toBeInTheDocument();
        expect(accepted).toBe(false);
    });

    it.each([
        ["portal_invitation_invalid", "This link isn't valid"],
        ["portal_invitation_expired", "This invitation has expired"],
        ["portal_invitation_revoked", "This invitation was cancelled"],
        ["portal_invitation_used", "You've already set up your account"],
    ])("explains a link it can't use (%s)", async (code, title) => {
        renderApp("/portal/invite?token=abc123", null, noPortalSession, refused(code));
        expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/portal/login");
        expect(screen.queryByLabelText(/Choose a password/)).toBeNull();
    });

    it("calls a link without a token not valid, without asking the server", async () => {
        let asked = false;
        renderApp("/portal/invite", null, noPortalSession,
            http.post("/api/portal/invitations/validate", () => { asked = true; return HttpResponse.json(preview); }));
        expect(await screen.findByRole("heading", { name: "This link isn't valid" })).toBeInTheDocument();
        expect(asked).toBe(false);
    });

    it("says when the invitation was used up between opening it and setting the password", async () => {
        renderApp("/portal/invite?token=abc123", null, noPortalSession,
            http.post("/api/portal/invitations/validate", () => HttpResponse.json(preview)),
            http.post("/api/portal/invitations/accept", () =>
                HttpResponse.json({ type: "validation", code: "portal_invitation_used", message: "Used." }, { status: 400 })));

        await userEvent.type(await screen.findByLabelText(/First name/), "Rania");
        await userEvent.type(screen.getByLabelText(/Last name/), "Aoun");
        await userEvent.type(screen.getByLabelText(/Choose a password/), "olive tree garden");
        await userEvent.type(screen.getByLabelText(/Repeat the password/), "olive tree garden");
        await userEvent.click(screen.getByRole("button", { name: "Set up my account" }));

        expect(await screen.findByRole("heading", { name: "You've already set up your account" })).toBeInTheDocument();
    });
});

describe("the client portal's session", () => {
    it("sends a signed-out client to its sign-in page, and signs them in to their projects", async () => {
        const sent: unknown[] = [];
        renderApp("/portal", null, noPortalSession,
            http.post("/api/portal/auth/login", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(auth); }));

        expect(await screen.findByRole("heading", { name: "Client portal" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/portal/login");
        await userEvent.type(screen.getByLabelText(/Email/), "rania@client.test");
        await userEvent.type(screen.getByLabelText(/Password/), "olive tree garden");
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("heading", { name: "Welcome, Rania" })).toBeInTheDocument();
        expect(sent).toEqual([{ email: "rania@client.test", password: "olive tree garden" }]);
    });

    it("keeps a client signed in from the portal's own cookie, and signs them out", async () => {
        let signedOut = false;
        renderApp("/portal", null,
            http.post("/api/portal/auth/refresh", () => HttpResponse.json(auth)),
            http.post("/api/portal/auth/logout", () => { signedOut = true; return new HttpResponse(null, { status: 204 }); }));

        expect(await screen.findByRole("heading", { name: "Welcome, Rania" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(await screen.findByRole("heading", { name: "Client portal" })).toBeInTheDocument();
        expect(signedOut).toBe(true);
    });

    it("never treats a signed-in staff member as a portal client", async () => {
        renderApp("/portal", personas.designAdmin, noPortalSession);
        expect(await screen.findByRole("heading", { name: "Client portal" })).toBeInTheDocument();
        expect(screen.queryByText(/Welcome/)).toBeNull();
    });

    it("tells a client with no shared project so", async () => {
        renderApp("/portal", null, http.post("/api/portal/auth/refresh", () => HttpResponse.json({ ...auth, account: { ...auth.account, projects: [] } })));
        expect(await screen.findByText("No project is shared with you right now")).toBeInTheDocument();
    });
});

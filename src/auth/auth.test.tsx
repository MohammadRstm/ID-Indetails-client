import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { server } from "@/test/server";

describe("signing in", () => {
    it("says so next to the form when the email and password don't match", async () => {
        server.use(http.post("/api/auth/login", () =>
            HttpResponse.json({ type: "authentication", code: "invalid_credentials", message: "Invalid email or password." }, { status: 401 })));
        renderApp("/login", null);

        await userEvent.type(await screen.findByLabelText("Work email"), "nadia@hourline.test");
        await userEvent.type(screen.getByLabelText("Password"), "wrong password");
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByText("That email and password don't match an account.")).toBeInTheDocument();
    });

    it("says why when a super admin has suspended the sign-in", async () => {
        server.use(http.post("/api/auth/login", () => HttpResponse.json({
            type: "authorization", code: "sign_in_suspended",
            message: "A super admin has ended your sessions. You can sign in again once they restore your access.",
        }, { status: 403 })));
        renderApp("/login", null);
        await userEvent.type(await screen.findByLabelText("Work email"), "nadia@hourline.test");
        await userEvent.type(screen.getByLabelText("Password"), "the right password");
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByText("A super admin has ended your sessions. You can sign in again once they restore your access.")).toBeInTheDocument();
    });

    it("checks the fields before asking the API", async () => {
        renderApp("/login", null);
        await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
        expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
        expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    });

    it("goes home once signed in", async () => {
        server.use(http.post("/api/auth/login", () =>
            HttpResponse.json({ accessToken: "t", accessTokenExpiresAt: "2030-01-01T00:00:00Z", user: personas.designEmployee })));
        renderApp("/login", null);

        await userEvent.type(await screen.findByLabelText("Work email"), "sarah@hourline.test");
        await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(window.location.pathname).toBe("/design/projects"));
    });
});

describe("coming back", () => {
    it("restores the session after a moment when the server was briefly unavailable", async () => {
        renderApp("/design/projects", personas.designEmployee,
            http.post("/api/auth/refresh", () => HttpResponse.json({ code: "rate_limited", message: "Too many requests." }, { status: 429 }), { once: true }));
        // the first try is refused; the next one, two seconds on, finds the session still good
        expect(await screen.findByRole("heading", { name: /Sarah/ }, { timeout: 6000 })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/design/projects");
    });
});

describe("resetting a password", () => {
    it("tells the person when the link has expired", async () => {
        server.use(http.post("/api/auth/reset-password", () =>
            HttpResponse.json({ type: "not_found", code: "password_reset_invalid", message: "Invalid link." }, { status: 404 })));
        renderApp("/reset-password?token=abc", null);

        await userEvent.type(await screen.findByLabelText("New password"), "correct horse battery");
        await userEvent.type(screen.getByLabelText("Repeat it"), "correct horse battery");
        await userEvent.click(screen.getByRole("button", { name: "Save the new password" }));

        expect(await screen.findByRole("heading", { name: "This link doesn't work any more" })).toBeInTheDocument();
    });

    it("takes the link's token out of the address bar, and still uses it", async () => {
        const sent: unknown[] = [];
        server.use(http.post("/api/auth/reset-password", async ({ request }) => { sent.push(await request.json()); return new HttpResponse(null, { status: 204 }); }));
        renderApp("/reset-password?token=abc", null);

        await userEvent.type(await screen.findByLabelText("New password"), "correct horse battery");
        await waitFor(() => expect(window.location.search).toBe(""));
        await userEvent.type(screen.getByLabelText("Repeat it"), "correct horse battery");
        await userEvent.click(screen.getByRole("button", { name: "Save the new password" }));
        await waitFor(() => expect(sent).toEqual([{ token: "abc", password: "correct horse battery" }]));
    });

    it("insists on the API's minimum length", async () => {
        renderApp("/reset-password?token=abc", null);
        await userEvent.type(await screen.findByLabelText("New password"), "short");
        await userEvent.click(screen.getByRole("button", { name: "Save the new password" }));
        expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
    });
});

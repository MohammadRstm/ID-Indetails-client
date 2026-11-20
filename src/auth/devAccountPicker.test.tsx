import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { tokenStore } from "@/api/tokenStore";
import { SessionProvider } from "@/app/session/SessionProvider";
import { personas } from "@/test/personas";
import { server } from "@/test/server";
import DevAccountPicker from "./DevAccountPicker";

// The sign-in page shows the picker only in the Vite dev server, never in the tests or a production build, so it is
// rendered here on its own.

const accounts = {
    groups: [
        { label: "Super admins", accounts: [{ kind: "staff", id: 1, name: "Rana Haddad", email: "rana@hourline.test", detail: "Managing director" }] },
        { label: "Design employees", accounts: [{ kind: "staff", id: 4, name: "Sarah Khoury", email: "sarah@hourline.test", detail: null }] },
        { label: "Clients (portal)", accounts: [{ kind: "client", id: 3, name: "Rita Frem", email: "rita@client.test", detail: null }] },
    ],
};

function renderPicker() {
    return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={["/login"]}>
                <SessionProvider>
                    <Routes>
                        <Route path="/login" element={<DevAccountPicker />} />
                        <Route path="/" element={<p>Home</p>} />
                    </Routes>
                </SessionProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe("the development account picker", () => {
    beforeEach(() => {
        tokenStore.set(null);
        localStorage.clear();
        // nobody is signed in
        server.use(http.post("/api/auth/refresh", () =>
            HttpResponse.json({ type: "authentication", code: "refresh_token_invalid", message: "No session." }, { status: 401 })));
    });

    it("lists every kind of account and signs in as the one picked, without a password", async () => {
        const sent: unknown[] = [];
        server.use(
            http.get("/api/dev/accounts", () => HttpResponse.json(accounts)),
            http.post("/api/dev/sign-in", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json({ accessToken: "dev-token", accessTokenExpiresAt: "2030-01-01T00:00:00Z", user: personas.designEmployee });
            }),
        );
        renderPicker();

        expect(await screen.findByRole("option", { name: "Rana Haddad · Managing director" })).toBeInTheDocument();
        // without a position, the email says who it is
        expect(screen.getByRole("option", { name: "Sarah Khoury · sarah@hourline.test" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Rita Frem · rita@client.test" })).toBeInTheDocument();

        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Account to sign in as" }), "staff:4");
        await userEvent.click(screen.getByRole("button", { name: "Sign in as" }));

        expect(await screen.findByText("Home")).toBeInTheDocument();
        expect(sent).toEqual([{ userId: 4 }]);
        expect(tokenStore.get()).toBe("dev-token");
        // picked first next time
        expect(localStorage.getItem("hourline-dev-sign-in")).toBe("staff:4");
    });

    it("says what's needed when the API has no development sign-in", async () => {
        server.use(http.get("/api/dev/accounts", () =>
            HttpResponse.json({ type: "not_found", code: "not_found", message: "Not found." }, { status: 404 })));
        renderPicker();

        expect(await screen.findByText("The accounts didn't load. The API has to run in its Development environment.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Sign in as" })).toBeNull();
    });
});

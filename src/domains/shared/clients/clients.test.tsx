import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { activity } from "@/test/fixtures/activity";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = personas.designAdmin;
const noMoney = withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] });
const client = fixtures.client;
/** What the API sends someone without financial:view. */
const clientWithoutMoney = { ...client, money: null, projectMoney: null };

describe("the clients list", () => {
    it("shows revenue and profit to people with financial:view", async () => {
        renderApp("/design/clients", admin, ...projectHandlers);
        expect(await screen.findByRole("columnheader", { name: /revenue/i })).toBeInTheDocument();
        expect(screen.getByText("Revenue by client")).toBeInTheDocument();
    });

    it("keeps to clients and hours without it, and never asks for the money", async () => {
        let askedForMoney = false;
        const spy = () => { askedForMoney = true; return HttpResponse.json(null); };
        renderApp("/design/clients", noMoney,
            http.get("/api/finance/:domain/summary", spy), http.get("/api/finance/:domain/clients", spy),
            ...projectHandlers);
        expect(await screen.findByText(client.displayName)).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: /revenue/i })).toBeNull();
        expect(screen.queryByText("Revenue by client")).toBeNull();
        expect(screen.queryByRole("button", { name: "Owing us" })).toBeNull();
        expect(askedForMoney).toBe(false);
    });

    it("says so when the figures don't load, instead of loading forever", async () => {
        renderApp("/design/clients", admin,
            http.get("/api/finance/:domain/summary", () => HttpResponse.json({ type: "forbidden", code: "forbidden", message: "Not allowed." }, { status: 403 })),
            ...projectHandlers);
        expect(await screen.findByText(/Couldn't load the client figures\./)).toBeInTheDocument();
        // the list still loads
        expect((await screen.findAllByText(client.displayName)).length).toBeGreaterThan(0);
    });

    it("leaves hours and last activity out for people who don't see everyone's work", async () => {
        renderApp("/design/clients", withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...projectHandlers);
        expect(await screen.findByRole("columnheader", { name: /revenue/i })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: /hours/i })).toBeNull();
        expect(screen.queryByRole("columnheader", { name: /last activity/i })).toBeNull();
    });

    it("asks the server for the other way round when a header is clicked again", async () => {
        const asked: string[] = [];
        renderApp("/design/clients", admin,
            http.get("/api/clients", ({ request }) => {
                const q = new URL(request.url).searchParams;
                asked.push(`${q.get("sort")}:${q.get("reverse") ?? "false"}`);
                return HttpResponse.json(fixtures.clients);
            }),
            ...projectHandlers);
        const header = await screen.findByRole("columnheader", { name: /^Client/ });
        await userEvent.click(header);
        await userEvent.click(header);
        // money first, highest first; then the name Z to A, then A to Z
        await waitFor(() => expect(asked.slice(-3)).toEqual(["revenue:false", "name:true", "name:false"]));
    });

    it("offers Add client only with client:create", async () => {
        renderApp("/design/clients", withPermissions(admin, { revoke: [P.CLIENT_CREATE] }), ...projectHandlers);
        await screen.findAllByText(client.displayName);
        expect(screen.queryByRole("button", { name: /add client/i })).toBeNull();
    });
});

describe("a client", () => {
    it("shows the money and billing to people with financial:view", async () => {
        renderApp(`/design/clients/${client.id}`, admin, ...projectHandlers);
        expect(await screen.findByText("Profit from this client")).toBeInTheDocument();
        expect(screen.getByText("Client payments")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    });

    it("keeps to the work and contacts without financial:view", async () => {
        let askedForInvoices = false;
        renderApp(`/design/clients/${client.id}`, noMoney,
            http.get("/api/invoices", () => { askedForInvoices = true; return HttpResponse.json({ items: [], page: 1, pageSize: 50, totalCount: 0 }); }),
            http.get(`/api/clients/${client.id}`, () => HttpResponse.json(clientWithoutMoney)),
            ...projectHandlers);
        await screen.findByRole("heading", { name: client.displayName });
        expect(screen.queryByText("Profit from this client")).toBeNull();
        expect(screen.queryByText("Client payments")).toBeNull();
        expect(screen.queryByText("Revenue")).toBeNull();
        expect(await screen.findByText("Who worked for them")).toBeInTheDocument();
        expect(askedForInvoices).toBe(false);
    });

    it("can't be edited, archived or deleted without client:manage", async () => {
        renderApp(`/design/clients/${client.id}`, withPermissions(admin, { revoke: [P.CLIENT_MANAGE] }), ...projectHandlers);
        await screen.findByRole("heading", { name: client.displayName });
        expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Client actions" })).toBeNull();
    });

    it("offers archiving instead of deleting a client that has projects", async () => {
        renderApp(`/design/clients/${client.id}`, admin, ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Client actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Delete client" }));
        expect(screen.getByText("This client can't be deleted")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Archive instead" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete client" })).toBeNull();
    });

    it("says so when the client isn't there", async () => {
        renderApp("/design/clients/99", admin,
            http.get("/api/clients/99", () => HttpResponse.json({ type: "not_found", code: "client_not_found", message: "Not found." }, { status: 404 })),
            ...projectHandlers);
        expect(await screen.findByText("Client not found")).toBeInTheDocument();
    });

    it("ends with its recent activity, for people with activity:view", async () => {
        const asked: URLSearchParams[] = [];
        renderApp(`/design/clients/${client.id}`, admin,
            http.get("/api/activity", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(activity.feed); }),
            ...projectHandlers);
        expect(await screen.findByText("Recent activity")).toBeInTheDocument();
        expect((await screen.findAllByText(/received from Haddad Holdings/)).length).toBeGreaterThan(0);
        expect(asked[0].get("clientId")).toBe(String(client.id));
        expect(asked[0].get("pageSize")).toBe("10");
    });

    it("leaves the activity out without activity:view", async () => {
        let askedForActivity = false;
        renderApp(`/design/clients/${client.id}`, withPermissions(admin, { revoke: [P.ACTIVITY_VIEW] }),
            http.get("/api/activity", () => { askedForActivity = true; return HttpResponse.json(activity.feed); }),
            ...projectHandlers);
        await screen.findByRole("heading", { name: client.displayName });
        expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
        expect(askedForActivity).toBe(false);
    });
});

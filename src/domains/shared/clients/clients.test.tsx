import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
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
});

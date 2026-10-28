import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const quote = (over: object = {}) => ({
    id: 4, number: "QU-2026-004", domain: "execution", projectId: site.project.id, projectTitle: site.project.title, projectLocation: null,
    client: { id: 1, displayName: "Karam family" }, netUsd: 8000, tvaRate: 0.15, totalUsd: 9200, scope: null,
    createdAt: "2026-09-30T09:00:00Z", createdBy: { id: 1, name: "Rana Haddad" }, deliveries: [], ...over,
});

/** Answers the quote's calls, and keeps each one's path and body. */
const quoteHandlers = (calls: { path: string; body?: unknown }[]) => [
    http.post("/api/projects/:id/quotes", ({ params }) => { calls.push({ path: `projects/${String(params.id)}/quotes` }); return HttpResponse.json(quote(), { status: 201 }); }),
    http.post("/api/quotes/:id/email", async ({ request }) => { calls.push({ path: "email", body: await request.json() }); return HttpResponse.json(quote()); }),
    http.post("/api/quotes/:id/deliveries", async ({ request }) => { calls.push({ path: "deliveries", body: await request.json() }); return HttpResponse.json(quote()); }),
    http.get("/api/quotes/:id/pdf", () => new HttpResponse(new Blob(["%PDF"]), { headers: { "Content-Type": "application/pdf" } })),
];

describe("the quote", () => {
    it("asks first, then makes the quote and records it as downloaded", async () => {
        const calls: { path: string; body?: unknown }[] = [];
        renderApp(`/execution/projects/${site.project.id}?quote=new`, personas.superAdmin, ...quoteHandlers(calls), ...siteHandlers);
        const ask = await screen.findByRole("dialog", { name: "Send the quote?" });
        await userEvent.click(within(ask).getByRole("button", { name: "Send the quote" }));
        const dialog = await screen.findByRole("dialog", { name: "Send the quote" });
        await userEvent.click(within(dialog).getByRole("button", { name: /Download the PDF/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
        await waitFor(() => expect(calls).toEqual([
            { path: `projects/${site.project.id}/quotes` },
            { path: "deliveries", body: { channel: "download", recipient: null } },
        ]));
    });

    it("can be left for later", async () => {
        const calls: { path: string; body?: unknown }[] = [];
        renderApp(`/execution/projects/${site.project.id}?quote=new`, personas.superAdmin, ...quoteHandlers(calls), ...siteHandlers);
        const ask = await screen.findByRole("dialog", { name: "Send the quote?" });
        await userEvent.click(within(ask).getByRole("button", { name: "Not now" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Send the quote?" })).not.toBeInTheDocument());
        expect(calls).toEqual([]);
    });

    it("isn't offered to someone who can't send invoices", async () => {
        renderApp(`/execution/projects/${site.project.id}?quote=new`, personas.executionAdmin, ...siteHandlers);
        expect(await screen.findByRole("heading", { name: site.project.title })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Send the quote?" })).not.toBeInTheDocument();
    });

    it("is offered again after the payment or its TVA changes", async () => {
        const calls: { path: string; body?: unknown }[] = [];
        renderApp(`/execution/projects/${site.project.id}?money=pricing`, personas.superAdmin,
            http.put("/api/projects/:id/pricing", () => HttpResponse.json(site.project)),
            ...quoteHandlers(calls), ...siteHandlers);
        const pricing = await screen.findByRole("dialog", { name: "Payment & material profit" });
        const tva = within(pricing).getByLabelText("TVA");
        await userEvent.clear(tva);
        await userEvent.type(tva, "11");
        await userEvent.type(within(pricing).getByLabelText("Why it changes"), "Lower rate for this client");
        await userEvent.click(within(pricing).getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("dialog", { name: "Send the quote?" })).toBeInTheDocument();
    });
});

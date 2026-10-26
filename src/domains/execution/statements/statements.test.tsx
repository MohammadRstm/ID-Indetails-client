import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
// the lobby has one statement, ST-2026-001, of all four of its materials
const lobby = `/execution/projects/${site.project.id}`;
// the loft's four materials are on no statement yet
const loft = `/execution/projects/${site.losingProject.id}`;
const made = { ...site.preview, id: 2, isPreview: false };
type Choice = Schemas["CreateStatementRequest"];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    URL.createObjectURL = vi.fn(() => "blob:statement");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

/** Every choice the builder asked the API to preview, newest last. */
function previews() {
    const asked: Choice[] = [];
    return { asked, handler: http.post("/api/projects/:id/statements/preview", async ({ request }) => { asked.push(await request.json() as Choice); return HttpResponse.json(site.preview); }) };
}

describe("client statements", () => {
    it("are listed on the site, and open as they were made", async () => {
        renderApp(lobby, karim, ...siteHandlers);
        const list = (await screen.findByText("Client statements")).closest(".panel") as HTMLElement;
        await userEvent.click(within(list).getByText("ST-2026-001"));
        const dialog = await screen.findByRole("dialog", { name: "ST-2026-001" });
        expect(within(dialog).getByText(/Made Sep 30, 2026\. It shows the figures of that day/)).toBeInTheDocument();
        expect(within(dialog).getByText("Rebar 12mm")).toBeInTheDocument();
        expect(within(dialog).getByText("This is a statement of materials for your information. It is not an invoice.")).toBeInTheDocument();
        expect(within(dialog).queryByText("Preview")).not.toBeInTheDocument();
    });

    it("leave the list out while a site has none", async () => {
        renderApp(loft, karim, ...siteHandlers);
        expect(await screen.findByText("Project money")).toBeInTheDocument();
        expect(screen.queryByText("Client statements")).not.toBeInTheDocument();
    });

    it("are built from the new materials, each of which can be left out", async () => {
        const p = previews();
        renderApp(loft, karim, p.handler, ...siteHandlers);
        await userEvent.click(within((await screen.findByText("Project money")).closest(".panel") as HTMLElement).getByRole("button", { name: "Client statement" }));
        const dialog = await screen.findByRole("dialog", { name: "Client statement" });
        expect(await within(dialog).findByText("Preview")).toBeInTheDocument();
        expect(p.asked[0]).toEqual({ mode: "detail", includeEarlier: false, excludedMaterialIds: [], unlistedTypeKeys: [] });
        expect(within(dialog).getByText("New materials · 4 of 4 included")).toBeInTheDocument();

        await userEvent.click(within(dialog).getByLabelText("Include Paint"));
        await waitFor(() => expect(p.asked.at(-1)).toEqual({ mode: "detail", includeEarlier: false, excludedMaterialIds: [7], unlistedTypeKeys: [] }));
        expect(within(dialog).getByText("New materials · 3 of 4 included")).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("tab", { name: "Total only" }));
        await waitFor(() => expect(p.asked.at(-1)).toEqual({ mode: "total", includeEarlier: false, excludedMaterialIds: [], unlistedTypeKeys: [] }));
    });

    it("can list earlier materials again, and leave a type with nothing new off the list", async () => {
        const p = previews();
        renderApp(`${lobby}?statement=new`, karim, p.handler, ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Client statement" });
        expect(await within(dialog).findByText("No materials selected")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Save PDF" })).toBeDisabled();
        expect(p.asked).toEqual([]);

        await userEvent.click(within(dialog).getByRole("checkbox", { name: /Include materials from earlier statements/ }));
        await waitFor(() => expect(p.asked.at(-1)).toMatchObject({ includeEarlier: true, unlistedTypeKeys: [] }));
        await userEvent.click(within(dialog).getByLabelText("List Paint"));
        await waitFor(() => expect(p.asked.at(-1)).toMatchObject({ includeEarlier: true, unlistedTypeKeys: ["paint"] }));
        expect(within(dialog).getByText("From earlier statements · 3 of 4 types listed")).toBeInTheDocument();
    });

    it("re-price a material for good, from its price or a quick markup", async () => {
        const priced: unknown[] = [];
        renderApp(`${loft}?statement=new`, karim,
            http.put("/api/projects/:id/materials/:materialId/client-price", async ({ request }) => { priced.push(await request.json()); return HttpResponse.json(site.openMaterials.items[2]); }),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Client statement" });
        const price = await within(dialog).findByLabelText("Client price for Paint");
        await userEvent.clear(price);
        await userEvent.type(price, "1100");
        // shown with its comma as it is typed, sent as a plain number
        expect(price).toHaveValue("1,100");
        await userEvent.keyboard("{Enter}");
        await waitFor(() => expect(priced).toEqual([{ clientPrice: 1100 }]));
        const row = price.closest(".stmt-row") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "+25%" }));
        await waitFor(() => expect(priced).toEqual([{ clientPrice: 1100 }, { clientPrice: 1050 }]));
        // or charged at what it cost, with no profit
        await userEvent.click(within(row).getByRole("button", { name: "As is" }));
        await waitFor(() => expect(priced).toEqual([{ clientPrice: 1100 }, { clientPrice: 1050 }, { clientPrice: 840 }]));
    });

    it("can't be re-priced without project:pricing_manage", async () => {
        renderApp(`${loft}?statement=new`, withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }), ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Client statement" });
        expect(await within(dialog).findByLabelText("Client price for Paint")).toBeDisabled();
        expect(within(dialog).queryByRole("button", { name: "+25%" })).not.toBeInTheDocument();
    });

    it("are made and saved as a PDF, which is recorded as a delivery", async () => {
        const createdWith: Choice[] = [];
        const delivered: unknown[] = [];
        renderApp(`${loft}?statement=new`, karim,
            http.post("/api/projects/:id/statements", async ({ request }) => { createdWith.push(await request.json() as Choice); return HttpResponse.json(made, { status: 201 }); }),
            http.post("/api/statements/:id/deliveries", async ({ request }) => { delivered.push(await request.json()); return HttpResponse.json(made); }),
            http.get("/api/statements/:id/pdf", () => new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } })),
            http.get("/api/statements/:id", () => HttpResponse.json(made)),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Client statement" });
        await within(dialog).findByText("Preview");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save PDF" }));
        await waitFor(() => expect(createdWith).toEqual([{ mode: "detail", includeEarlier: false, excludedMaterialIds: [], unlistedTypeKeys: [] }]));
        await waitFor(() => expect(delivered).toEqual([{ channel: "download" }]));
        expect(await screen.findByText(`${made.number} downloaded`)).toBeInTheDocument();
        // the window now shows the statement that was made
        expect(await screen.findByRole("dialog", { name: made.number })).toBeInTheDocument();
    });

    it("say when one made on the way couldn't be sent, and open it to try again", async () => {
        renderApp(`${loft}?statement=new`, karim,
            http.post("/api/projects/:id/statements", () => HttpResponse.json(made, { status: 201 })),
            http.post("/api/statements/:id/email", () => HttpResponse.json({ code: "email_failed", message: "The email couldn't be sent." }, { status: 502 })),
            http.get("/api/statements/:id", () => HttpResponse.json(made)),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Client statement" });
        await within(dialog).findByText("Preview");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send to client…" }));
        const picker = await screen.findByRole("dialog", { name: /^Send/ });
        await userEvent.click(within(picker).getByRole("button", { name: "Send" }));
        expect(await screen.findByText("The statement wasn't sent")).toBeInTheDocument();
        expect(screen.getByText(/The statement was made\. The email couldn't be sent\./)).toBeInTheDocument();
        expect(await screen.findByRole("dialog", { name: made.number })).toBeInTheDocument();
    });

    it("are emailed to the client", async () => {
        const emailed: unknown[] = [];
        renderApp(`${lobby}?statement=1`, karim,
            http.post("/api/statements/:id/email", async ({ request, params }) => { emailed.push([params.id, await request.json()]); return HttpResponse.json(site.statement); }),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "ST-2026-001" });
        await userEvent.click(await within(dialog).findByRole("button", { name: "Send to client…" }));
        const picker = await screen.findByRole("dialog", { name: "Send ST-2026-001" });
        expect(within(picker).getByRole("radio", { name: /Email mounir\.aoun@mail\.test/ })).toBeChecked();
        await userEvent.click(within(picker).getByRole("button", { name: "Send" }));
        await waitFor(() => expect(emailed).toEqual([["1", { to: "mounir.aoun@mail.test" }]]));
        expect(await screen.findByText("ST-2026-001 emailed to mounir.aoun@mail.test")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("are shared on WhatsApp, with the chat ready", async () => {
        const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        const delivered: unknown[] = [];
        renderApp(`${lobby}?statement=1`, karim,
            http.post("/api/statements/:id/deliveries", async ({ request }) => { delivered.push(await request.json()); return HttpResponse.json(site.statement); }),
            ...siteHandlers);
        await userEvent.click(await within(await screen.findByRole("dialog", { name: "ST-2026-001" })).findByRole("button", { name: "Send to client…" }));
        const picker = await screen.findByRole("dialog", { name: "Send ST-2026-001" });
        await userEvent.click(within(picker).getByRole("radio", { name: /WhatsApp/ }));
        await userEvent.click(within(picker).getByRole("button", { name: "Send" }));
        await waitFor(() => expect(delivered).toEqual([{ channel: "whatsapp", recipient: "+961 71 222 333" }]));
        expect(tab.location.href).toMatch(/^https:\/\/wa\.me\/96171222333\?text=Hello%20Mounir%20-%20here%20is%20the%20materials%20statement%20ST-2026-001/);
    });

    it("are only downloaded, and never recorded as sent, without statement:send", async () => {
        const delivered: unknown[] = [];
        renderApp(`${lobby}?statement=1`, withPermissions(karim, { revoke: [P.STATEMENT_SEND] }),
            http.post("/api/statements/:id/deliveries", async ({ request }) => { delivered.push(await request.json()); return HttpResponse.json(site.statement); }),
            http.get("/api/statements/:id/pdf", () => new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } })),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "ST-2026-001" });
        expect(within(dialog).queryByRole("button", { name: "Send to client…" })).not.toBeInTheDocument();
        await userEvent.click(await within(dialog).findByRole("button", { name: "Save PDF" }));
        expect(await screen.findByText("ST-2026-001 downloaded")).toBeInTheDocument();
        expect(delivered).toEqual([]);
    });

    it("can't be made without statement:create, even from a link", async () => {
        renderApp(`${loft}?statement=new`, withPermissions(karim, { revoke: [P.STATEMENT_CREATE] }), ...siteHandlers);
        const panel = (await screen.findByText("Project money")).closest(".panel") as HTMLElement;
        expect(within(panel).queryByRole("button", { name: "Client statement" })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.queryByRole("button", { name: "Client statement" })).not.toBeInTheDocument();
    });
});

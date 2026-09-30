import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const karim = personas.executionAdmin;
// Mar Mikhael loft renovation: four materials, none on a statement yet
const open = site.losingProject;
const openPath = `/execution/projects/${open.id}`;
// Achrafieh Towers lobby: every material is on its client statement
const statedPath = `/execution/projects/${site.project.id}`;
const plasterboard = site.openMaterials.items[0];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const panel = async () => (await screen.findByText("What has been delivered or used on site, and what it cost. Click any cell to change it.")).closest(".panel") as HTMLElement;
const listWith = (items: Schemas["MaterialResponse"][], patch: Partial<Schemas["MaterialListResponse"]> = {}) =>
    HttpResponse.json({ ...site.openMaterials, items, ...patch });

/** Types into a grid cell and leaves it with Enter, as site staff do. */
async function typeInto(cell: HTMLElement, text: string) {
    await userEvent.click(cell);
    await userEvent.clear(cell);
    if (text) await userEvent.type(cell, text);
    await userEvent.keyboard("{Enter}");
}

describe("the materials on a site", () => {
    it("are listed with their cost, what the client is charged and who added them", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("4 items · 4 types")).toBeInTheDocument();
        expect(within(p).getByText("Charged to the client")).toBeInTheDocument();
        expect(within(p).getByLabelText("Type 1")).toHaveValue("Plasterboard");
        expect(within(p).getByLabelText("Client price 1")).toHaveValue("1188");
        expect(within(p).getAllByText("+20%")).toHaveLength(4);
        expect(within(p).getAllByText("Nour Aziz")).toHaveLength(4);
    });

    it("keep client prices and material profit from people who don't see money", async () => {
        renderApp(openPath, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW, P.PROJECT_PRICING_MANAGE] }), ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Type 1")).toBeInTheDocument();
        expect(within(p).queryByLabelText("Client price 1")).not.toBeInTheDocument();
        expect(within(p).queryByText("Charged to the client")).not.toBeInTheDocument();
        expect(within(p).queryByText("Material profit")).not.toBeInTheDocument();
    });

    it("saves a changed cell, with the total following quantity × unit cost", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/materials/:materialId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Qty 1"), "100");
        await waitFor(() => expect(saved).toEqual([{ name: "Plasterboard", quantity: 100, unit: "sheet", unitCost: 11, amount: null, supplier: "Gypsum Lb", note: null }]));
    });

    it("takes a total typed over quantity × unit cost as a new unit cost", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/materials/:materialId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        await typeInto(await within(await panel()).findByLabelText("Total 1"), "900");
        await waitFor(() => expect(saved).toEqual([expect.objectContaining({ quantity: 90, unitCost: 10, amount: null })]));
    });

    it("keeps the total when the quantity is cleared, and drops its unit", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/materials/:materialId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        await typeInto(await within(await panel()).findByLabelText("Qty 1"), "");
        await waitFor(() => expect(saved).toEqual([expect.objectContaining({ quantity: null, unit: null, unitCost: 11, amount: 990 })]));
    });

    it("start the next change on a row from what was just saved, before the list comes back", async () => {
        const saved: Record<string, unknown>[] = [];
        let lists = 0;
        let release = () => {};
        const held = new Promise<void>((resolve) => { release = resolve; });
        renderApp(openPath, karim,
            // the list is slow to come back after the first save
            http.get("/api/projects/:id/materials", async () => { if (lists++ > 1) await held; return listWith(site.openMaterials.items); }),
            http.put("/api/projects/:id/materials/:materialId", async ({ request }) => {
                const body = await request.json() as Record<string, number>;
                saved.push(body);
                return HttpResponse.json({ ...plasterboard, quantity: body.quantity, unitCost: body.unitCost, cost: body.quantity * body.unitCost, clientPrice: body.quantity * body.unitCost * 1.2 });
            }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Qty 1"), "100");
        await waitFor(() => expect(saved).toHaveLength(1));
        await waitFor(() => expect(within(p).getByLabelText("Total 1")).toHaveValue("1100"));
        await typeInto(within(p).getByLabelText("Unit cost 1"), "12");
        await waitFor(() => expect(saved[1]).toMatchObject({ quantity: 100, unitCost: 12 }));
        release();
    });

    it("don't save a cell that was only passed through", async () => {
        const priced: unknown[] = [];
        let current = plasterboard;
        renderApp(openPath, karim,
            http.get("/api/projects/:id/materials", () => listWith([current, ...site.openMaterials.items.slice(1)])),
            http.put("/api/projects/:id/materials/:materialId", () => {
                current = { ...plasterboard, unitCost: 10, cost: 900, clientPrice: 1080 };
                return HttpResponse.json(current);
            }),
            http.put("/api/projects/:id/materials/:materialId/client-price", async ({ request }) => { priced.push(await request.json()); return HttpResponse.json(current); }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Total 1"), "900");
        // Enter moved on to the client price, which follows the save
        const price = within(p).getByLabelText("Client price 1");
        expect(price).toHaveFocus();
        await waitFor(() => expect(price).toHaveValue("1080"));
        await userEvent.keyboard("{Enter}");
        expect(priced).toEqual([]);
    });

    it("won't save a material without a type", async () => {
        const saved: unknown[] = [];
        renderApp(openPath, karim,
            http.put("/api/projects/:id/materials/:materialId", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(plasterboard); }),
            ...siteHandlers);
        const type = await within(await panel()).findByLabelText("Type 1");
        await typeInto(type, "");
        expect(await screen.findByText("Say what type it is")).toBeInTheDocument();
        expect(type).toHaveValue("Plasterboard");
        expect(saved).toEqual([]);
    });

    it("sets a price of its own, and puts it back on the markup", async () => {
        const priced: unknown[] = [];
        const own = { ...plasterboard, clientPrice: 1300, priceSource: "manual" as const, markup: 0.3131 };
        renderApp(openPath, karim,
            http.get("/api/projects/:id/materials", () => listWith([own, ...site.openMaterials.items.slice(1)])),
            http.put("/api/projects/:id/materials/:materialId/client-price", async ({ request }) => { priced.push(await request.json()); return HttpResponse.json(own); }),
            ...siteHandlers);
        const p = await panel();
        await typeInto(await within(p).findByLabelText("Client price 2"), "1100");
        await userEvent.click(within(p).getByRole("button", { name: "Put Plasterboard back on the default material profit" }));
        await waitFor(() => expect(priced).toEqual([{ clientPrice: 1100 }, { clientPrice: null }]));
    });

    it("can't be priced without project:pricing_manage", async () => {
        renderApp(openPath, withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }), ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Client price 1")).toBeDisabled();
        expect(within(p).getByLabelText("Type 1")).toBeEnabled();
    });

    it("keep the type, cost and price of what is on a client statement, and can't be removed", async () => {
        renderApp(statedPath, karim, ...siteHandlers);
        const p = await panel();
        for (const cell of ["Type 1", "Qty 1", "Unit 1", "Unit cost 1", "Total 1", "Client price 1"]) {
            expect(await within(p).findByLabelText(cell)).toBeDisabled();
        }
        expect(within(p).getByLabelText("Supplier 1")).toBeEnabled();
        expect(within(p).getByLabelText("Note 1")).toBeEnabled();
        expect(within(p).queryByRole("button", { name: "Delete row" })).not.toBeInTheDocument();
    });

    it("lock what someone else added for people who may only change their own", async () => {
        const theirs = { ...plasterboard, canEdit: false };
        renderApp(openPath, withPermissions(karim, { revoke: [P.MATERIAL_MANAGE, P.PROJECT_PRICING_MANAGE] }),
            http.get("/api/projects/:id/materials", () => listWith([theirs, ...site.openMaterials.items.slice(1)])),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Type 1")).toBeDisabled();
        expect(within(p).getByLabelText("Supplier 1")).toBeDisabled();
        expect(within(p).getByLabelText("Type 2")).toBeEnabled();
        expect(within(p).getAllByRole("button", { name: "Delete row" })).toHaveLength(3);
    });

    it("are removed with two clicks", async () => {
        const removed: string[] = [];
        renderApp(openPath, karim,
            http.delete("/api/projects/:id/materials/:materialId", ({ params }) => { removed.push(String(params.materialId)); return new HttpResponse(null, { status: 204 }); }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click((await within(p).findAllByRole("button", { name: "Delete row" }))[0]);
        expect(removed).toEqual([]);
        await userEvent.click(within(p).getByRole("button", { name: "Delete?" }));
        await waitFor(() => expect(removed).toEqual([String(plasterboard.id)]));
        expect(await screen.findByText("Plasterboard removed")).toBeInTheDocument();
    });

    it("are filtered on the server, and say how many match", async () => {
        const asked: (string | null)[] = [];
        renderApp(openPath, karim,
            http.get("/api/projects/:id/materials", ({ request }) => {
                const type = new URL(request.url).searchParams.get("type");
                if (new URL(request.url).searchParams.get("pageSize") === "30") asked.push(type);
                return type ? listWith([plasterboard], { matching: { count: 1, cost: 990, charge: 1188 }, totalCount: 1 }) : listWith(site.openMaterials.items);
            }),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Filter by type"));
        await userEvent.click(screen.getByRole("option", { name: "Plasterboard (1)" }));
        expect(await within(p).findByText("1 of 4 shown")).toBeInTheDocument();
        expect(within(p).getAllByText("Material cost · Plasterboard")).toHaveLength(2);
        expect(asked).toContain("plasterboard");
        await userEvent.click(within(p).getByRole("button", { name: "Clear" }));
        expect(await within(p).findByText("4 items · 4 types")).toBeInTheDocument();
    });

    it("start with an invitation to add the first ones", async () => {
        renderApp(openPath, karim,
            http.get("/api/projects/:id/materials", () => listWith([], { all: { count: 0, cost: 0, charge: 0 }, matching: { count: 0, cost: 0, charge: 0 }, totalCount: 0, types: [], suppliers: [], addedBy: [] })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("No materials logged yet")).toBeInTheDocument();
        expect(within(p).getAllByRole("button", { name: "Add materials" })).toHaveLength(2);
    });

    it("are closed to new entries once the site is done", async () => {
        const done = { ...open, status: "completed", completedAt: "2026-09-29T12:00:00Z" };
        renderApp(openPath, karim,
            http.get("/api/projects/:id", () => HttpResponse.json(done)),
            http.get("/api/projects/:id/materials", () => listWith(site.openMaterials.items.map((m) => ({ ...m, canEdit: false })), { canAdd: false })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("Closed to new entries")).toBeInTheDocument();
        expect(within(p).queryByRole("button", { name: "Add materials" })).not.toBeInTheDocument();
        expect(within(p).getByLabelText("Client price 1")).toBeDisabled();
    });
});

describe("the Add materials sheet", () => {
    const openSheet = async () => {
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Add materials" }));
        return screen.findByRole("dialog", { name: "Add materials" });
    };

    it("adds the rows typed, with the total and client price worked out as they are typed", async () => {
        const added: unknown[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/materials", async ({ request }) => { added.push(await request.json()); return HttpResponse.json([plasterboard], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        // the four recorded materials sit above, read-only; the first new row is the fifth
        expect(await within(sheet).findByLabelText("Type 1")).toBeDisabled();
        await waitFor(() => expect(within(sheet).getByLabelText("Type 5")).toHaveFocus());
        await userEvent.keyboard("Cement{Enter}10{Enter}ba{Enter}5.5{Enter}");
        expect(within(sheet).getByLabelText("Unit 5")).toHaveValue("bag");
        expect(within(sheet).getByLabelText("Total 5")).toHaveValue("55");
        expect(within(sheet).getByLabelText("Client price 5")).toHaveValue("66");
        expect(within(sheet).getByRole("status")).toHaveTextContent("(+$55 here)");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 material" }));
        await waitFor(() => expect(added).toEqual([{ items: [{ name: "Cement", quantity: 10, unit: "bag", unitCost: 5.5, amount: null, supplier: null, note: null, clientPrice: null }] }]));
        expect(await screen.findByText("Added 1 material")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("marks the rows still missing a cost, and adds nothing", async () => {
        const added: unknown[] = [];
        renderApp(openPath, karim,
            http.post("/api/projects/:id/materials", async ({ request }) => { added.push(await request.json()); return HttpResponse.json([], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Type 5")).toHaveFocus());
        await userEvent.keyboard("Sand{Enter}2{Enter}");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 material" }));
        expect(within(sheet).getByText(/1 row needs a type and a cost/)).toBeInTheDocument();
        expect(within(sheet).getByLabelText("Unit cost 5").closest("td")).toHaveClass("bad");
        expect(added).toEqual([]);
    });

    it("takes a block pasted from Excel", async () => {
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        const first = await within(sheet).findByLabelText("Type 5");
        fireEvent.paste(first, { clipboardData: { getData: () => "Sand\t2\ttonne\t30\nGlass\t\t\t\t9400" } });
        expect(within(sheet).getByLabelText("Total 5")).toHaveValue("60");
        expect(within(sheet).getByLabelText("Type 6")).toHaveValue("Glass");
        expect(within(sheet).getByRole("button", { name: "Add 2 materials" })).toBeEnabled();
    });

    it("sends its own client price only for people who price materials", async () => {
        const added: { items: Record<string, unknown>[] }[] = [];
        renderApp(openPath, withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }),
            http.post("/api/projects/:id/materials", async ({ request }) => { added.push(await request.json() as never); return HttpResponse.json([], { status: 201 }); }),
            ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Type 5")).toHaveFocus());
        expect(within(sheet).queryByLabelText("Client price 5")).not.toBeInTheDocument();
        await userEvent.keyboard("Glass{Enter}{Enter}{Enter}{Enter}9400{Enter}");
        await userEvent.click(within(sheet).getByRole("button", { name: "Add 1 material" }));
        await waitFor(() => expect(added[0]?.items[0]).toMatchObject({ name: "Glass", amount: 9400, clientPrice: null }));
    });

    it("asks before throwing away what was typed", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        renderApp(openPath, karim, ...siteHandlers);
        const sheet = await openSheet();
        await waitFor(() => expect(within(sheet).getByLabelText("Type 5")).toHaveFocus());
        await userEvent.keyboard("Sand");
        await userEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
        expect(confirm).toHaveBeenCalledWith("Discard the 1 material typed so far?");
        expect(screen.getByRole("dialog", { name: "Add materials" })).toBeInTheDocument();
    });
});

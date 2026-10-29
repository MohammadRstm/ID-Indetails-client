import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type RequestHandler } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { boqs, summaryOf } from "@/test/fixtures/boqs";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default, and with it the BOQs
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
// One who may only read the BOQs and the price
const reader = withPermissions(personas.executionAdmin, { grant: [P.FINANCIAL_VIEW] });
// One who writes internal drafts of his own
const author = withPermissions(personas.executionAdmin, { grant: [P.FINANCIAL_VIEW, P.BOQ_CREATE] });
const path = `/execution/projects/${site.project.id}`;
const boqsTab = `${path}?tab=boqs`;

afterEach(() => vi.restoreAllMocks());

const panel = () => screen.findByRole("region", { name: "Bills of quantities" });
const listOf = (list: typeof boqs.list) => http.get("/api/projects/:id/boqs", () => HttpResponse.json(list));
const refusal = (status: number, code: string, message = "The API's words.") =>
    HttpResponse.json({ type: "business_rule", code, message, errors: null, traceId: "t" }, { status });

/** Opens a BOQ through its link and waits for its editor. */
async function open(id: number, name: string, user = karim, ...handlers: RequestHandler[]) {
    renderApp(`${path}?boq=${id}`, user, ...handlers, ...siteHandlers);
    const dialog = await screen.findByRole("dialog", { name });
    await within(dialog).findByLabelText("Title");
    return dialog;
}
const save = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Save" });
/** What the API remembers of a BOQ: read again after a change, it answers with the changed one. */
function remembered(id: number, start: unknown) {
    let current = start;
    return {
        read: http.get(`/api/boqs/${id}`, () => HttpResponse.json(current as never)),
        becomes: (next: unknown) => { current = next; return HttpResponse.json(next as never); },
    };
}
/** Saves of a BOQ, recorded: each answers with `returns`, which is what the BOQ is from then on. */
function saving(id: number, start: unknown, returns: unknown = start) {
    const memory = remembered(id, start);
    const sent: Record<string, unknown>[] = [];
    return {
        sent,
        handlers: [memory.read, http.put(`/api/boqs/${id}`, async ({ request }) => { sent.push(await request.json() as Record<string, unknown>); return memory.becomes(returns); })],
    };
}

describe("a site's bills of quantities", () => {
    it("add up the price, and list the client BOQs, the VOs and everyone's drafts for whoever manages the site's pricing", async () => {
        renderApp(boqsTab, karim, ...siteHandlers);
        const p = await panel();
        const price = await within(p).findByRole("group", { name: "Price" });
        expect(within(price).getByText("Agreed BOQ").closest("div")).toHaveTextContent("$17,000");
        expect(within(price).getByText("Agreed BOQ").closest("div")).toHaveTextContent("BQ-2026-001");
        expect(within(price).getByText("Agreed VOs").closest("div")).toHaveTextContent("$0");
        expect(within(price).getByText("Work price").closest("div")).toHaveTextContent("$17,000");
        expect(within(price).getByText("Supervision").closest("div")).toHaveTextContent("$1,700");
        expect(within(price).getByText("Supervision").closest("div")).toHaveTextContent("10% of the work price");
        expect(within(price).getByText("TVA").closest("div")).toHaveTextContent("0% of the work price");
        expect(within(price).getByText("Client total").closest("div")).toHaveTextContent("$18,700");

        const agreed = within(p).getByRole("button", { name: "Open BQ-2026-001" });
        for (const text of ["Lobby works", "Agreed", "$17,000", "3 lines", "emailed Oct 3"]) expect(agreed).toHaveTextContent(text);
        const vo = within(p).getByRole("button", { name: "Open VO-2026-001" });
        for (const text of ["Fence", "Fence along the north side", "Draft", "$6,500"]) expect(vo).toHaveTextContent(text);
        // the drafts of everyone, with their authors
        expect(within(p).getByText("Internal drafts")).toBeInTheDocument();
        expect(within(p).getByRole("button", { name: "Open Karim's quantities" })).toHaveTextContent("by Karim Test");
        expect(within(p).getByRole("button", { name: "Open Nadia's quantities" })).toHaveTextContent("by Nadia Test");
        for (const name of ["New draft", "New client BOQ", "New VO"]) expect(within(p).getByRole("button", { name })).toBeEnabled();
    });

    it("read Not chosen on the other client drafts once one is agreed", async () => {
        renderApp(boqsTab, karim, ...siteHandlers);
        const p = await panel();
        const other = await within(p).findByRole("button", { name: "Open BQ-2026-002" });
        expect(other).toHaveTextContent("Not chosen");
        expect(other).not.toHaveTextContent("Agreed");
    });

    it("offer a new VO only once a client BOQ is agreed", async () => {
        renderApp(boqsTab, karim, listOf(boqs.unagreed), ...siteHandlers);
        const p = await panel();
        const other = await within(p).findByRole("button", { name: "Open BQ-2026-002" });
        expect(other).toHaveTextContent("Draft");
        expect(other).not.toHaveTextContent("Not chosen");
        expect(within(p).queryByRole("button", { name: "New VO" })).not.toBeInTheDocument();
        expect(within(p).getByText("VOs can be made once a client BOQ is agreed.")).toBeInTheDocument();
        expect(within(p).getByText("none agreed yet")).toBeInTheDocument();
        expect(within(p).getByRole("button", { name: "New client BOQ" })).toBeInTheDocument();
    });

    it("show someone who only sees money the BOQs and the price, to read", async () => {
        renderApp(boqsTab, reader, listOf({ ...boqs.list, internal: [] }), ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByRole("group", { name: "Price" })).toBeInTheDocument();
        expect(within(p).getByRole("button", { name: "Open BQ-2026-001" })).toBeInTheDocument();
        for (const name of ["New draft", "New client BOQ", "New VO"]) expect(within(p).queryByRole("button", { name })).not.toBeInTheDocument();
        expect(within(p).queryByText("Internal drafts")).not.toBeInTheDocument();
        expect(within(p).queryByText("My drafts")).not.toBeInTheDocument();

        await userEvent.click(within(p).getByRole("button", { name: "Open BQ-2026-002" }));
        const dialog = await screen.findByRole("dialog", { name: "BQ-2026-002" });
        expect(await within(dialog).findByLabelText("Description 1")).toBeDisabled();
        expect(within(dialog).getByText("You can read this BOQ but not change it.")).toBeInTheDocument();
        for (const name of ["Save", "Add line", "Send…", "Agree", "Withdraw agreement"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
    });

    it("show someone who writes drafts their own, and nothing else to write", async () => {
        const mine = { client: boqs.list.client, vos: [], internal: [summaryOf(boqs.draftMine)], price: boqs.list.price };
        renderApp(boqsTab, author, listOf(mine), ...siteHandlers);
        const p = await panel();
        const row = await within(p).findByRole("button", { name: "Open Karim's quantities" });
        expect(within(p).getByText("My drafts")).toBeInTheDocument();
        expect(row).not.toHaveTextContent("by Karim Test");
        expect(within(p).getByRole("button", { name: "New draft" })).toBeEnabled();
        for (const name of ["New client BOQ", "New VO"]) expect(within(p).queryByRole("button", { name })).not.toBeInTheDocument();

        await userEvent.click(row);
        const dialog = await screen.findByRole("dialog", { name: "Karim's quantities" });
        expect(await within(dialog).findByLabelText("Description 1")).toBeEnabled();
        expect(save(dialog)).toBeEnabled();
        // an internal draft is never sent or agreed
        for (const name of ["Send…", "Agree"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
        // and a client BOQ is only read
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await userEvent.click(within(p).getByRole("button", { name: "Open BQ-2026-002" }));
        const client = await screen.findByRole("dialog", { name: "BQ-2026-002" });
        expect(await within(client).findByLabelText("Description 1")).toBeDisabled();
    });

    it("are not on the page, or asked for, without boq:create, financial:view or project:pricing_manage", async () => {
        const asked: string[] = [];
        renderApp(boqsTab, personas.executionAdmin, http.get("/api/projects/:id/boqs", () => { asked.push("list"); return HttpResponse.json(boqs.list); }), ...siteHandlers);
        expect(await screen.findByRole("tab", { name: "Overview" })).toBeInTheDocument();
        for (const name of ["Financials", "BOQs"]) expect(screen.queryByRole("tab", { name })).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Bills of quantities" })).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("have their own tab, so an author who sees no money still finds their drafts", async () => {
        const drafter = withPermissions(personas.executionAdmin, { grant: [P.BOQ_CREATE] });
        // without financial:view the API sends only the author's own drafts, and no price
        renderApp(boqsTab, drafter, listOf({ internal: [summaryOf(boqs.draftMine)], client: [], vos: [], price: null }), ...siteHandlers);
        const p = await panel();
        expect(screen.getByRole("tab", { name: "BOQs", selected: true })).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Financials" })).not.toBeInTheDocument();
        expect(await within(p).findByRole("button", { name: "Open Karim's quantities" })).toBeInTheDocument();
        expect(within(p).getByText("My drafts")).toBeInTheDocument();
        expect(within(p).getByRole("button", { name: "New draft" })).toBeEnabled();
        for (const text of ["Client BOQs", "VOs", "Client total"]) expect(within(p).queryByText(text)).not.toBeInTheDocument();
    });

    it("can't be started on a closed site", async () => {
        const closed = { ...site.project, status: "completed", completedAt: "2026-10-01T09:00:00Z" };
        renderApp(boqsTab, karim, http.get("/api/projects/:id", () => HttpResponse.json(closed)), ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("Closed to changes")).toBeInTheDocument();
        for (const name of ["New draft", "New client BOQ", "New VO"]) expect(within(p).queryByRole("button", { name })).not.toBeInTheDocument();
        await userEvent.click(within(p).getByRole("button", { name: "Open BQ-2026-002" }));
        const dialog = await screen.findByRole("dialog", { name: "BQ-2026-002" });
        expect(await within(dialog).findByText("The site is closed: a BOQ can't be changed until it is reopened.")).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Description 1")).toBeDisabled();
    });
});

describe("starting a BOQ", () => {
    it("makes a client BOQ, from a draft if asked, and opens it", async () => {
        const created: unknown[] = [];
        renderApp(boqsTab, karim, http.post("/api/projects/:id/boqs", async ({ request }) => { created.push(await request.json()); return HttpResponse.json(boqs.draftB); }), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New client BOQ" }));
        const dialog = await screen.findByRole("dialog", { name: "New client BOQ" });
        await userEvent.type(within(dialog).getByLabelText(/^Title/), "Option C");
        await userEvent.click(within(dialog).getByLabelText("Start from"));
        await userEvent.click(screen.getByRole("option", { name: /Karim's quantities/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        await waitFor(() => expect(created).toEqual([{ kind: "client", title: "Option C", fromBoqId: 51 }]));
        // its editor opens
        expect(await screen.findByRole("dialog", { name: "BQ-2026-002" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "New client BOQ" })).not.toBeInTheDocument();
    });

    it("makes an internal draft with its default title", async () => {
        const created: unknown[] = [];
        renderApp(boqsTab, karim, http.post("/api/projects/:id/boqs", async ({ request }) => { created.push(await request.json()); return HttpResponse.json(boqs.draftMine); }), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New draft" }));
        const dialog = await screen.findByRole("dialog", { name: "New draft" });
        expect(within(dialog).getByLabelText(/^Title/)).toHaveAttribute("placeholder", "Internal draft");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        await waitFor(() => expect(created).toEqual([{ kind: "internal" }]));
        expect(await screen.findByRole("dialog", { name: "Karim's quantities" })).toBeInTheDocument();
    });

    it("asks a VO for its reason, live, before making it", async () => {
        const created: unknown[] = [];
        renderApp(boqsTab, karim, http.post("/api/projects/:id/boqs", async ({ request }) => { created.push(await request.json()); return HttpResponse.json(boqs.vo); }), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New VO" }));
        const dialog = await screen.findByRole("dialog", { name: "New VO" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        expect(within(dialog).getByText("Say why the variation is needed.")).toBeInTheDocument();
        expect(created).toEqual([]);

        const reason = within(dialog).getByLabelText("Why is it needed?");
        await userEvent.type(reason, "A fence");
        expect(within(dialog).queryByText("Say why the variation is needed.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        await waitFor(() => expect(created).toEqual([{ kind: "vo", reason: "A fence" }]));
        expect(await screen.findByRole("dialog", { name: "VO-2026-001" })).toBeInTheDocument();
    });

    it("limits the title to what the API keeps", async () => {
        const created: unknown[] = [];
        renderApp(boqsTab, karim, http.post("/api/projects/:id/boqs", async ({ request }) => { created.push(await request.json()); return HttpResponse.json(boqs.draftB); }), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New client BOQ" }));
        const dialog = await screen.findByRole("dialog", { name: "New client BOQ" });
        await userEvent.click(within(dialog).getByLabelText(/^Title/));
        await userEvent.paste("t".repeat(121));
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        expect(within(dialog).getByText("At most 120 characters.")).toBeInTheDocument();
        expect(created).toEqual([]);
    });

    it("says in words when the API refuses", async () => {
        renderApp(boqsTab, karim, http.post("/api/projects/:id/boqs", () => refusal(422, "boq_not_agreed_yet")), ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New VO" }));
        const dialog = await screen.findByRole("dialog", { name: "New VO" });
        await userEvent.type(within(dialog).getByLabelText("Why is it needed?"), "A fence");
        await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
        expect(await within(dialog).findByText("A VO can only be made or agreed once the client BOQ is agreed.")).toBeInTheDocument();
    });
});

describe("the BOQ editor", () => {
    it("opens an agreed BOQ read-only, with the figures of its save", async () => {
        const dialog = await open(31, "BQ-2026-001");
        expect(within(dialog).getByText(/Agreed on Oct 5, 2026 by Rana Test/)).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Title")).toBeDisabled();
        expect(within(dialog).getByLabelText("Description 1")).toBeDisabled();
        for (const name of ["Save", "Add line", "Agree", "Remove line 1", "Move line 2 up"]) expect(within(dialog).queryByRole("button", { name })).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Send…" })).toBeEnabled();
        expect(within(dialog).getByRole("button", { name: "Withdraw agreement" })).toBeEnabled();

        // every figure is the API's
        const row = within(dialog).getByLabelText("Quantity 1").closest("tr") as HTMLElement;
        expect(row).toHaveTextContent("105");
        expect(row).toHaveTextContent("$2,100");
        const totals = within(dialog).getByRole("group", { name: "Totals" });
        expect(within(totals).getByText("Subtotal").closest("div")).toHaveTextContent("$17,000");
        expect(within(totals).getByText("Supervision").closest("div")).toHaveTextContent("$1,700");
        expect(within(totals).getByText("TVA").closest("div")).toHaveTextContent("$0");
        expect(within(totals).getByText("Client pays").closest("div")).toHaveTextContent("$18,700");
        // what it was sent as, and when
        expect(within(dialog).getByText("Emailed to fadi@achrafiehtowers.test")).toBeInTheDocument();
        expect(within(dialog).getByText(/It said \$17,000/)).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        expect(await screen.findByRole("button", { name: "Duplicate" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
        for (const name of ["Delete draft", "Copy lines from…"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    });

    it("says a draft was not chosen when another client BOQ is agreed", async () => {
        const dialog = await open(32, "BQ-2026-002");
        expect(await within(dialog).findByText(/BQ-2026-001 is the agreed one/)).toBeInTheDocument();
        expect(within(dialog).getByText("Not chosen", { selector: ".badge" })).toBeInTheDocument();
        // it stays a draft to change
        expect(within(dialog).getByLabelText("Description 1")).toBeEnabled();
    });

    it("shows a dash in the cells of a line changed since the last save, until it is saved", async () => {
        const [first, ...rest] = boqs.draftB.lines;
        const after = {
            ...boqs.draftB, lines: [{ ...first, quantity: 200, finalQuantity: 210, totalUsd: 4200 }, ...rest],
            subtotalUsd: 19100, totalUsd: 19100, supervisionUsd: 1910, clientTotalUsd: 21010,
        };
        const calls = saving(32, boqs.draftB, after);
        const dialog = await open(32, "BQ-2026-002", karim, ...calls.handlers);
        const row = (n: number) => within(dialog).getByLabelText(`Quantity ${n}`).closest("tr") as HTMLElement;
        expect(row(1)).toHaveTextContent("105");
        expect(row(1)).toHaveTextContent("$2,100");

        const quantity = within(dialog).getByLabelText("Quantity 1");
        await userEvent.clear(quantity);
        await userEvent.type(quantity, "200");
        expect(within(row(1)).getAllByText("—")).toHaveLength(2);
        expect(row(1)).not.toHaveTextContent("$2,100");
        // the other lines keep what the last save worked out, and so do the totals, which say whose they are
        expect(row(2)).toHaveTextContent("$5,940");
        expect(within(within(dialog).getByRole("group", { name: "Totals" })).getByText("Subtotal").closest("div")).toHaveTextContent("$17,000");
        expect(within(dialog).getByText("Unsaved changes")).toBeInTheDocument();
        expect(within(dialog).getByText("These are the figures of the last save. They are worked out again when you save.")).toBeInTheDocument();

        await userEvent.click(save(dialog));
        await waitFor(() => expect(calls.sent).toHaveLength(1));
        expect(calls.sent[0]).toEqual({
            title: "Lobby works, option B", reason: null, adjustmentType: "none", adjustmentValue: null,
            lines: [
                { id: 201, code: "1.1", description: "Demolition", quantity: 200, wasteRate: 0.05, unit: "m²", rate: 20 },
                { id: 202, code: "2.1", description: "Porcelain tiles", quantity: 180, wasteRate: 0.1, unit: "m²", rate: 30 },
                { id: 203, code: "3.1", description: "Electrical first fix", quantity: 1, wasteRate: 0, unit: "lot", rate: 8960 },
            ],
            // the save it started from, which the API checks so it can't undo a newer one
            updatedAt: boqs.draftB.updatedAt,
        });
        // the API's figures are shown once it is saved
        await waitFor(() => expect(row(1)).toHaveTextContent("$4,200"));
        expect(row(1)).toHaveTextContent("210");
        expect(within(dialog).getByRole("group", { name: "Totals" })).toHaveTextContent("$19,100");
        expect(within(dialog).queryByText("Unsaved changes")).not.toBeInTheDocument();
    });

    it("shows what is wrong beside the field, live, and sends nothing until it is fixed", async () => {
        const calls = saving(32, boqs.draftB);
        const dialog = await open(32, "BQ-2026-002", karim, ...calls.handlers);
        await userEvent.clear(within(dialog).getByLabelText("Description 1"));
        await userEvent.clear(within(dialog).getByLabelText("Title"));
        await userEvent.click(save(dialog));
        expect(within(dialog).getByText("Line 1: Describe the work.")).toBeInTheDocument();
        expect(within(dialog).getByText("Give it a title.")).toBeInTheDocument();
        expect(calls.sent).toEqual([]);

        // from then on it follows what is typed
        await userEvent.type(within(dialog).getByLabelText("Title"), "Option B");
        expect(within(dialog).queryByText("Give it a title.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByLabelText("Title"));
        await userEvent.paste("t".repeat(113));
        expect(within(dialog).getByText("At most 120 characters.")).toBeInTheDocument();

        const rate = within(dialog).getByLabelText("Rate 1");
        await userEvent.clear(rate);
        await userEvent.type(rate, "-5");
        expect(within(dialog).getByText("Line 1: Only a VO can have a negative rate.")).toBeInTheDocument();
        const waste = within(dialog).getByLabelText("Waste % 1");
        await userEvent.clear(waste);
        await userEvent.type(waste, "150");
        expect(within(dialog).getByText("Line 1: The waste is between 0% and 100%.")).toBeInTheDocument();
        const quantity = within(dialog).getByLabelText("Quantity 1");
        await userEvent.clear(quantity);
        await userEvent.type(quantity, "-1");
        expect(within(dialog).getByText("Line 1: The quantity can't be negative.")).toBeInTheDocument();
        const code = within(dialog).getByLabelText("Code 1");
        await userEvent.clear(code);
        await userEvent.paste("c".repeat(21));
        expect(within(dialog).getByText("Line 1: At most 20 characters.")).toBeInTheDocument();

        await userEvent.click(save(dialog));
        expect(calls.sent).toEqual([]);
    });

    it("types waste and the adjustment as percents, sends them as fractions and shows the adjustment the API worked out", async () => {
        const after = { ...boqs.draftB, adjustmentType: "percent", adjustmentValue: -0.05, adjustmentUsd: -850, totalUsd: 16150, supervisionUsd: 1615, clientTotalUsd: 17765 };
        const calls = saving(32, boqs.draftB, after);
        const dialog = await open(32, "BQ-2026-002", karim, ...calls.handlers);
        const waste = within(dialog).getByLabelText("Waste % 1");
        await userEvent.clear(waste);
        await userEvent.type(waste, "12.5");
        await userEvent.click(within(dialog).getByRole("tab", { name: "By %" }));
        await userEvent.type(within(dialog).getByLabelText("Adjustment percent"), "-5");
        await userEvent.click(save(dialog));
        await waitFor(() => expect(calls.sent).toHaveLength(1));
        expect((calls.sent[0].lines as { wasteRate: number }[])[0].wasteRate).toBe(0.125);
        expect(calls.sent[0]).toMatchObject({ adjustmentType: "percent", adjustmentValue: -0.05 });
        expect(await within(dialog).findByText("-5% of the subtotal")).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Adjustment percent")).toHaveValue("-5");
        expect(within(within(dialog).getByRole("group", { name: "Totals" })).getByText("Adjustment").closest("div")).toHaveTextContent(money.exact(-850, "USD", { cents: true }));

        // or to a new total
        await userEvent.click(within(dialog).getByRole("tab", { name: "To a new total" }));
        await userEvent.type(within(dialog).getByLabelText("New total"), "16000");
        await userEvent.click(save(dialog));
        await waitFor(() => expect(calls.sent).toHaveLength(2));
        expect(calls.sent[1]).toMatchObject({ adjustmentType: "total", adjustmentValue: 16000 });
    });

    it("limits the adjustment, live", async () => {
        const dialog = await open(32, "BQ-2026-002");
        await userEvent.click(within(dialog).getByRole("tab", { name: "By %" }));
        const percent = within(dialog).getByLabelText("Adjustment percent");
        await userEvent.type(percent, "-99.5");
        await userEvent.click(save(dialog));
        expect(within(dialog).getByText("The adjustment is between -99% and 100%.")).toBeInTheDocument();
        await userEvent.clear(percent);
        await userEvent.type(percent, "-99");
        expect(within(dialog).queryByText("The adjustment is between -99% and 100%.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("tab", { name: "To a new total" }));
        await userEvent.type(within(dialog).getByLabelText("New total"), "-1");
        expect(within(dialog).getByText("The new total can't be negative.")).toBeInTheDocument();
    });

    it("adds, moves and removes lines, and saves them in the order shown", async () => {
        const calls = saving(32, boqs.draftB);
        const dialog = await open(32, "BQ-2026-002", karim, ...calls.handlers);
        expect(within(dialog).getByRole("button", { name: "Move line 1 up" })).toBeDisabled();
        expect(within(dialog).getByRole("button", { name: "Move line 3 down" })).toBeDisabled();

        await userEvent.click(within(dialog).getByRole("button", { name: "Add line" }));
        const description = within(dialog).getByLabelText("Description 4");
        // a line never saved has nothing worked out yet
        expect(within(description.closest("tr") as HTMLElement).getAllByText("—")).toHaveLength(2);
        await userEvent.type(description, "Painting");
        await userEvent.type(within(dialog).getByLabelText("Quantity 4"), "10");
        await userEvent.type(within(dialog).getByLabelText("Rate 4"), "12");
        await userEvent.click(within(dialog).getByRole("button", { name: "Move line 4 up" }));
        expect(within(dialog).getByLabelText("Description 3")).toHaveValue("Painting");
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove line 1" }));
        expect(within(dialog).queryByLabelText("Description 4")).not.toBeInTheDocument();
        expect(within(dialog).getByLabelText("Description 1")).toHaveValue("Porcelain tiles");
        expect(within(dialog).getByLabelText("Description 2")).toHaveValue("Painting");

        await userEvent.click(save(dialog));
        await waitFor(() => expect(calls.sent).toHaveLength(1));
        expect(calls.sent[0].lines).toEqual([
            { id: 202, code: "2.1", description: "Porcelain tiles", quantity: 180, wasteRate: 0.1, unit: "m²", rate: 30 },
            { id: null, code: null, description: "Painting", quantity: 10, wasteRate: 0, unit: null, rate: 12 },
            { id: 203, code: "3.1", description: "Electrical first fix", quantity: 1, wasteRate: 0, unit: "lot", rate: 8960 },
        ]);
    });

    it("lets a VO take a negative rate, and needs its reason", async () => {
        const calls = saving(41, boqs.vo);
        const dialog = await open(41, "VO-2026-001", karim, ...calls.handlers);
        const rate = within(dialog).getByLabelText("Rate 1");
        await userEvent.clear(rate);
        await userEvent.type(rate, "-130");
        const reason = within(dialog).getByLabelText("Reason");
        expect(reason).toHaveValue("Fence along the north side");
        await userEvent.clear(reason);
        await userEvent.click(save(dialog));
        expect(within(dialog).getByText("Say why the variation is needed.")).toBeInTheDocument();
        expect(within(dialog).queryByText("Line 1: Only a VO can have a negative rate.")).not.toBeInTheDocument();
        expect(calls.sent).toEqual([]);

        await userEvent.type(reason, "Take the fence out");
        await userEvent.click(save(dialog));
        await waitFor(() => expect(calls.sent).toHaveLength(1));
        expect(calls.sent[0]).toMatchObject({ reason: "Take the fence out" });
        expect((calls.sent[0].lines as { id: number; rate: number }[])[0]).toMatchObject({ id: 301, rate: -130 });
    });

    it("says in words when the API refuses a save", async () => {
        const dialog = await open(32, "BQ-2026-002", karim, http.put("/api/boqs/:id", () => refusal(422, "boq_locked")));
        await userEvent.click(save(dialog));
        expect(await within(dialog).findByText("An agreed BOQ can't be changed or deleted. Withdraw its agreement first.")).toBeInTheDocument();
    });

    it("won't undo a save someone made meanwhile, and reloads theirs when asked", async () => {
        const theirs = { ...boqs.draftB, title: "Lobby works, their option", updatedAt: "2026-10-29T12:00:00.500Z" };
        let reads = 0;
        const sent: Record<string, unknown>[] = [];
        const dialog = await open(32, "BQ-2026-002", karim,
            http.get("/api/boqs/32", () => HttpResponse.json(reads++ === 0 ? boqs.draftB : theirs)),
            http.put("/api/boqs/:id", async ({ request }) => { sent.push(await request.json() as Record<string, unknown>); return refusal(409, "boq_changed"); }));
        const title = within(dialog).getByLabelText("Title");
        await userEvent.clear(title);
        await userEvent.type(title, "Mine");
        await userEvent.click(save(dialog));
        expect(await within(dialog).findByText(/Someone saved this BOQ after you opened it/)).toBeInTheDocument();
        // the save names the one it started from, which is what the API checks
        expect(sent[0].updatedAt).toBe(boqs.draftB.updatedAt);

        await userEvent.click(within(dialog).getByRole("button", { name: "Reload" }));
        expect(await within(dialog).findByDisplayValue("Lobby works, their option")).toBeInTheDocument();
        expect(within(dialog).queryByText(/Someone saved this BOQ/)).not.toBeInTheDocument();
    });

    it("shows what the API refused beside the line or field it was about, until something is changed", async () => {
        const errors = {
            title: ["The title is already used."], "lines[0].description": ["The API wants a better description."],
            "lines[1].wasteRate": ["The API says the waste is wrong."], "lines[1].rate": ["The API says the rate is wrong."], adjustmentValue: ["The API says the adjustment is wrong."],
        };
        const dialog = await open(32, "BQ-2026-002", karim,
            http.put("/api/boqs/:id", () => HttpResponse.json({ type: "validation", code: "validation_failed", message: "Some fields need attention.", errors, traceId: "t" }, { status: 400 })));
        await userEvent.click(save(dialog));
        expect(await within(dialog).findByText("The title is already used.")).toBeInTheDocument();
        expect(within(dialog).getByText("Line 1: The API wants a better description.")).toBeInTheDocument();
        expect(within(dialog).getByText("Line 2: The API says the waste is wrong.")).toBeInTheDocument();
        expect(within(dialog).getByText("Line 2: The API says the rate is wrong.")).toBeInTheDocument();
        // the lines' own cells are marked
        expect(within(dialog).getByLabelText("Description 1")).toHaveAttribute("aria-invalid", "true");
        expect(within(dialog).getByLabelText("Waste % 2")).toHaveAttribute("aria-invalid", "true");

        await userEvent.type(within(dialog).getByLabelText("Code 1"), "x");
        expect(within(dialog).queryByText("Line 1: The API wants a better description.")).not.toBeInTheDocument();
        expect(within(dialog).queryByText("The title is already used.")).not.toBeInTheDocument();
    });

    it("asks before dropping what was typed", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        const dialog = await open(32, "BQ-2026-002");
        await userEvent.type(within(dialog).getByLabelText("Code 1"), "x");
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(confirm).toHaveBeenCalledWith("Discard the changes made since the last save?");
        expect(screen.getByRole("dialog", { name: "BQ-2026-002" })).toBeInTheDocument();
        confirm.mockReturnValue(true);
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "BQ-2026-002" })).not.toBeInTheDocument());
    });

    it("keeps what needs the saved BOQ for after the save", async () => {
        const dialog = await open(32, "BQ-2026-002", karim, listOf(boqs.unagreed));
        const agree = within(dialog).getByRole("button", { name: "Agree" });
        await waitFor(() => expect(agree).toBeEnabled());
        await userEvent.type(within(dialog).getByLabelText("Code 1"), "x");
        for (const button of [agree, within(dialog).getByRole("button", { name: "Send…" })]) {
            expect(button).toBeDisabled();
            expect(button).toHaveAttribute("title", "Save your changes first.");
        }
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        expect(await screen.findByRole("button", { name: "Duplicate" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Copy lines from…" })).toBeDisabled();
    });

    it("keeps an empty BOQ from being sent or agreed", async () => {
        const empty = { ...boqs.draftB, lines: [], lineCount: 0, subtotalUsd: 0, totalUsd: 0, supervisionUsd: 0, clientTotalUsd: 0 };
        const dialog = await open(32, "BQ-2026-002", karim, http.get("/api/boqs/32", () => HttpResponse.json(empty)), listOf(boqs.unagreed));
        expect(await within(dialog).findByText("No lines yet. Add the first one.")).toBeInTheDocument();
        for (const name of ["Send…", "Agree"]) {
            expect(within(dialog).getByRole("button", { name })).toBeDisabled();
            expect(within(dialog).getByRole("button", { name })).toHaveAttribute("title", "Add lines and save first.");
        }
    });

    it("says so when the BOQ can't be loaded", async () => {
        renderApp(`${path}?boq=999`, karim, ...siteHandlers);
        expect(await screen.findByText(/Couldn't load the BOQ\./)).toBeInTheDocument();
        expect(screen.getByText(/That BOQ doesn't exist\./)).toBeInTheDocument();
    });
});

describe("what is done with a BOQ", () => {
    it("duplicates one into a new draft and opens it", async () => {
        const duplicated: string[] = [];
        const copy = { ...boqs.draftB, id: 33, number: "BQ-2026-003", title: "Lobby works, option B (copy)" };
        const dialog = await open(32, "BQ-2026-002", karim,
            http.post("/api/boqs/:id/duplicate", ({ params }) => { duplicated.push(String(params.id)); return HttpResponse.json(copy); }),
            http.get("/api/boqs/33", () => HttpResponse.json(copy)));
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
        expect(await screen.findByRole("dialog", { name: "BQ-2026-003" })).toBeInTheDocument();
        expect(duplicated).toEqual(["32"]);
    });

    it("deletes a draft after asking", async () => {
        const deleted: string[] = [];
        const dialog = await open(32, "BQ-2026-002", karim, http.delete("/api/boqs/:id", ({ params }) => { deleted.push(String(params.id)); return new HttpResponse(null, { status: 204 }); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
        const confirm = await screen.findByRole("dialog", { name: "Delete BQ-2026-002?" });
        await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
        expect(deleted).toEqual([]);
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
        await userEvent.click(within(await screen.findByRole("dialog", { name: "Delete BQ-2026-002?" })).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(deleted).toEqual(["32"]));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("copies the chosen lines of another BOQ into a draft", async () => {
        const copied: unknown[] = [];
        const added = [
            { id: 205, position: 4, code: "1.1", description: "Demolition", quantity: 100, wasteRate: 0.05, finalQuantity: 105, unit: "m²", rate: 20, totalUsd: 2100 },
            { id: 206, position: 5, code: "3.1", description: "Electrical first fix", quantity: 1, wasteRate: 0, finalQuantity: 1, unit: "lot", rate: 8460, totalUsd: 8460 },
        ];
        const memory = remembered(32, boqs.draftB);
        const dialog = await open(32, "BQ-2026-002", karim, memory.read,
            http.post("/api/boqs/:id/copy-lines", async ({ request }) => { copied.push(await request.json()); return memory.becomes({ ...boqs.draftB, lines: [...boqs.draftB.lines, ...added], lineCount: 5 }); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Copy lines from…" }));
        const copy = await screen.findByRole("dialog", { name: "Copy lines" });
        await userEvent.click(within(copy).getByLabelText("Copy from"));
        await userEvent.click(screen.getByRole("option", { name: /Karim's quantities/ }));
        await userEvent.click(await within(copy).findByLabelText("Line 2: Porcelain tiles"));
        expect(within(copy).getByText("2 of 3 lines chosen")).toBeInTheDocument();
        await userEvent.click(within(copy).getByRole("button", { name: "Copy 2 lines" }));
        await waitFor(() => expect(copied).toEqual([{ fromBoqId: 51, lineIds: [401, 403] }]));
        // they join the draft, which shows them as the API saved them
        expect(await within(dialog).findByLabelText("Description 5")).toHaveValue("Electrical first fix");
        expect(screen.queryByRole("dialog", { name: "Copy lines" })).not.toBeInTheDocument();
    });

    it("copies every line when none is left out", async () => {
        const copied: unknown[] = [];
        const dialog = await open(32, "BQ-2026-002", karim,
            http.post("/api/boqs/:id/copy-lines", async ({ request }) => { copied.push(await request.json()); return HttpResponse.json(boqs.draftB); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Copy lines from…" }));
        const copy = await screen.findByRole("dialog", { name: "Copy lines" });
        await userEvent.click(within(copy).getByLabelText("Copy from"));
        await userEvent.click(screen.getByRole("option", { name: /VO-2026-001/ }));
        await userEvent.click(await within(copy).findByRole("button", { name: "Copy 1 line" }));
        await waitFor(() => expect(copied).toEqual([{ fromBoqId: 41 }]));
    });

    it("downloads the PDF of a client BOQ", async () => {
        URL.createObjectURL = vi.fn(() => "blob:boq");
        URL.revokeObjectURL = vi.fn();
        const asked: string[] = [];
        const dialog = await open(31, "BQ-2026-001", karim,
            http.get("/api/boqs/:id/pdf", ({ params }) => { asked.push(String(params.id)); return new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } }); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "More actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
        await waitFor(() => expect(asked).toEqual(["31"]));
        expect(URL.createObjectURL).toHaveBeenCalled();
    });
});

describe("sending a BOQ to the client", () => {
    const send = async (...handlers: RequestHandler[]) => {
        const dialog = await open(31, "BQ-2026-001", karim, ...handlers);
        await userEvent.click(within(dialog).getByRole("button", { name: "Send…" }));
        const sending = await screen.findByRole("dialog", { name: "Send BQ-2026-001" });
        // the client's own address comes with the client
        await waitFor(() => expect(within(sending).getByLabelText("Send it to")).toHaveValue("mounir.aoun@mail.test"));
        return sending;
    };

    it("emails the PDF to the client, with a note", async () => {
        const sent: unknown[] = [];
        const dialog = await send(http.post("/api/boqs/:id/email", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(boqs.agreed); }));
        // the client's own address is there to begin with
        expect(within(dialog).getByLabelText("Send it to")).toHaveValue("mounir.aoun@mail.test");
        await userEvent.type(within(dialog).getByLabelText(/^Note/), "Please review");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        await waitFor(() => expect(sent).toEqual([{ to: "mounir.aoun@mail.test", note: "Please review" }]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Send BQ-2026-001" })).not.toBeInTheDocument());
    });

    it("checks the address as it is typed", async () => {
        const sent: unknown[] = [];
        const dialog = await send(http.post("/api/boqs/:id/email", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(boqs.agreed); }));
        const to = within(dialog).getByLabelText("Send it to");
        await userEvent.clear(to);
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        expect(within(dialog).getByText("Enter the email address to send it to.")).toBeInTheDocument();
        await userEvent.type(to, "fadi");
        expect(within(dialog).getByText("Enter an email like name@company.com.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        expect(sent).toEqual([]);
    });

    it("says plainly when the email can't be sent, and records nothing", async () => {
        const dialog = await send(http.post("/api/boqs/:id/email", () => refusal(503, "email_delivery_failed")));
        await userEvent.click(within(dialog).getByRole("button", { name: "Send email" }));
        expect(await within(dialog).findByText("The email couldn't be sent, so nothing was recorded as sent. Try again, or download the PDF and send it yourself.")).toBeInTheDocument();
        expect(screen.getByRole("dialog", { name: "Send BQ-2026-001" })).toBeInTheDocument();
    });

    it("records a WhatsApp delivery and opens the chat", async () => {
        const chat = { location: { href: "" }, opener: {}, close: vi.fn() };
        vi.spyOn(window, "open").mockReturnValue(chat as unknown as Window);
        const recorded: unknown[] = [];
        const dialog = await send(http.post("/api/boqs/:id/deliveries", async ({ request }) => { recorded.push(await request.json()); return HttpResponse.json(boqs.agreed); }));
        await userEvent.click(within(dialog).getByRole("tab", { name: "WhatsApp" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Open WhatsApp" }));
        await waitFor(() => expect(recorded).toEqual([{ channel: "whatsapp", recipient: "+961 71 222 333" }]));
        await waitFor(() => expect(chat.location.href).toContain("https://wa.me/96171222333?text="));
    });

    it("records a downloaded PDF as sent", async () => {
        URL.createObjectURL = vi.fn(() => "blob:boq");
        URL.revokeObjectURL = vi.fn();
        const calls: string[] = [];
        const dialog = await send(
            http.post("/api/boqs/:id/deliveries", async ({ request }) => { calls.push(JSON.stringify(await request.json())); return HttpResponse.json(boqs.agreed); }),
            http.get("/api/boqs/:id/pdf", () => { calls.push("pdf"); return new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } }); }));
        await userEvent.click(within(dialog).getByRole("tab", { name: "PDF" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
        await waitFor(() => expect(calls).toEqual([JSON.stringify({ channel: "download" }), "pdf"]));
    });
});

describe("agreeing a BOQ", () => {
    // only a lower price is held to the profit floor: a VO that takes money off, or an agreement withdrawn
    const lowering = { ...boqs.vo, totalUsd: -2000, subtotalUsd: -2000, supervisionUsd: -200, clientTotalUsd: -2200 };
    const nowAgreed = { ...boqs.draftB, status: "agreed" as const, agreedAt: "2026-10-06T09:00:00Z", agreedBy: { id: 1, name: "Rana Test" } };

    it("asks first, naming the BOQ and its total, and then agrees it", async () => {
        const agreed: string[] = [];
        const memory = remembered(32, boqs.draftB);
        const dialog = await open(32, "BQ-2026-002", karim, memory.read, listOf(boqs.unagreed),
            http.post("/api/boqs/:id/agree", ({ params }) => { agreed.push(String(params.id)); return memory.becomes(nowAgreed); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Agree" }));
        const confirm = await screen.findByRole("dialog", { name: "Agree BQ-2026-002" });
        for (const text of ["BQ-2026-002", "Lobby works, option B", "$17,000", "$18,700"]) expect(confirm).toHaveTextContent(text);
        await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
        expect(agreed).toEqual([]);

        await userEvent.click(within(dialog).getByRole("button", { name: "Agree" }));
        await userEvent.click(within(await screen.findByRole("dialog", { name: "Agree BQ-2026-002" })).getByRole("button", { name: "Agree" }));
        await waitFor(() => expect(agreed).toEqual(["32"]));
        // it is locked from then on
        expect(await within(dialog).findByText(/Agreed on Oct 6, 2026 by Rana Test/)).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Description 1")).toBeDisabled();
        expect(within(dialog).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });

    it("keeps a second client BOQ from being agreed, and a VO from being agreed first", async () => {
        const second = await open(32, "BQ-2026-002");
        const agree = within(second).getByRole("button", { name: "Agree" });
        await waitFor(() => expect(agree).toBeDisabled());
        expect(agree).toHaveAttribute("title", "Another client BOQ is already agreed.");
    });

    it("keeps a VO from being agreed before the client BOQ is", async () => {
        const dialog = await open(41, "VO-2026-001", karim, listOf(boqs.unagreed));
        const agree = within(dialog).getByRole("button", { name: "Agree" });
        await waitFor(() => expect(agree).toBeDisabled());
        expect(agree).toHaveAttribute("title", "A VO can be agreed once the client BOQ is.");
    });

    const change = (over: object = {}) => ({
        id: 9, projectId: site.project.id, projectTitle: site.project.title, domain: "execution", kind: "boq_agree",
        summary: "Agreeing VO-2026-001", status: "pending", requestedBy: { id: 3, name: "Karim Test" },
        requestedAt: "2026-10-28T09:00:00Z", decidedBy: null, decidedAt: null, profitNow: 600, ...over,
    });
    const floor = (calls: string[]) => [
        http.get("/api/blocked-changes/:id", () => HttpResponse.json(change())),
        http.post("/api/blocked-changes/:id/force", ({ params }) => { calls.push(`force ${String(params.id)}`); return HttpResponse.json(change({ status: "forced" })); }),
    ];
    const floorRefusal = () => HttpResponse.json({
        type: "business_rule", code: "profit_floor", blockedChangeId: 9, errors: null, traceId: "t",
        message: "This would take the project's profit to zero or below, so it wasn't saved. Whoever sees the project's money was asked to look.",
    }, { status: 422 });

    it("says a VO that lowers the price comes off the work price", async () => {
        const dialog = await open(41, "VO-2026-001", karim, http.get("/api/boqs/41", () => HttpResponse.json(lowering)));
        await userEvent.click(await within(dialog).findByRole("button", { name: "Agree" }));
        const confirm = await screen.findByRole("dialog", { name: "Agree VO-2026-001" });
        expect(confirm).toHaveTextContent("Its total comes off the site's work price");
        expect(confirm).toHaveTextContent(money.exact(-2000, "USD", { cents: true }));
    });

    it("opens the usual force-it flow when the profit floor refuses a VO that lowers the price", async () => {
        const calls: string[] = [];
        const dialog = await open(41, "VO-2026-001", karim, http.get("/api/boqs/41", () => HttpResponse.json(lowering)),
            http.post("/api/boqs/:id/agree", () => { calls.push("agree"); return floorRefusal(); }), ...floor(calls));
        await userEvent.click(await within(dialog).findByRole("button", { name: "Agree" }));
        const confirm = await screen.findByRole("dialog", { name: "Agree VO-2026-001" });
        await userEvent.click(within(confirm).getByRole("button", { name: "Agree" }));
        await userEvent.click(await within(confirm).findByRole("button", { name: "Force it" }));
        expect(within(confirm).getByText("Save it anyway, at zero profit or below?")).toBeInTheDocument();
        await userEvent.click(within(confirm).getByRole("button", { name: "Force" }));
        await waitFor(() => expect(calls).toEqual(["agree", "force 9"]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Agree VO-2026-001" })).not.toBeInTheDocument());
    });

    it("says in words when a VO would take the work price below zero", async () => {
        const dialog = await open(41, "VO-2026-001", karim, http.post("/api/boqs/:id/agree", () => refusal(422, "boq_price_below_zero")));
        await userEvent.click(await within(dialog).findByRole("button", { name: "Agree" }));
        const confirm = await screen.findByRole("dialog", { name: "Agree VO-2026-001" });
        await userEvent.click(within(confirm).getByRole("button", { name: "Agree" }));
        expect(await within(confirm).findByText("Agreeing or withdrawing this VO would take the site's work price below zero.")).toBeInTheDocument();
    });

    it("tells someone who can't see the money only that it was refused", async () => {
        // pricing without money: they reach a BOQ by its link, and may not see what it would do to the profit
        const pricer = withPermissions(personas.executionAdmin, { grant: [P.PROJECT_PRICING_MANAGE] });
        const dialog = await open(41, "VO-2026-001", pricer, http.get("/api/boqs/41", () => HttpResponse.json(lowering)), http.post("/api/boqs/:id/agree", () => floorRefusal()));
        await userEvent.click(await within(dialog).findByRole("button", { name: "Agree" }));
        const confirm = await screen.findByRole("dialog", { name: "Agree VO-2026-001" });
        await userEvent.click(within(confirm).getByRole("button", { name: "Agree" }));
        expect(await within(confirm).findByText(/This would take the project's profit to zero or below, so it wasn't saved\./)).toBeInTheDocument();
        expect(within(confirm).queryByRole("button", { name: "Force it" })).not.toBeInTheDocument();
    });

    it("opens a change the profit floor stopped, from its notification, to dismiss it or force it through", async () => {
        const calls: string[] = [];
        renderApp(`${path}?blocked=9`, karim,
            http.get("/api/blocked-changes/:id", () => HttpResponse.json(change({ kind: "boq_withdraw", summary: "Withdrawing the agreement of BQ-2026-001: The client changed the scope" }))),
            http.post("/api/blocked-changes/:id/dismiss", ({ params }) => { calls.push(`dismiss ${String(params.id)}`); return HttpResponse.json(change({ status: "dismissed" })); }),
            ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "A change was stopped" });
        expect(await within(dialog).findByText("Withdrawing the agreement of BQ-2026-001: The client changed the scope")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
        await waitFor(() => expect(calls).toEqual(["dismiss 9"]));
    });

    it("withdraws an agreement only with a reason, and then the BOQ is a draft again", async () => {
        const withdrawn: unknown[] = [];
        const draft = { ...boqs.agreed, status: "draft" as const, agreedAt: null, agreedBy: null };
        const memory = remembered(31, boqs.agreed);
        const dialog = await open(31, "BQ-2026-001", karim, memory.read,
            http.post("/api/boqs/:id/withdraw-agreement", async ({ request }) => { withdrawn.push(await request.json()); return memory.becomes(draft); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw agreement" }));
        const confirm = await screen.findByRole("dialog", { name: "Withdraw the agreement of BQ-2026-001" });
        expect(confirm).toHaveTextContent("$17,000");
        await userEvent.click(within(confirm).getByRole("button", { name: "Withdraw agreement" }));
        expect(within(confirm).getByText("Say why the agreement is withdrawn.")).toBeInTheDocument();
        expect(withdrawn).toEqual([]);

        await userEvent.type(within(confirm).getByLabelText("Why is it withdrawn?"), "The client changed the scope");
        expect(within(confirm).queryByText("Say why the agreement is withdrawn.")).not.toBeInTheDocument();
        await userEvent.click(within(confirm).getByRole("button", { name: "Withdraw agreement" }));
        await waitFor(() => expect(withdrawn).toEqual([{ reason: "The client changed the scope" }]));
        expect(await within(dialog).findByRole("button", { name: "Save" })).toBeEnabled();
        expect(within(dialog).queryByText(/Agreed on/)).not.toBeInTheDocument();
    });

    it("keeps the client BOQ's agreement while an agreed VO stands on it", async () => {
        const withAgreedVo = { ...boqs.list, vos: [{ ...boqs.list.vos[0], status: "agreed" as const }] };
        const dialog = await open(31, "BQ-2026-001", karim, listOf(withAgreedVo));
        const withdraw = within(dialog).getByRole("button", { name: "Withdraw agreement" });
        await waitFor(() => expect(withdraw).toBeDisabled());
        expect(withdraw).toHaveAttribute("title", "Withdraw the agreed VOs first.");
    });

    it("opens the force-it flow when the profit floor refuses a withdrawal", async () => {
        const calls: string[] = [];
        const dialog = await open(31, "BQ-2026-001", karim,
            http.post("/api/boqs/:id/withdraw-agreement", () => { calls.push("withdraw"); return floorRefusal(); }),
            http.get("/api/blocked-changes/:id", () => HttpResponse.json(change({ kind: "boq_withdraw" }))),
            http.post("/api/blocked-changes/:id/force", ({ params }) => { calls.push(`force ${String(params.id)}`); return HttpResponse.json(change({ status: "forced" })); }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw agreement" }));
        const confirm = await screen.findByRole("dialog", { name: "Withdraw the agreement of BQ-2026-001" });
        await userEvent.type(within(confirm).getByLabelText("Why is it withdrawn?"), "The client changed the scope");
        await userEvent.click(within(confirm).getByRole("button", { name: "Withdraw agreement" }));
        await userEvent.click(await within(confirm).findByRole("button", { name: "Force it" }));
        await userEvent.click(within(confirm).getByRole("button", { name: "Force" }));
        await waitFor(() => expect(calls).toEqual(["withdraw", "force 9"]));
    });

    it("says in words when the API refuses an agreement", async () => {
        const dialog = await open(32, "BQ-2026-002", karim, listOf(boqs.unagreed), http.post("/api/boqs/:id/agree", () => refusal(422, "boq_already_agreed")));
        await userEvent.click(within(dialog).getByRole("button", { name: "Agree" }));
        const confirm = await screen.findByRole("dialog", { name: "Agree BQ-2026-002" });
        await userEvent.click(within(confirm).getByRole("button", { name: "Agree" }));
        expect(await within(confirm).findByText("Another client BOQ is already agreed on this site. Withdraw its agreement first to agree this one.")).toBeInTheDocument();
    });
});

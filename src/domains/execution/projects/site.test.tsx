import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const karim = personas.executionAdmin;
const project = site.project;
const m = project.money!;
const path = `/execution/projects/${project.id}`;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const moneyPanel = async () => (await screen.findByText("Project money")).closest(".panel") as HTMLElement;

describe("an Execution site's overview", () => {
    it("shows its progress, materials and labour, and what the client paid against what it cost", async () => {
        renderApp(path, karim, ...siteHandlers);
        const kpis = (await screen.findByText("Ground labour", { selector: ".kpi-label" })).closest(".kpis") as HTMLElement;
        expect(await within(kpis).findByText("4 weeks reported")).toBeInTheDocument();
        expect(within(kpis).getByText("1 / 3")).toBeInTheDocument();
        expect(within(kpis).getByText(money.short(site.materials.all.cost))).toBeInTheDocument();
        expect(within(kpis).getByText("4 records")).toBeInTheDocument();
        expect(within(kpis).getByText("Client owes")).toBeInTheDocument();

        const panel = await moneyPanel();
        expect(within(panel).getByText(money.exact(m.billing.received), { selector: ".kpi-val" })).toBeInTheDocument();
        expect(await within(panel).findByText(`1 payment · ${money.short(10000)} up front`)).toBeInTheDocument();
        expect(within(panel).getByText(money.exact(m.cashProfit!), { selector: ".kpi-val span" })).toHaveClass("up");
        expect(within(panel).getByText("Client still owes")).toBeInTheDocument();
        expect(within(panel).getByText(`+${money.exact(m.projectFee!)}`)).toBeInTheDocument();
        expect(within(panel).getByText(/Default material profit on new materials:/)).toHaveTextContent("15%");

        const health = (await screen.findByText("Ground labour and profit")).closest(".panel") as HTMLElement;
        expect(await within(health).findByText("Thu, Oct 8")).toBeInTheDocument();
        expect(within(health).getByText(/≈ 7 working days of ground labour at 6 workers/)).toBeInTheDocument();
        expect(screen.getByText(/Payments can be recorded without an invoice/)).toBeInTheDocument();
    });

    it("searches and filters the material margins", async () => {
        renderApp(path, karim, ...siteHandlers);
        const margins = (await screen.findByText("Material margins")).closest(".panel") as HTMLElement;
        await within(margins).findByText("Paint");
        const rows = () => within(margins).getAllByRole("row").filter((r) => r.closest("tbody"));
        expect(rows()).toHaveLength(4);

        await userEvent.type(within(margins).getByLabelText("Search material margins"), "paint");
        expect(rows()).toHaveLength(1);
        expect(within(margins).getByText("1 of 4 shown")).toBeInTheDocument();
        expect(within(margins).getByText("The materials shown")).toBeInTheDocument();

        await userEvent.click(within(margins).getByRole("button", { name: "Clear" }));
        await userEvent.click(within(margins).getByRole("button", { name: "Not sent" }));
        // every lobby material went on a statement
        expect(within(margins).getByText("No materials match these filters.")).toBeInTheDocument();
        await userEvent.click(within(margins).getByRole("button", { name: "Sent" }));
        expect(rows()).toHaveLength(4);
    });

    it("shows each material's margin, and that the lobby's were all sent to the client", async () => {
        renderApp(path, karim, ...siteHandlers);
        const margins = (await screen.findByText("Material margins")).closest(".panel") as HTMLElement;
        const paint = (await within(margins).findByText("Paint")).closest("tr") as HTMLElement;
        expect(paint).toHaveTextContent(money.exact(840));
        expect(paint).toHaveTextContent(money.exact(966));
        expect(paint).toHaveTextContent(`+${money.exact(126)}`);
        expect(paint).toHaveTextContent("15%");
        expect(paint).toHaveTextContent("Sent Sep 30");
        expect(within(margins).getByText("Sent to the client").closest("tr")).toHaveTextContent("4 of 4 · counted in revenue");
        expect(within(margins).getByRole("columnheader", { name: "Profit" })).toBeInTheDocument();
        // it sits under the materials table
        const materials = screen.getByText("Materials", { selector: ".panel-title" }).closest(".panel") as HTMLElement;
        expect(materials.compareDocumentPosition(margins) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(await moneyPanel()).queryByText("Not sent yet")).not.toBeInTheDocument();
    });

    it("counts materials not sent yet apart, and won't complete the site until they are", async () => {
        const loft = site.losingProject;
        renderApp(`/execution/projects/${loft.id}?complete=1`, karim, ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: `Close ${loft.title}` });
        expect(within(dialog).getByText("4 materials haven't been sent to the client.")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Complete project" })).toBeDisabled();
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        const owed = (await within(await moneyPanel()).findByText("Not sent yet")).closest("div") as HTMLElement;
        expect(owed).toHaveTextContent(money.exact(loft.money!.unsentMaterialCharge!));
        expect(owed).toHaveTextContent("4 materials at client prices - a statement adds them");
        const margins = (await screen.findByText("Material margins")).closest(".panel") as HTMLElement;
        expect(await within(margins).findAllByText("Not yet")).toHaveLength(4);
    });

    it("says so when the site is losing money", async () => {
        renderApp(`/execution/projects/${site.losingProject.id}`, karim, ...siteHandlers);
        const health = (await screen.findByText("Ground labour and profit")).closest(".panel") as HTMLElement;
        expect(await within(health).findByText("Used up")).toBeInTheDocument();
        expect(within(health).getByText(`Losing money: ${money.exact(-site.losingProject.money!.cashProfit!)} below zero.`)).toBeInTheDocument();
        expect(within(await moneyPanel()).getByText(money.exact(site.losingProject.money!.cashProfit!), { selector: ".kpi-val span" })).toHaveClass("down");
    });

    it("keeps every figure of money from people without financial:view, and never asks for them", async () => {
        const asked: string[] = [];
        renderApp(path, withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/projects/:id/site-money/timeline", () => { asked.push("timeline"); return HttpResponse.json(site.timeline); }),
            http.get("/api/payments", () => { asked.push("payments"); return HttpResponse.json(site.payments); }),
            ...siteHandlers);
        expect(await screen.findByText("4 weeks reported", { selector: ".kpi-delta span" })).toBeInTheDocument();
        expect(screen.queryByText("Client owes")).not.toBeInTheDocument();
        expect(screen.queryByText("Project money")).not.toBeInTheDocument();
        expect(screen.queryByText("Client payments")).not.toBeInTheDocument();
        expect(screen.queryByText("Ground labour and profit")).not.toBeInTheDocument();
        expect(screen.queryByText(/Received/)).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("shows an internal site's spending, with no client money", async () => {
        const internal = { ...project, billingType: "internal", client: null };
        renderApp(path, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(internal)), ...siteHandlers);
        const panel = (await screen.findByText("Internal project")).closest(".panel") as HTMLElement;
        expect(within(panel).getByText(money.exact(m.cost.total))).toBeInTheDocument();
        expect(screen.queryByText("Client payments")).not.toBeInTheDocument();
        expect(screen.queryByText("Ground labour and profit")).not.toBeInTheDocument();
    });

    it("lists the site's money actions in the menu", async () => {
        renderApp(path, karim, ...siteHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
        const menu = screen.getByRole("button", { name: "Put on hold" }).closest(".pop") as HTMLElement;
        for (const name of ["Add project expense", "Fee & material profit", "New invoice", "Record a client payment"]) {
            expect(within(menu).getByRole("button", { name })).toBeInTheDocument();
        }
    });

    it("takes a payment on account even before anything is invoiced", async () => {
        renderApp(`/execution/projects/${site.losingProject.id}`, karim,
            http.get("/api/invoices", () => HttpResponse.json({ items: [], page: 1, pageSize: 100, totalCount: 0 })),
            http.get("/api/exchange-rates", () => HttpResponse.json([])),
            ...siteHandlers);
        const band = (await screen.findByText("Client payments")).closest(".panel") as HTMLElement;
        const record = within(band).getByRole("button", { name: "Record payment" });
        expect(record).toBeEnabled();
        await userEvent.click(record);
        expect(await screen.findByRole("dialog", { name: "Record a client payment" })).toBeInTheDocument();
    });
});

describe("the fee and material profit", () => {
    it("are saved together, re-pricing what follows the markup", async () => {
        const saved: unknown[] = [];
        renderApp(`/execution/projects/${site.losingProject.id}`, karim,
            http.put("/api/projects/:id/pricing", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(site.losingProject); }),
            ...siteHandlers);
        await userEvent.click(within(await moneyPanel()).getByRole("button", { name: "Fee & material profit" }));
        const dialog = await screen.findByRole("dialog", { name: "Fee & material profit" });
        await userEvent.click(within(dialog).getByRole("button", { name: "25%" }));
        expect(await within(dialog).findByText("Re-prices the 4 materials on the default material profit.")).toBeInTheDocument();
        const fee = within(dialog).getByLabelText("Project fee");
        await userEvent.clear(fee);
        await userEvent.type(fee, "8500.50");
        expect(fee).toHaveValue("8500.50");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saved).toEqual([{ projectFee: 8500.5, materialMarkup: 0.25 }]));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("say which materials keep their price", async () => {
        renderApp(`${path}?money=pricing`, karim, ...siteHandlers);
        const dialog = await screen.findByRole("dialog", { name: "Fee & material profit" });
        await userEvent.click(within(dialog).getByRole("button", { name: "25%" }));
        expect(await within(dialog).findByText("Applies to materials added from now on: the 4 already on a client statement keep their price.")).toBeInTheDocument();
    });

    it("can't be changed without project:pricing_manage, even from a link", async () => {
        renderApp(`${path}?money=pricing`, withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }), ...siteHandlers);
        const panel = await moneyPanel();
        expect(within(panel).queryByRole("button", { name: "Fee & material profit" })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "More actions" }));
        const menu = screen.getByRole("button", { name: "Put on hold" }).closest(".pop") as HTMLElement;
        expect(within(menu).queryByRole("button", { name: "Fee & material profit" })).not.toBeInTheDocument();
    });

    it("are locked once the site is finalised", async () => {
        const locked = { ...project, money: { ...m, isLocked: true } };
        renderApp(path, karim, http.get(`/api/projects/${project.id}`, () => HttpResponse.json(locked)), ...siteHandlers);
        const panel = await moneyPanel();
        expect(within(panel).queryByRole("button", { name: "Fee & material profit" })).not.toBeInTheDocument();
    });
});

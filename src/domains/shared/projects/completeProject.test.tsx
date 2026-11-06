import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { money } from "@/shared/format/money";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// admins don't hold the money by default: a super admin hands it over
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const nadia = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** The Mar Mikhael loft (10% supervision, no TVA) with this much paid beyond its client total, so nothing owed. */
const loftPaidAhead = (paidAhead: number) => {
    const loft = site.losingProject;
    const m = loft.money!;
    return { ...loft, money: { ...m, billing: { ...m.billing, paidAhead, owed: 0 } } };
};
/** The Design project with this much paid beyond its payment, so nothing owed. */
const designPaidAhead = (paidAhead: number) => {
    const m = fixtures.project.money!;
    return { ...fixtures.project, money: { ...m, billing: { ...m.billing, paidAhead, owed: 0 } } };
};

const loftPath = (id: number) => `/execution/projects/${id}?complete=1`;
const closing = (title: string) => screen.findByRole("dialog", { name: `Close ${title}` });
const keepSwitch = (dialog: HTMLElement) => within(dialog).getByRole("switch", { name: "Keep what the client paid beyond the price" });

describe("closing a site the client has paid ahead", () => {
    it("offers to keep what was paid beyond the price, on by default, and counts it in the profit", async () => {
        const loft = loftPaidAhead(1000);
        renderApp(loftPath(loft.id), karim, http.get("/api/projects/:id", () => HttpResponse.json(loft)), ...siteHandlers);
        const dialog = await closing(loft.title);
        expect(keepSwitch(dialog)).toHaveAttribute("aria-checked", "true");
        expect(within(dialog).getByText(`The client paid ${money.fmt(1000)} beyond the agreed price.`)).toBeInTheDocument();
        expect(within(dialog).getByText(/a closing VO raises the price to what was received/)).toBeInTheDocument();
        // 10% supervision and no TVA: the $1,000 is all revenue (work price and supervision), so the profit rises by it
        const m = loft.money!;
        expect(within(dialog).getByText(`Final profit ${money.fmt(m.profit + 1000)} · ${money.pct((m.profit + 1000) / (m.revenue + 1000))}`)).toBeInTheDocument();
        expect(within(dialog).getByText(`${money.fmt(m.revenue + 1000)}, the work price and supervision,`, { exact: false })).toBeInTheDocument();
    });

    it("leaves the profit as it is when the switch is turned off, and says it stays owed back", async () => {
        const loft = loftPaidAhead(1000);
        renderApp(loftPath(loft.id), karim, http.get("/api/projects/:id", () => HttpResponse.json(loft)), ...siteHandlers);
        const dialog = await closing(loft.title);
        await userEvent.click(keepSwitch(dialog));
        expect(keepSwitch(dialog)).toHaveAttribute("aria-checked", "false");
        expect(within(dialog).getByText(/It stays a balance owed back to the client and doesn't count in the profit\./)).toBeInTheDocument();
        const m = loft.money!;
        expect(within(dialog).getByText(`Final profit ${money.fmt(m.profit)} · ${money.pct(m.margin)}`)).toBeInTheDocument();
    });

    it("sends keepPaidAhead true when it is kept and false when it is not", async () => {
        const loft = loftPaidAhead(1000);
        const bodies: unknown[] = [];
        renderApp(loftPath(loft.id), karim,
            http.post("/api/projects/:id/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...loft, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            http.get("/api/projects/:id", () => HttpResponse.json(loft)), ...siteHandlers);
        const dialog = await closing(loft.title);
        await userEvent.click(within(dialog).getByRole("button", { name: "Complete project" }));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: true }]));
    });

    it("sends false when the switch was turned off", async () => {
        const loft = loftPaidAhead(1000);
        const bodies: unknown[] = [];
        renderApp(loftPath(loft.id), karim,
            http.post("/api/projects/:id/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...loft, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            http.get("/api/projects/:id", () => HttpResponse.json(loft)), ...siteHandlers);
        const dialog = await closing(loft.title);
        await userEvent.click(keepSwitch(dialog));
        await userEvent.click(within(dialog).getByRole("button", { name: "Complete project" }));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: false }]));
    });

    it("has no switch when nothing was paid beyond the price, and keeps nothing", async () => {
        // paid exactly what is agreed
        const loft = loftPaidAhead(0);
        const bodies: unknown[] = [];
        renderApp(loftPath(loft.id), karim,
            http.post("/api/projects/:id/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...loft, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            http.get("/api/projects/:id", () => HttpResponse.json(loft)), ...siteHandlers);
        const dialog = await closing(loft.title);
        expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
        expect(within(dialog).queryByText(/beyond the agreed price/)).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Complete project" }));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: false }]));
    });

    it("has no switch, and no profit, for someone without financial:view", async () => {
        const loft = loftPaidAhead(1000);
        renderApp(loftPath(loft.id), withPermissions(karim, { revoke: [P.FINANCIAL_VIEW] }), http.get("/api/projects/:id", () => HttpResponse.json(loft)), ...siteHandlers);
        const dialog = await closing(loft.title);
        expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
        expect(within(dialog).queryByText(/Final profit/)).not.toBeInTheDocument();
    });
});

describe("closing a project whose client still owes", () => {
    const settleChoice = (dialog: HTMLElement) => within(dialog).getByRole("radiogroup", { name: "What becomes of what the client still owes" });
    const complete = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Complete project" });

    it("asks a site's money manager to excuse or write off all of it, and closes only once one is chosen", async () => {
        // the loft: $3,800 still owed, 10% supervision and no TVA
        const loft = site.losingProject;
        const m = loft.money!;
        const bodies: unknown[] = [];
        renderApp(loftPath(loft.id), karim,
            http.post("/api/projects/:id/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...loft, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            ...siteHandlers);
        const dialog = await closing(loft.title);
        expect(within(dialog).getByText(`The client still owes ${money.fmt(m.billing.owed)}.`)).toBeInTheDocument();
        expect(complete(dialog)).toBeDisabled();
        expect(complete(dialog)).toHaveAttribute("title", "Say what becomes of what the client still owes first.");

        await userEvent.click(within(settleChoice(dialog)).getByRole("radio", { name: /Excuse it/ }));
        // the price drops to what was received: with no TVA all of it comes off the revenue and the profit
        const profit = m.profit - m.billing.owed;
        expect(within(dialog).getByText(`Final profit ${money.fmt(profit)} · ${money.pct(profit / (m.revenue - m.billing.owed))}`)).toBeInTheDocument();
        await userEvent.click(complete(dialog));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: false, settleOwed: "excused" }]));
    });

    it("writes off what a Design client never paid, lowering the payment", async () => {
        const design = fixtures.project;
        const m = design.money!;
        const bodies: unknown[] = [];
        renderApp("/design/projects/1?complete=1", nadia,
            http.post("/api/projects/1/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...design, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            ...projectHandlers);
        const dialog = await closing(design.title);
        await userEvent.click(within(settleChoice(dialog)).getByRole("radio", { name: /Write it off/ }));
        const profit = m.profit - m.billing.owed;
        expect(within(dialog).getByText(`Final profit ${money.fmt(profit)} · ${money.pct(profit / (m.revenue - m.billing.owed))}`)).toBeInTheDocument();
        await userEvent.click(complete(dialog));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: false, settleOwed: "written_off" }]));
    });

    it("only says it stays owed to someone who sees the money but doesn't change it", async () => {
        const loft = site.losingProject;
        const bodies: unknown[] = [];
        renderApp(loftPath(loft.id), withPermissions(karim, { revoke: [P.PROJECT_PRICING_MANAGE] }),
            http.post("/api/projects/:id/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...loft, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            ...siteHandlers);
        const dialog = await closing(loft.title);
        expect(within(dialog).getByText(/It stays owed once the project is closed\./)).toBeInTheDocument();
        expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
        await userEvent.click(complete(dialog));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: false }]));
    });

    it("shows on the project what was excused when it was completed", async () => {
        const m = fixtures.project.money!;
        const closed = { ...fixtures.project, status: "completed", money: { ...m, isLocked: true, settledOwedUsd: 1500, settledOwedAs: "excused" } };
        renderApp("/design/projects/1", nadia, http.get("/api/projects/1", () => HttpResponse.json(closed)), ...projectHandlers);
        expect(await screen.findByText(/Excused/)).toHaveTextContent(`Excused ${money.fmt(1500)} at completion`);
    });
});

describe("closing a Design project the client has paid ahead", () => {
    it("offers the same switch, raising the payment instead of adding a VO", async () => {
        const design = designPaidAhead(2000);
        renderApp("/design/projects/1?complete=1", nadia, http.get("/api/projects/1", () => HttpResponse.json(design)), ...projectHandlers);
        const dialog = await closing(design.title);
        expect(within(dialog).getByText(`The client paid ${money.fmt(2000)} beyond the agreed price.`)).toBeInTheDocument();
        expect(within(dialog).getByText(/the payment is raised to what was received/)).toBeInTheDocument();
        const m = design.money!;
        // no supervision and no TVA on a Design payment: all of it is revenue
        expect(within(dialog).getByText(`Final profit ${money.fmt(m.profit + 2000)} · ${money.pct((m.profit + 2000) / (m.revenue + 2000))}`)).toBeInTheDocument();
    });

    it("sends the choice with the completion", async () => {
        const design = designPaidAhead(2000);
        const bodies: unknown[] = [];
        renderApp("/design/projects/1?complete=1", nadia,
            http.post("/api/projects/1/complete", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ ...design, status: "completed", completedAt: "2026-09-30T09:00:00Z" }); }),
            http.get("/api/projects/1", () => HttpResponse.json(design)), ...projectHandlers);
        const dialog = await closing(design.title);
        await userEvent.click(keepSwitch(dialog));
        await userEvent.click(within(dialog).getByRole("button", { name: "Complete project" }));
        await waitFor(() => expect(bodies).toEqual([{ keepPaidAhead: false }]));
    });

    it("has no switch for an internal project, which carries no payment", async () => {
        const internal = { ...fixtures.project, billingType: "internal", client: null };
        renderApp("/design/projects/1?complete=1", nadia, http.get("/api/projects/1", () => HttpResponse.json(internal)), ...projectHandlers);
        const dialog = await closing(internal.title);
        expect(within(dialog).queryByRole("switch")).not.toBeInTheDocument();
    });
});

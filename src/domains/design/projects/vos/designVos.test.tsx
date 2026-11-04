import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures } from "@/test/fixtures";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const project = projectWork.project;
const path = `/design/projects/${project.id}`;
const rana = personas.superAdmin;
const [pending, applied] = projectWork.designVos;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const list = async () => screen.findByRole("list", { name: "Variation orders" });

describe("a Design project's variation orders", () => {
    it("are listed newest first with where each stands, for whoever sees the money", async () => {
        renderApp(`${path}?tab=vos`, rana, ...projectWorkHandlers);
        const rows = within(await list()).getAllByRole("listitem");
        expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([pending.number, applied.number]);
        expect(within(rows[0]).getByText("Waiting for the client")).toBeInTheDocument();
        expect(within(rows[1]).getByText("In the price")).toBeInTheDocument();
        expect(within(rows[1]).getByText(/Architecture/)).toBeInTheDocument();
    });

    it("are no tab for an admin who doesn't see the money", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        await screen.findAllByRole("tablist");
        expect(screen.queryByRole("tab", { name: "Variation orders" })).toBeNull();
    });

    it("take lines that add and take out work, then go to the price or to the client", async () => {
        const sent: unknown[] = [];
        renderApp(`${path}?tab=vos`, rana,
            http.get("/api/clients/:id", () => HttpResponse.json(fixtures.client)),
            http.post("/api/projects/:id/design-vos", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json({ ...pending, id: 30, number: "VO-2026-003", title: "Terrace" }, { status: 201 });
            }),
            ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New variation order" }));
        const dialog = await screen.findByRole("dialog", { name: "New variation order" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Add to the price" }));
        expect(within(dialog).getByText("Give it a title.")).toBeInTheDocument();
        expect(within(dialog).getByText("Describe each line.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        await userEvent.type(within(dialog).getByLabelText("Title"), "Terrace");
        await userEvent.type(within(dialog).getByLabelText("Line 1"), "Terrace design");
        await userEvent.type(within(dialog).getByLabelText("Amount of line 1"), "2,500");
        await userEvent.click(within(dialog).getByRole("button", { name: "Add a line" }));
        await userEvent.type(within(dialog).getByLabelText("Line 2"), "No balcony");
        await userEvent.type(within(dialog).getByLabelText("Amount of line 2"), "-500");
        await userEvent.click(within(dialog).getByRole("checkbox"));

        // sent for approval: the window to send it opens next
        await userEvent.click(within(dialog).getByRole("button", { name: "Send for approval" }));
        await waitFor(() => expect(sent).toEqual([{
            title: "Terrace",
            lines: [{ description: "Terrace design", amount: 2500 }, { description: "No balcony", amount: -500 }],
            split: "shares", allocations: [], showOutsideScope: true, apply: false,
        }]));
        expect(await screen.findByRole("dialog", { name: "Send VO-2026-003" })).toBeInTheDocument();
    });

    it("is confirmed once the client agrees", async () => {
        const confirmed: string[] = [];
        renderApp(`${path}?tab=vos`, rana,
            http.post("/api/design-vos/:id/confirm", ({ params }) => {
                confirmed.push(String(params.id));
                return HttpResponse.json({ ...pending, status: "applied" });
            }),
            ...projectWorkHandlers);
        const row = within(await list()).getAllByRole("listitem")[0];
        await userEvent.click(within(row).getByRole("button", { name: `Actions for ${pending.number}` }));
        await userEvent.click(await screen.findByRole("button", { name: "The client confirmed it" }));
        await waitFor(() => expect(confirmed).toEqual([String(pending.id)]));
    });

    it("keep the payment's pencil for correcting mistakes", async () => {
        renderApp(path, rana, ...projectWorkHandlers);
        await userEvent.click(within(await screen.findByRole("region", { name: "Customer payment" })).getByRole("button", { name: "Edit customer payment" }));
        const dialog = await screen.findByRole("dialog", { name: "Customer payment" });
        expect(within(dialog).getByRole("note")).toHaveTextContent("For correcting a mistake only.");
    });

    it("are only read by whoever sees the money without writing it", async () => {
        renderApp(`${path}?tab=vos`, withPermissions(personas.designAdmin, { grant: [P.FINANCIAL_VIEW] }), ...projectWorkHandlers);
        await list();
        expect(screen.queryByRole("button", { name: "New variation order" })).toBeNull();
    });
});

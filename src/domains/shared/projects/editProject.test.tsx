import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const project = fixtures.project;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const openDetails = async (...handlers: Parameters<typeof renderApp>[2][]) => {
    renderApp("/design/projects/1", admin, ...handlers, ...projectHandlers);
    await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    return screen.findByRole("dialog", { name: "Edit project details" });
};
const refusal = (message: string) => HttpResponse.json({
    type: "validation", code: "validation_failed", message: "One or more fields are invalid.", traceId: "t", errors: { startDate: [message] },
}, { status: 400 });

describe("the start date of a project's details", () => {
    it("is a required field, filled with the day the project started", async () => {
        const dialog = await openDetails();
        const start = within(dialog).getByLabelText("Start date");
        expect(start).toHaveValue("Aug 20, 2026");
        expect(within(dialog).getByText("Start date", { selector: "label" })).toHaveClass("required");
    });

    it("is sent with the rest of the details, changed or as it was", async () => {
        const bodies: Record<string, unknown>[] = [];
        const dialog = await openDetails(http.put("/api/projects/1", async ({ request }) => {
            bodies.push((await request.json()) as Record<string, unknown>);
            return HttpResponse.json(project);
        }));
        const start = within(dialog).getByLabelText("Start date");
        await userEvent.clear(start);
        await userEvent.type(start, "2026-08-01{Enter}");
        expect(start).toHaveValue("Aug 1, 2026");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ title: project.title, startDate: "2026-08-01" })]));
    });

    it("goes back as it was when nothing about it is changed", async () => {
        const bodies: Record<string, unknown>[] = [];
        const dialog = await openDetails(http.put("/api/projects/1", async ({ request }) => {
            bodies.push((await request.json()) as Record<string, unknown>);
            return HttpResponse.json(project);
        }));
        await userEvent.type(within(dialog).getByLabelText(/Location/), "Jounieh");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(bodies).toEqual([expect.objectContaining({ startDate: project.startDate })]));
    });

    it("says it is needed, live, and sends nothing until a day is there", async () => {
        const bodies: unknown[] = [];
        const dialog = await openDetails(http.put("/api/projects/1", async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(project); }));
        const start = within(dialog).getByLabelText("Start date");
        await userEvent.clear(start);
        await userEvent.tab();
        expect(await within(dialog).findByText("Pick the day the project started.")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(bodies).toEqual([]);
        // it goes as soon as a day is picked
        await userEvent.type(start, "2026-08-02{Enter}");
        await waitFor(() => expect(within(dialog).queryByText("Pick the day the project started.")).not.toBeInTheDocument());
    });

    it("takes no day in the future: the field keeps the day it had", async () => {
        const dialog = await openDetails();
        const start = within(dialog).getByLabelText("Start date");
        await userEvent.clear(start);
        await userEvent.type(start, "2026-10-05{Enter}");
        expect(start).toHaveValue("Aug 20, 2026");
    });

    it("shows the API's refusal of the day beside the field, once, until it is changed", async () => {
        const message = "A site can't start after its first ground labour.";
        const dialog = await openDetails(http.put("/api/projects/1", () => refusal(message)));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findAllByText(message)).toHaveLength(1);
        // beside the field, not repeated in the footer
        expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
        const start = within(dialog).getByLabelText("Start date");
        await userEvent.clear(start);
        await userEvent.type(start, "2026-08-02{Enter}");
        await waitFor(() => expect(within(dialog).queryByText(message)).not.toBeInTheDocument());
    });
});

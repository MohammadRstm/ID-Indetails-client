import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDate, fmtDateY } from "@/shared/format/time";
import { workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { TimeOff } from "../../shared/timeOff/timeOffApi";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const sarah = personas.designEmployee;

const request = (over: Partial<TimeOff> = {}): TimeOff => ({
    id: 1, firstDay: "2026-11-12", lastDay: "2026-11-14", reason: "Family trip", status: "pending", isPaid: null,
    workingDays: 2, daysTaken: 0, takenThisYear: null, person: null, meetings: null, requestedAt: "2026-11-08T09:00:00Z",
    decidedAt: null, decidedByName: null, decisionNote: null, endedAt: null, endedByName: null, endedOn: null, endNote: null, ...over,
});

const mine = (...requests: TimeOff[]) => http.get("/api/me/time-off", () => HttpResponse.json(requests));

async function typeDay(field: HTMLElement, day: string) {
    await userEvent.clear(field);
    await userEvent.type(field, day);
    await userEvent.tab();
}

describe("the employee's time off", () => {
    it("asks for time off, showing each field's error live and the days asked for", async () => {
        const sent: unknown[] = [];
        renderApp("/design/time-off", sarah, mine(),
            http.post("/api/me/time-off", async ({ request: r }) => { sent.push(await r.json()); return HttpResponse.json(request(), { status: 201 }); }));
        expect(await screen.findByText("No time off requested")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Request time off" }));
        const dialog = await screen.findByRole("dialog", { name: "Request time off" });

        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        expect(within(dialog).getByText("Pick the first day.")).toBeInTheDocument();
        expect(within(dialog).getByText("Pick the last day.")).toBeInTheDocument();
        expect(within(dialog).getByText("Say why you need the time off.")).toBeInTheDocument();
        expect(sent).toEqual([]);

        await typeDay(within(dialog).getByLabelText("First day"), "2026-11-12");
        // the last day follows the first until it is set
        expect(within(dialog).queryByText("Pick the first day.")).not.toBeInTheDocument();
        expect(within(dialog).queryByText("Pick the last day.")).not.toBeInTheDocument();
        await typeDay(within(dialog).getByLabelText("Last day"), "2026-11-14");
        expect(within(dialog).getByText(`3 days from ${fmtDateY("2026-11-12")} to ${fmtDateY("2026-11-14")}. Pay and days taken count only your working days.`)).toBeInTheDocument();

        await userEvent.type(within(dialog).getByLabelText("Reason"), "Family trip");
        expect(within(dialog).queryByText("Say why you need the time off.")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        await waitFor(() => expect(sent).toEqual([{ firstDay: "2026-11-12", lastDay: "2026-11-14", reason: "Family trip" }]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Request time off" })).not.toBeInTheDocument());
    });

    it("shows what the API refuses, next to its field or at the foot", async () => {
        let refuse: Record<string, unknown> = { type: "validation", code: "validation_failed", message: "Invalid.", errors: { reason: ["Say it in fewer words."] } };
        renderApp("/design/time-off", sarah, mine(),
            http.post("/api/me/time-off", () => HttpResponse.json(refuse, { status: 422 })));
        await userEvent.click(await screen.findByRole("button", { name: "Request time off" }));
        const dialog = await screen.findByRole("dialog", { name: "Request time off" });
        await typeDay(within(dialog).getByLabelText("First day"), "2026-11-12");
        await userEvent.type(within(dialog).getByLabelText("Reason"), "Family trip");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        expect(await within(dialog).findByText("Say it in fewer words.")).toBeInTheDocument();

        refuse = { type: "business", code: "time_off_overlaps", message: "You already have time off on some of these days.", errors: null };
        await userEvent.click(within(dialog).getByRole("button", { name: "Send the request" }));
        expect(await within(dialog).findByText("You already have time off on some of these days.")).toBeInTheDocument();
    });

    it("lists the requests with their status, pay and notes, and Withdraw only on a pending one", async () => {
        renderApp("/design/time-off", sarah, mine(
            request({ id: 1 }),
            request({ id: 2, reason: "Conference", firstDay: "2026-10-05", lastDay: "2026-10-09", workingDays: 5, daysTaken: 5, status: "approved", isPaid: true, decidedByName: "Rana", decisionNote: "Enjoy" }),
            request({ id: 3, reason: "Move house", firstDay: "2026-09-01", lastDay: "2026-09-02", workingDays: 2, status: "declined", decidedByName: "Rana", decisionNote: "Busy week" }),
            request({ id: 4, reason: "Wedding", firstDay: "2026-08-03", lastDay: "2026-08-14", workingDays: 10, daysTaken: 4, status: "rejected", isPaid: false, endedOn: "2026-08-07", endedByName: "Rana" }),
        ));
        const panel = within(await screen.findByLabelText("Your requests"));
        await panel.findByText("Family trip");
        const rowOf = (text: string) => panel.getByText(text).closest("tr") as HTMLElement;

        expect(rowOf("Family trip")).toHaveTextContent("Waiting for a decision");
        expect(within(rowOf("Family trip")).getByRole("button", { name: `Withdraw ${fmtDateY("2026-11-12")}` })).toBeInTheDocument();
        const approved = panel.getAllByRole("row")[2];
        expect(approved).toHaveTextContent("Approved · Paid");
        expect(approved).toHaveTextContent("Rana: Enjoy");
        expect(panel.getAllByRole("row")[3]).toHaveTextContent("Declined");
        expect(panel.getAllByRole("row")[3]).toHaveTextContent("Rana: Busy week");
        const rejected = panel.getAllByRole("row")[4];
        expect(rejected).toHaveTextContent("Rejected · Unpaid");
        expect(rejected).toHaveTextContent(`Taken back on ${fmtDateY("2026-08-07")} by Rana`);
        expect(rejected).toHaveTextContent("4 taken");
        expect(panel.getAllByRole("button", { name: /^Withdraw/ })).toHaveLength(1);
    });

    it("withdraws a pending request after asking", async () => {
        const withdrawn: number[] = [];
        renderApp("/design/time-off", sarah, mine(request({ id: 7 })),
            http.post("/api/me/time-off/:id/withdraw", ({ params }) => { withdrawn.push(Number(params.id)); return HttpResponse.json(request({ id: 7, status: "withdrawn" })); }));
        await userEvent.click(await screen.findByRole("button", { name: `Withdraw ${fmtDateY("2026-11-12")}` }));
        const dialog = await screen.findByRole("dialog", { name: "Withdraw the request?" });
        expect(withdrawn).toEqual([]);
        await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));
        await waitFor(() => expect(withdrawn).toEqual([7]));
    });

    it("tells them on their home when they are off today", async () => {
        renderApp("/design/projects", sarah, mine(
            request({ id: 1, firstDay: "2026-11-08", lastDay: "2026-11-11", status: "approved", isPaid: true }),
            request({ id: 2, firstDay: "2026-12-01", lastDay: "2026-12-03", status: "approved", isPaid: false }),
        ), ...workHandlers);
        expect(await screen.findByText(`You're off until ${fmtDate("2026-11-11")}.`)).toBeInTheDocument();
    });

    it("tells them on their home about their next approved time off, and not about one that is only waiting", async () => {
        renderApp("/design/projects", sarah, mine(
            request({ id: 1, firstDay: "2026-11-20", lastDay: "2026-11-21" }),
            request({ id: 2, firstDay: "2026-12-01", lastDay: "2026-12-03", status: "approved", isPaid: false }),
        ), ...workHandlers);
        expect(await screen.findByText(`Time off from ${fmtDate("2026-12-01")} to ${fmtDate("2026-12-03")}.`)).toBeInTheDocument();
        expect(screen.queryByText(/You're off until/)).not.toBeInTheDocument();
    });
});

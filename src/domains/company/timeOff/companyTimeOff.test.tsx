import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDateY } from "@/shared/format/time";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { TimeOff } from "../../shared/timeOff/timeOffApi";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const rana = personas.superAdmin;
const sarah = { id: 12, name: "Sarah Nasr", photoFileId: null, departmentName: "Interiors" };

const request = (over: Partial<TimeOff> = {}): TimeOff => ({
    id: 5, firstDay: "2026-11-16", lastDay: "2026-11-20", reason: "Family trip", status: "pending", isPaid: null,
    workingDays: 5, daysTaken: 0, takenThisYear: 3, person: sarah, meetings: [], requestedAt: "2026-11-08T09:00:00Z",
    decidedAt: null, decidedByName: null, decisionNote: null, endedAt: null, endedByName: null, endedOn: null, endNote: null, ...over,
});

const paged = (...items: TimeOff[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });

/** Answers the list for each view, and keeps which views were asked for. */
const listHandler = (views: Partial<Record<"pending" | "current" | "past", TimeOff[]>>, asked: string[] = []) =>
    http.get("/api/time-off", ({ request: r }) => {
        const view = new URL(r.url).searchParams.get("view") as "pending" | "current" | "past";
        asked.push(view);
        return HttpResponse.json(paged(...(views[view] ?? [])));
    });

const rowOf = (cell: HTMLElement) => cell.closest("tr") as HTMLElement;
const decided = { type: "business", code: "time_off_decided", message: "Someone else has already decided on this request.", errors: null };

describe("the super admins' time off", () => {
    it("lists the pending requests with who, when, why and how much time off they have taken", async () => {
        const asked: string[] = [];
        renderApp("/company/time-off", rana, listHandler({ pending: [request()] }, asked));
        expect(await screen.findByRole("heading", { name: "Time off" })).toBeInTheDocument();
        const row = rowOf(await screen.findByText("Family trip"));
        expect(row).toHaveTextContent("Sarah Nasr");
        expect(row).toHaveTextContent("Interiors");
        expect(row).toHaveTextContent(`${fmtDateY("2026-11-16")} to ${fmtDateY("2026-11-20")}`);
        expect(row).toHaveTextContent("Waiting for a decision");
        expect(within(row).getByRole("button", { name: "Approve with pay" })).toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Approve without pay" })).toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Decline" })).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
        expect(asked).toEqual(["pending"]);
    });

    it("shows an empty tab plainly", async () => {
        renderApp("/company/time-off", rana, listHandler({}));
        expect(await screen.findByText("Nothing waiting")).toBeInTheDocument();
    });

    it("approves with pay, with an optional note", async () => {
        const sent: unknown[] = [];
        renderApp("/company/time-off", rana, listHandler({ pending: [request()] }),
            http.post("/api/time-off/:id/approve", async ({ params, request: r }) => {
                sent.push({ id: Number(params.id), ...(await r.json() as object) });
                return HttpResponse.json(request({ status: "approved", isPaid: true }));
            }));
        await userEvent.click(await within(rowOf(await screen.findByText("Family trip"))).findByRole("button", { name: "Approve with pay" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve with pay" });
        expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "Enjoy");
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve with pay" }));
        await waitFor(() => expect(sent).toEqual([{ id: 5, isPaid: true, note: "Enjoy" }]));
    });

    it("approves without pay", async () => {
        const sent: unknown[] = [];
        renderApp("/company/time-off", rana, listHandler({ pending: [request()] }),
            http.post("/api/time-off/:id/approve", async ({ request: r }) => { sent.push(await r.json()); return HttpResponse.json(request({ status: "approved", isPaid: false })); }));
        await userEvent.click(await within(rowOf(await screen.findByText("Family trip"))).findByRole("button", { name: "Approve without pay" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve without pay" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve without pay" }));
        await waitFor(() => expect(sent).toEqual([{ isPaid: false }]));
    });

    it("warns about the meetings the person is already in during the time off", async () => {
        const meetings = [
            { id: 1, topic: "Kitchen review", startsAt: "2026-11-17T09:00:00Z", endsAt: "2026-11-17T10:00:00Z" },
            { id: 2, topic: null, startsAt: "2026-11-19T12:00:00Z", endsAt: "2026-11-19T13:00:00Z" },
        ];
        renderApp("/company/time-off", rana, listHandler({ pending: [request({ meetings })] }));
        await userEvent.click(await within(rowOf(await screen.findByText("Family trip"))).findByRole("button", { name: "Approve with pay" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve with pay" });
        const warning = within(dialog).getByRole("alert");
        expect(warning).toHaveTextContent("Sarah Nasr is already in 2 meetings during this time off.");
        expect(warning).toHaveTextContent("Kitchen review");
        expect(warning).toHaveTextContent("Meeting");
    });

    it("declines, with an optional reason", async () => {
        const sent: unknown[] = [];
        renderApp("/company/time-off", rana, listHandler({ pending: [request()] }),
            http.post("/api/time-off/:id/decline", async ({ params, request: r }) => {
                sent.push({ id: Number(params.id), ...(await r.json() as object) });
                return HttpResponse.json(request({ status: "declined" }));
            }));
        await userEvent.click(await within(rowOf(await screen.findByText("Family trip"))).findByRole("button", { name: "Decline" }));
        const dialog = await screen.findByRole("dialog", { name: "Decline the request?" });
        await userEvent.type(within(dialog).getByLabelText("Why (optional)"), "Busy week");
        await userEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
        await waitFor(() => expect(sent).toEqual([{ id: 5, note: "Busy week" }]));
    });

    it("rejects approved time off that has not finished, and says what happens to the days", async () => {
        const sent: unknown[] = [];
        const approved = request({ id: 8, reason: "Under way", firstDay: "2026-11-05", lastDay: "2026-11-12", status: "approved", isPaid: true, daysTaken: 3, decidedByName: "Rana" });
        const finished = request({ id: 9, reason: "Finished", firstDay: "2026-11-02", lastDay: "2026-11-06", status: "approved", isPaid: false, daysTaken: 5 });
        const asked: string[] = [];
        renderApp("/company/time-off", rana, listHandler({ current: [approved], past: [finished] }, asked),
            http.post("/api/time-off/:id/reject", async ({ params, request: r }) => {
                sent.push({ id: Number(params.id), ...(await r.json() as object) });
                return HttpResponse.json(request({ id: 8, status: "rejected", isPaid: true }));
            }));
        await userEvent.click(await screen.findByRole("tab", { name: /Current & upcoming/ }));
        const row = rowOf(await screen.findByText("Under way"));
        expect(row).toHaveTextContent("Approved · Paid");
        await userEvent.click(within(row).getByRole("button", { name: "Reject" }));
        const dialog = await screen.findByRole("dialog", { name: "Reject the approved time off?" });
        expect(dialog).toHaveTextContent("Days before today stay time off");
        expect(dialog).toHaveTextContent("Today and every day after become normal work days");
        await userEvent.type(within(dialog).getByLabelText("Why (optional)"), "Needed on site");
        await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
        await waitFor(() => expect(sent).toEqual([{ id: 8, note: "Needed on site" }]));

        // a request whose last day has passed can't be rejected any more
        await userEvent.click(screen.getByRole("tab", { name: /Past/ }));
        expect(within(rowOf(await screen.findByText("Finished"))).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
        expect(asked).toContain("past");
    });

    it("shows the API's message when someone else decided first", async () => {
        renderApp("/company/time-off", rana, listHandler({ pending: [request()] }),
            http.post("/api/time-off/:id/approve", () => HttpResponse.json(decided, { status: 422 })));
        await userEvent.click(await within(rowOf(await screen.findByText("Family trip"))).findByRole("button", { name: "Approve with pay" }));
        const dialog = await screen.findByRole("dialog", { name: "Approve with pay" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Approve with pay" }));
        expect(await within(dialog).findByText("Someone else has already decided on this request.")).toBeInTheDocument();
    });
});

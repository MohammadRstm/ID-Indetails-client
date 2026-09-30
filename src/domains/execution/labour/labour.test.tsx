import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { site, siteHandlers } from "@/test/fixtures/site";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const karim = personas.executionAdmin;
const path = `/execution/projects/${site.project.id}`;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const panel = async () => (await screen.findByText("Ground workers on site, counted day by day.")).closest(".panel") as HTMLElement;

describe("weekly labour", () => {
    it("opens on the latest week reported, with its days and total", async () => {
        renderApp(path, karim, ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByLabelText("Workers on Sep 21")).toHaveValue(5);
        expect(within(p).getByLabelText("Week")).toHaveTextContent("Week of Sep 21, 2026 - $725");
        expect(within(p).getAllByRole("row")).toHaveLength(8);
        expect(within(p).getByText("Weekly total").closest("tr")).toHaveTextContent("$725");
        expect(within(p).getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    it("fills a week not reported yet from the defaults, up to today", async () => {
        renderApp(path, karim, ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Week"));
        await userEvent.click(screen.getByRole("option", { name: "Week of Sep 28, 2026 - no report yet" }));
        expect(await within(p).findByLabelText("Workers on Sep 30")).toHaveValue(6);
        expect(within(p).queryByLabelText("Workers on Oct 1")).not.toBeInTheDocument();
        expect(within(p).getByText(/Filled in with the project's defaults - change any day/)).toBeInTheDocument();
        expect(within(p).getByRole("button", { name: "Submit week" })).toBeInTheDocument();
    });

    it("saves the week's days", async () => {
        const saved: unknown[] = [];
        renderApp(path, karim,
            http.put("/api/projects/:id/labour-weeks/:weekStart", async ({ request, params }) => { saved.push([params.weekStart, await request.json()]); return HttpResponse.json(site.labourWeek); }),
            ...siteHandlers);
        const p = await panel();
        const monday = await within(p).findByLabelText("Workers on Sep 21");
        await userEvent.clear(monday);
        await userEvent.type(monday, "7");
        const pay = within(p).getByLabelText("Pay per worker on Sep 26");
        await userEvent.clear(pay);
        await userEvent.type(pay, "27.5");
        expect(within(p).getByText("Weekly total").closest("tr")).toHaveTextContent("$785");
        await userEvent.click(within(p).getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(saved).toHaveLength(1));
        const [week, body] = saved[0] as [string, { days: { date: string; workers: number; dailyPay: number }[]; note: null }];
        expect(week).toBe("2026-09-21");
        expect(body.days[0]).toEqual({ date: "2026-09-21", workers: 7, dailyPay: 25 });
        expect(body.days[5]).toEqual({ date: "2026-09-26", workers: 4, dailyPay: 27.5 });
        expect(await screen.findByText("Updated week of Sep 21")).toBeInTheDocument();
    });

    it("walks the fields with Enter, from the defaults down to Submit", async () => {
        renderApp(path, karim, ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Pay per worker on Sep 26"));
        await userEvent.keyboard("{Enter}");
        expect(within(p).getByRole("button", { name: "Save changes" })).toHaveFocus();
        await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
        expect(within(p).getByLabelText("Pay per worker on Sep 26")).toHaveFocus();
        await userEvent.click(within(p).getByLabelText("Cost per worker per day"));
        await userEvent.keyboard("{Enter}");
        expect(within(p).getByLabelText("Workers on Sep 21")).toHaveFocus();
    });

    it("shows a week read-only to someone who may not change it", async () => {
        renderApp(path, karim,
            http.get("/api/projects/:id/labour-weeks/:weekStart", () => HttpResponse.json({ ...site.labourWeek, canEdit: false })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("Closed to changes.")).toBeInTheDocument();
        expect(within(p).queryByLabelText("Workers on Sep 21")).not.toBeInTheDocument();
        expect(within(p).queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    });
});

describe("the labour defaults", () => {
    it("are changed right in the panel, from today", async () => {
        const saved: unknown[] = [];
        renderApp(path, karim,
            http.post("/api/projects/:id/labour-defaults", async ({ request }) => { saved.push(await request.json()); return HttpResponse.json(site.labourDefaults); }),
            ...siteHandlers);
        const p = await panel();
        const workers = await within(p).findByLabelText("Ground workers per day");
        expect(within(p).queryByRole("button", { name: "Save defaults" })).not.toBeInTheDocument();
        await userEvent.clear(workers);
        await userEvent.type(workers, "8");
        expect(within(p).getByText("$200")).toBeInTheDocument();
        await userEvent.click(within(p).getByRole("button", { name: "Save defaults" }));
        await waitFor(() => expect(saved).toEqual([{ workers: 8, dailyPay: 25 }]));
        expect(await screen.findByText("Labour defaults updated")).toBeInTheDocument();
    });

    it("are read-only without labour_report:manage", async () => {
        renderApp(path, withPermissions(karim, { revoke: [P.LABOUR_REPORT_MANAGE] }),
            http.get("/api/projects/:id/labour-defaults", () => HttpResponse.json({ ...site.labourDefaults, canEdit: false })),
            ...siteHandlers);
        const p = await panel();
        expect(await within(p).findByText("Each unreported week starts from these.")).toBeInTheDocument();
        expect(within(p).queryByLabelText("Ground workers per day")).not.toBeInTheDocument();
        // the week itself can still be reported
        expect(within(p).getByLabelText("Workers on Sep 21")).toBeInTheDocument();
    });

    it("say when a week not yet reported started from older ones, and keep their history", async () => {
        const changed = {
            canEdit: true,
            current: { effectiveFrom: "2026-09-29", workers: 8, dailyPay: 30, currency: "USD", setBy: { id: 10, name: "Karim Jaber" }, setAt: "2026-09-29T08:00:00Z" },
            history: [
                { effectiveFrom: "2026-09-29", workers: 8, dailyPay: 30, currency: "USD", setBy: { id: 10, name: "Karim Jaber" }, setAt: "2026-09-29T08:00:00Z" },
                { effectiveFrom: "2026-06-27", workers: 6, dailyPay: 25, currency: "USD", setBy: null, setAt: "2026-06-27T08:00:00Z" },
            ],
        };
        renderApp(path, karim,
            http.get("/api/projects/:id/labour-defaults", () => HttpResponse.json(changed)),
            ...siteHandlers);
        const p = await panel();
        await userEvent.click(await within(p).findByLabelText("Week"));
        await userEvent.click(screen.getByRole("option", { name: "Week of Sep 28, 2026 - no report yet" }));
        expect(await within(p).findByText(/as they were on these days/)).toBeInTheDocument();

        await userEvent.click(within(p).getByRole("button", { name: "History · 2" }));
        const dialog = await screen.findByRole("dialog", { name: "Labour defaults" });
        expect(within(dialog).getByText("Sep 29, 2026")).toBeInTheDocument();
        expect(within(dialog).getByText("in force · set by Karim")).toBeInTheDocument();
        expect(within(dialog).getByText("Jun 27, 2026 – Sep 28, 2026")).toBeInTheDocument();
    });
});

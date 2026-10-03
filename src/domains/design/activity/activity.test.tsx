import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { activity, activityHandlers } from "@/test/fixtures/activity";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const nadia = personas.designAdmin;

// Wednesday 30 September 2026, noon in Beirut: the fixtures were recorded that morning
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** Answers the feed and remembers what each request asked for. */
function recordFeed(asked: URLSearchParams[]) {
    return http.get("/api/activity", ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(activity.feed);
    });
}

describe("Activity", () => {
    it("opens to an employee given activity:view, without today's work or people they may not see", async () => {
        const asked: string[] = [];
        renderApp("/design/activity", withPermissions(personas.designEmployee, { grant: [P.ACTIVITY_VIEW] }),
            http.get("/api/activity/today", () => { asked.push("today"); return HttpResponse.json(activity.today); }),
            ...activityHandlers);
        expect(await screen.findByText("Today · Sep 30, 2026")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
        expect(screen.queryByText("Today at a glance")).toBeNull();
        expect(screen.queryByRole("button", { name: "Work logged" })).toBeNull();
        expect(asked).toEqual([]);
    });

    it("stays closed to an employee without activity:view", async () => {
        renderApp("/design/activity", personas.designEmployee, ...activityHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });

    it("lists what happened day by day, and opens logged work", async () => {
        renderApp("/design/activity", nadia, ...activityHandlers);
        expect(await screen.findByText("Today · Sep 30, 2026")).toBeInTheDocument();
        expect(screen.getByText(/received from Haddad Holdings against ID-2026-002/)).toBeInTheDocument();
        expect(screen.getByText(/edited a 1h 20m entry on Villa Mounir interiors/)).toBeInTheDocument();

        await userEvent.click(screen.getAllByText("Competition boards")[0]);
        expect(await screen.findByRole("dialog", { name: "Work entry" })).toBeInTheDocument();
    });

    it("asks for the Design feed only, and loads more on request", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/activity", nadia, recordFeed(asked), ...activityHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
        await waitFor(() => expect(asked.map((q) => q.get("page"))).toEqual(["1", "2"]));
        expect(asked.every((q) => q.get("domain") === "design" && q.get("pageSize") === "40")).toBe(true);
    });

    it("filters by kind and by internal work", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/activity", nadia, recordFeed(asked),
            http.get("/api/clients", () => HttpResponse.json({ items: [], page: 1, pageSize: 100, totalCount: 0 })),
            ...activityHandlers);
        await screen.findByText("Today · Sep 30, 2026");
        await userEvent.click(screen.getByRole("button", { name: "Money" }));
        await waitFor(() => expect(asked.at(-1)?.get("group")).toBe("money"));
        await userEvent.click(screen.getByRole("button", { name: "Client" }));
        await userEvent.click(screen.getByRole("option", { name: "Internal (no client)" }));
        await waitFor(() => expect(asked.at(-1)?.get("internal")).toBe("true"));
        expect(asked.at(-1)?.get("clientId")).toBeNull();
    });

    it("shows today and who is online next to the feed", async () => {
        renderApp("/design/activity", nadia, ...activityHandlers);
        expect(await screen.findByText("Today at a glance")).toBeInTheDocument();
        expect(screen.getByText("Online now")).toBeInTheDocument();
    });

    it("leaves out everyone's work without work_entry:view_all", async () => {
        const asked: string[] = [];
        renderApp("/design/activity", withPermissions(nadia, { revoke: [P.WORK_ENTRY_VIEW_ALL] }),
            http.get("/api/activity/today", () => { asked.push("today"); return HttpResponse.json(activity.today); }),
            http.get("/api/work/people", () => { asked.push("people"); return HttpResponse.json([]); }),
            ...activityHandlers);
        await screen.findByText("Today · Sep 30, 2026");
        const kinds = screen.getByRole("group", { name: "Kind of activity" });
        expect(within(kinds).queryByRole("button", { name: "Work logged" })).not.toBeInTheDocument();
        expect(screen.queryByText("Today at a glance")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Employee" })).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("offers the client filter only with client:view", async () => {
        renderApp("/design/activity", withPermissions(nadia, { revoke: [P.CLIENT_VIEW] }), ...activityHandlers);
        await screen.findByText("Today · Sep 30, 2026");
        expect(screen.queryByRole("button", { name: "Client" })).not.toBeInTheDocument();
    });

    it("needs activity:view", async () => {
        renderApp("/design/activity", withPermissions(nadia, { revoke: [P.ACTIVITY_VIEW] }), ...activityHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { WebsiteAnalytics, WebsiteRealtime } from "./analyticsApi";
import { fmtRate, fmtSeconds, flag, label, pointsChange } from "./analyticsFormat";
import { customRange, presetRange } from "./analyticsRange";

const rana = personas.superAdmin;

const totals = (visitors: number, contactRequests: number) => ({
    visitors, newVisitors: Math.round(visitors * 0.7), sessions: Math.round(visitors * 1.3), views: visitors * 3, viewsPerSession: 2.3,
    engagementRate: 0.42, averageEngagementSeconds: 65, events: visitors * 9, keyEvents: contactRequests + 2, contactRequests,
});

function report(change: Partial<WebsiteAnalytics> = {}): WebsiteAnalytics {
    return {
        period: { from: "2026-09-22", to: "2026-10-19", previousFrom: "2026-08-25", previousTo: "2026-09-21" },
        hasData: true, thresholded: false, timeZone: "Asia/Beirut", retrievedAt: new Date().toISOString(),
        totals: totals(1234, 7), previousTotals: totals(1000, 5),
        days: [
            { date: "2026-10-18", visitors: 40, sessions: 52, views: 120, previousDate: "2026-09-20", previousVisitors: 31, previousSessions: 40, previousViews: 95 },
            { date: "2026-10-19", visitors: 44, sessions: 57, views: 133, previousDate: "2026-09-21", previousVisitors: 30, previousSessions: 38, previousViews: 90 },
        ],
        channels: [{ channel: "Organic Search", sessions: 900, visitors: 700, engagementRate: 0.5, keyEvents: 5 }, { channel: "Direct", sessions: 400, visitors: 350, engagementRate: 0.3, keyEvents: 2 }],
        sources: [{ source: "google", medium: "organic", campaign: "(organic)", sessions: 900, visitors: 700, engagementRate: 0.5, keyEvents: 5 }],
        pages: [
            { path: "/projects/villa-rizk", title: "Villa Rizk · ID-Indetails", projectTitle: "Villa Rizk", views: 300, visitors: 200, averageEngagementSeconds: 80, events: 900 },
            { path: "/contact", title: "Contact · ID-Indetails", projectTitle: null, views: 120, visitors: 90, averageEngagementSeconds: 40, events: 300 },
        ],
        countries: [{ code: "LB", name: "Lebanon", visitors: 800, sessions: 1000 }, { code: "FR", name: "France", visitors: 200, sessions: 230 }],
        devices: [{ key: "mobile", visitors: 700, sessions: 900 }, { key: "desktop", visitors: 500, sessions: 650 }],
        visitorTypes: [{ key: "new", visitors: 860, sessions: 900 }, { key: "returning", visitors: 374, sessions: 700 }],
        events: [
            { name: "page_view", count: 3702, previousCount: 3000, users: 1234, isKeyEvent: false },
            { name: "generate_lead", count: 7, previousCount: 5, users: 7, isKeyEvent: true },
            { name: "phone_click", count: 4, previousCount: 2, users: 4, isKeyEvent: true },
        ],
        ...change,
    };
}

const realtime: WebsiteRealtime = {
    visitorsNow: 3, visitorsPerMinute: [...Array(29).fill(0), 3], retrievedAt: new Date().toISOString(),
    pages: [{ title: "Contact · ID-Indetails", views: 4, visitors: 2 }], countries: [{ code: "LB", name: "Lebanon", visitors: 3 }],
};

const failure = (code: string, message: string) =>
    HttpResponse.json({ type: "unavailable", code, message, traceId: "t" }, { status: 503 });

function handlers(answer: () => Response = () => HttpResponse.json(report())) {
    const asked: URLSearchParams[] = [];
    return {
        asked,
        list: [
            http.get("/api/website/analytics", ({ request }) => { asked.push(new URL(request.url).searchParams); return answer(); }),
            http.get("/api/website/analytics/realtime", () => HttpResponse.json(realtime)),
        ],
    };
}

describe("the website's Analytics page", () => {
    it("shows the period's headline figures, its sources, its pages by project and who is on the website now", async () => {
        const api = handlers();
        renderApp("/website/analytics", rana, ...api.list);

        expect(await screen.findByRole("heading", { name: "Analytics" })).toBeInTheDocument();
        const glance = await screen.findByRole("region", { name: "The period at a glance" });
        await waitFor(() => expect(glance).toHaveTextContent("1,234"));
        expect(glance).toHaveTextContent("Contact requests");
        expect(glance).toHaveTextContent("+23.4%");
        expect(glance).toHaveTextContent("+0.0 pts");
        expect(glance).toHaveTextContent("1m 05s");

        // the 28 days ending yesterday, compared
        const range = presetRange(28);
        expect(api.asked[0].get("from")).toBe(range.from);
        expect(api.asked[0].get("to")).toBe(range.to);
        expect(api.asked[0].get("compare")).toBe("true");

        expect(screen.getByText("Organic Search")).toBeInTheDocument();
        const villa = screen.getByText("Villa Rizk").closest("tr") as HTMLElement;
        expect(within(villa).getByText("Project")).toBeInTheDocument();
        expect(within(villa).getByText("/projects/villa-rizk")).toBeInTheDocument();
        expect(screen.getByText("Lebanon")).toBeInTheDocument();
        expect(await screen.findByText("visitors in the last 30 minutes")).toBeInTheDocument();
    });

    it("asks for another period, and without the comparison when it is switched off", async () => {
        const api = handlers();
        renderApp("/website/analytics", rana, ...api.list);
        await screen.findByRole("region", { name: "The period at a glance" });

        await userEvent.click(screen.getByRole("tab", { name: "7 days" }));
        await waitFor(() => expect(api.asked.at(-1)!.get("from")).toBe(presetRange(7).from));
        await userEvent.click(screen.getByRole("switch", { name: "Compare with the period before" }));
        await waitFor(() => expect(api.asked.at(-1)!.get("compare")).toBe("false"));
    });

    it("lists the contact actions, and every event on request", async () => {
        renderApp("/website/analytics", rana, ...handlers().list);
        const actions = (await screen.findByText("Contact and key actions")).closest(".panel") as HTMLElement;
        expect(within(actions).getByText("Phone clicks")).toBeInTheDocument();
        await userEvent.click(within(actions).getByRole("tab", { name: "All events" }));
        expect(within(actions).getByText("page_view")).toBeInTheDocument();
        expect(within(actions).getAllByText("Key action")).toHaveLength(2);
    });

    it("says when Google Analytics isn't connected", async () => {
        renderApp("/website/analytics", rana, ...handlers(() => failure("website_analytics_not_configured", "Google Analytics isn't connected yet.")).list);
        expect(await screen.findByText("Google Analytics isn't connected yet")).toBeInTheDocument();
    });

    it("offers to try again when Google doesn't answer", async () => {
        let calls = 0;
        renderApp("/website/analytics", rana, ...handlers(() =>
            ++calls === 1 ? failure("website_analytics_unavailable", "Google Analytics didn't answer. Try again in a few minutes.") : HttpResponse.json(report())).list);

        expect(await screen.findByText("Google Analytics didn't answer. Try again in a few minutes.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        await waitFor(() => expect(screen.getByRole("region", { name: "The period at a glance" })).toHaveTextContent("1,234"));
    });

    it("says when nothing has been recorded yet", async () => {
        renderApp("/website/analytics", rana, ...handlers(() => HttpResponse.json(report({ hasData: false, days: [], pages: [] }))).list);
        expect(await screen.findByText("No visits recorded yet")).toBeInTheDocument();
        expect(screen.queryByText("Top pages")).not.toBeInTheDocument();
    });

    it("is the website's staff's, and not open to someone who may only see the website's content", async () => {
        renderApp("/website/analytics", personas.websiteAdmin, ...handlers().list);
        expect(await screen.findByRole("heading", { name: "Analytics" })).toBeInTheDocument();

        const api = handlers();
        renderApp("/website/analytics", withPermissions(personas.designAdmin, { grant: [P.WEBSITE_VIEW] }), ...api.list);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
        expect(api.asked).toEqual([]);
    });
});

describe("the analytics' figures", () => {
    it("are written the way people read them", () => {
        expect(fmtSeconds(42)).toBe("42s");
        expect(fmtSeconds(65)).toBe("1m 05s");
        expect(fmtSeconds(3725)).toBe("1h 02m");
        expect(fmtRate(0.4256)).toBe("42.6%");
        expect(pointsChange(0.425, 0.4)).toBe(2.5);
        expect(label("(not set)")).toBe("Not known");
        expect(label("Organic Search")).toBe("Organic Search");
        expect(flag("LB")).toBe("🇱🇧");
        expect(flag("(not set)")).toBe("");
    });

    it("keep a custom period in order, at most 366 days, ending today at the latest", () => {
        const today = "2026-10-20";
        expect(customRange({ from: "2026-10-01", to: "2026-10-10" }, "from", "2026-10-15", today)).toEqual({ from: "2026-10-15", to: "2026-10-15" });
        expect(customRange({ from: "2026-10-01", to: "2026-10-10" }, "to", "2026-09-20", today)).toEqual({ from: "2026-09-20", to: "2026-09-20" });
        expect(customRange({ from: "2026-10-01", to: "2026-10-10" }, "from", "2024-01-01", today)).toEqual({ from: "2024-01-01", to: "2024-12-31" });
        expect(customRange({ from: "2026-10-01", to: "2026-10-10" }, "to", "2026-12-01", today)).toEqual({ from: "2026-10-01", to: today });
        expect(presetRange(7, today)).toEqual({ from: "2026-10-13", to: "2026-10-19" });
    });
});

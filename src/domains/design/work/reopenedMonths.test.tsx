import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsHandlers } from "@/test/fixtures/settings";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { describe as words } from "@/domains/shared/notifications/notificationWords";
import { closedMonths, monthName } from "./reopenedMonthsApi";

const rana = personas.superAdmin;
const october = { month: "2026-10", openUntil: "2026-11-30", note: "Catching up", reopenedBy: { id: 1, name: "Rana Khoury" }, reopenedAt: "2026-11-23T08:00:00Z" };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Reopened months", () => {
    it("are the closed months, newest first, the month just ended staying open through the 1st", () => {
        expect(closedMonths("2026-11-23", 3)).toEqual(["2026-10", "2026-09", "2026-08"]);
        expect(closedMonths("2026-11-01", 2)).toEqual(["2026-09", "2026-08"]);
        expect(closedMonths("2026-01-15", 2)).toEqual(["2025-12", "2025-11"]);
        expect(monthName("2026-10")).toBe("October 2026");
    });

    it("a super admin reopens one from Settings, and locks it again", async () => {
        const puts: unknown[] = [];
        const deleted: string[] = [];
        let open: unknown[] = [];
        renderApp("/design/settings?section=time", rana,
            http.get("/api/reopened-months", () => HttpResponse.json(open)),
            http.put("/api/reopened-months/:month", async ({ request, params }) => {
                puts.push({ month: params.month, ...(await request.json() as object) });
                open = [october];
                return HttpResponse.json(october);
            }),
            http.delete("/api/reopened-months/:month", ({ params }) => { deleted.push(String(params.month)); open = []; return new HttpResponse(null, { status: 204 }); }),
            ...settingsHandlers);

        expect(await screen.findByText("No month is open for logging.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Note"), "Catching up");
        await userEvent.click(screen.getByRole("button", { name: "Reopen October 2026" }));
        await waitFor(() => expect(puts).toEqual([{ month: "2026-10", openUntil: "2026-12-07", note: "Catching up" }]));

        const row = (await screen.findByText("October 2026", { selector: "b" })).closest(".reopened-row") as HTMLElement;
        expect(row).toHaveTextContent("open until Nov 30, 2026");
        await userEvent.click(within(row).getByRole("button", { name: "Lock now" }));
        await waitFor(() => expect(deleted).toEqual(["2026-10"]));
    });

    it("an admin without the company's settings doesn't see them", async () => {
        renderApp("/design/settings?section=time", personas.designAdmin, ...settingsHandlers);
        await screen.findByText("Time tracking rules");
        expect(screen.queryByText("Reopened months")).not.toBeInTheDocument();
    });

    it("tell Design staff a month is open for logging", () => {
        const said = words(
            { id: 1, kind: "month_reopened", actor: { id: 1, name: "Rana Khoury" }, payload: { month: "2026-10", monthName: "October 2026", openUntilName: "Nov 30" } } as never,
            { logsWork: true, isAdmin: false, isSuperAdmin: false, domain: "design", userId: 9 });
        expect(said.text).toBe("October 2026 is open for logging");
        expect(said.sub).toBe("Log the hours you missed until Nov 30");
        expect(said.route).toBe("/design/my-work");
    });
});

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http as api } from "@/api/http";
import { P } from "@/app/permissions/codes";
import { work, workHandlers } from "@/test/fixtures/work";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { server } from "@/test/server";

const sarah = personas.designEmployee;
const cannotLog = withPermissions(sarah, { revoke: [P.WORK_ENTRY_CREATE] });

// Monday 28 September 2026, 7 PM in Beirut: the fixture's day, an hour after its last entry ended
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T16:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
});

const logWindow = () => screen.findByRole("dialog", { name: /log work/i });

describe("the Design employee home", () => {
    it("shows their week, today and the projects they can log against", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        expect(await screen.findByRole("heading", { name: "Good evening, Sarah" })).toBeInTheDocument();
        expect(await screen.findByText(work.myProjects[0].title)).toBeInTheDocument();
        expect(screen.getByText(/^Today · /)).toBeInTheDocument();
        expect(screen.getByText("Overtime")).toBeInTheDocument();
        // after 5 PM, overtime can be logged straight away
        expect(screen.getByRole("button", { name: "Log overtime" })).toBeInTheDocument();
    });

    it("offers no logging to someone without work_entry:create", async () => {
        renderApp("/design/projects", cannotLog, ...workHandlers);
        await screen.findByText(work.myProjects[0].title);
        expect(screen.queryByRole("button", { name: /log work/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /start timer/i })).toBeNull();
        expect(screen.queryByText(/^Today · /)).toBeNull();
    });
});

describe("logging work", () => {
    it("opens after the day's last entry, previews the overtime, saves the entry and undoes it", async () => {
        let body: Record<string, unknown> | null = null;
        const deleted: string[] = [];
        renderApp("/design/projects", sarah,
            http.delete("/api/work-entries/:id", ({ params }) => { deleted.push(String(params.id)); return new HttpResponse(null, { status: 204 }); }),
            http.post("/api/work-entries", async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ ...work.day.entries[0], id: 999, minutes: 60, startedAt: body.startedAt, endedAt: body.endedAt });
            }),
            ...workHandlers);

        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        // the overtime preview comes from the API
        const save = await within(dialog).findByRole("button", { name: "Log 1h 00m · 1h 00m overtime" });
        expect(within(dialog).getByText(/This (is all|includes) overtime/)).toBeInTheDocument();
        // a description is required by the domain's settings
        expect(save).toBeDisabled();

        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "Revised the lounge elevations");
        await userEvent.click(save);

        await waitFor(() => expect(body).not.toBeNull());
        expect(body).toMatchObject({
            projectId: work.myProjects[0].id,
            description: "Revised the lounge elevations",
            startedAt: "2026-09-28T15:00:00.000Z",
            endedAt: "2026-09-28T16:00:00.000Z",
            moves: [],
        });
        const logged = (await screen.findByText(`1h 00m logged on ${work.myProjects[0].title}`)).closest(".toast") as HTMLElement;
        expect(screen.queryByRole("dialog", { name: /log work/i })).toBeNull();
        // Undo still works with the form gone
        await userEvent.click(within(logged).getByRole("button", { name: "Undo" }));
        await waitFor(() => expect(deleted).toEqual(["999"]));
    });

    it("closes when someone else signs in from another tab", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        await logWindow();
        // the next refresh (the tabs share the cookie) comes back as another person
        server.use(
            http.get("/api/ping", () => HttpResponse.json({ code: "unauthenticated" }, { status: 401 }), { once: true }),
            http.get("/api/ping", () => HttpResponse.json({ ok: true })),
            http.post("/api/auth/refresh", () => HttpResponse.json({ accessToken: "other", accessTokenExpiresAt: "2030-01-01T00:00:00Z", user: { ...sarah, id: sarah.id + 100 } })),
        );
        await act(() => api.get("/ping"));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: /log work/i })).toBeNull());
    });

    it("says what is wrong next to the button, not in a toast", async () => {
        renderApp("/design/projects", sarah,
            http.post("/api/work-entries", () => HttpResponse.json({ type: "conflict", code: "work_entry_overlap", message: "This overlaps another entry." }, { status: 409 })),
            ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "Late drawings");
        await userEvent.click(await within(dialog).findByRole("button", { name: /^Log 1h 00m/ }));
        expect(await within(dialog).findByText("This overlaps another entry.")).toBeInTheDocument();
    });

    it("warns about an overlap before saving", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        const start = await within(dialog).findByLabelText("Start time");
        await userEvent.clear(start);
        await userEvent.type(start, "5:30pm{Enter}");
        expect(await within(dialog).findByText(/This overlaps with your entry/)).toBeInTheDocument();
    });

    it("opens from the search palette", async () => {
        renderApp("/design/projects", sarah, ...workHandlers,
            http.get("/api/search", () => HttpResponse.json({ projects: [], clients: [], people: [] })));
        await screen.findByRole("button", { name: "Account" });
        await userEvent.keyboard("{Control>}k{/Control}");
        await userEvent.click(await screen.findByText("Log work", { selector: ".cmdk-item span" }));
        expect(await logWindow()).toBeInTheDocument();
    });
});

describe("the timer", () => {
    it("fills in the times when stopped", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /start timer/i }));
        expect(await screen.findByText("Timer started")).toBeInTheDocument();
        // five minutes at the least, ending now
        vi.setSystemTime(new Date("2026-09-28T16:20:00Z"));
        await userEvent.click(await screen.findByRole("button", { name: /stop/i }));
        const dialog = await logWindow();
        expect(await within(dialog).findByRole("button", { name: /^Log 20m/ })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Start time")).toHaveValue("7:00 PM");
    });

    it("keeps the evening part of a timer stopped after midnight", async () => {
        // 11:30 PM in Beirut, stopped at 12:45 AM
        vi.setSystemTime(new Date("2026-09-28T20:30:00Z"));
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /start timer/i }));
        vi.setSystemTime(new Date("2026-09-28T21:45:00Z"));
        await userEvent.click(await screen.findByRole("button", { name: /stop/i }));
        const dialog = await logWindow();
        expect(await within(dialog).findByRole("button", { name: /^Log 1h 15m/ })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Start time")).toHaveValue("11:30 PM");
    });
});

describe("overtime on a day off", () => {
    it("opens on the usual slot, not from a working day's end that doesn't exist", async () => {
        // Saturday 3 October, 11 AM in Beirut: a day off, all of it overtime
        vi.setSystemTime(new Date("2026-10-03T08:00:00Z"));
        const off = { ...work.schedule.day, isWorkingDay: false, startMinute: null, endMinute: null, requiredMinutes: 0 };
        renderApp("/design/projects", sarah,
            http.get("/api/me/schedule", ({ request }) => HttpResponse.json({ ...work.schedule, day: { ...off, date: new URL(request.url).searchParams.get("date") } })),
            ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Log overtime" }));
        const dialog = await screen.findByRole("dialog", { name: "Log overtime" });
        expect(within(dialog).queryByText("That ends in the future")).toBeNull();
        // an empty day: the first hour of the usual day, as Log work opens on
        expect(within(dialog).getByLabelText("Start time")).toHaveValue("9:00 AM");
        expect(within(dialog).getByLabelText("End time")).toHaveValue("10:00 AM");
    });
});

describe("an employee's project", () => {
    it("shows their own hours and recent work, with logging when the project takes it", async () => {
        renderApp(`/design/projects/${work.project.id}`, sarah, ...workHandlers);
        expect(await screen.findByRole("heading", { name: work.project.title })).toBeInTheDocument();
        expect(await screen.findByText(`${work.projectWork.myEntries} entries`)).toBeInTheDocument();
        expect(screen.getByText("Your recent work")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /log work/i }).length).toBeGreaterThan(0);
    });

    it("says logging is closed on a project on hold", async () => {
        renderApp(`/design/projects/${work.project.id}`, sarah,
            http.get("/api/me/projects/:id/work", () => HttpResponse.json({ ...work.projectWork, acceptsWork: false })),
            http.get("/api/projects/:id", () => HttpResponse.json({ ...work.project, status: "hold" })),
            ...workHandlers);
        expect(await screen.findByText("Logging closed")).toBeInTheDocument();
        expect(screen.getByText("This project is on hold.")).toBeInTheDocument();
    });
});

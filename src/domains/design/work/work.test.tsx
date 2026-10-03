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

    it("offers New project to an employee given project:create, and opens it on their own page", async () => {
        renderApp("/design/projects", withPermissions(sarah, { grant: [P.PROJECT_CREATE] }), ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New project" }));
        expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Good evening, Sarah" })).toBeInTheDocument();
    });

    it("offers no New project without project:create", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        await screen.findByText(work.myProjects[0].title);
        expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
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
        // a description is required by the domain's settings, and pressing Log without one says so
        await userEvent.click(save);
        expect(within(dialog).getByText("Say what you worked on.")).toBeInTheDocument();
        expect(body).toBeNull();

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

describe("the Log work timeline", () => {
    const scale = (dialog: HTMLElement) => [...dialog.querySelectorAll(".dd .dt-scale > span:not(.dt-wd-tag)")].map((s) => s.textContent);
    const scheduled = (day: Partial<typeof work.schedule.day>) => http.get("/api/me/schedule", ({ request }) =>
        HttpResponse.json({ ...work.schedule, day: { ...work.schedule.day, ...day, date: new URL(request.url).searchParams.get("date") } }));
    const empty = http.get("/api/me/day", ({ request }) =>
        HttpResponse.json({ ...work.day, date: new URL(request.url).searchParams.get("date"), entries: [], meetings: [], loggedMinutes: 0, overtimeMinutes: 0 }));

    it("runs over the person's working hours that day, and the first log starts when the day does", async () => {
        // Monday 11:30 AM in Beirut, a day of 10 AM to 4 PM with nothing logged yet
        vi.setSystemTime(new Date("2026-09-28T08:30:00Z"));
        renderApp("/design/projects", sarah, scheduled({ startMinute: 600, endMinute: 960, requiredMinutes: 300 }), empty, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        expect(await within(dialog).findByLabelText("Start time")).toHaveValue("10:00 AM");
        const hours = scale(dialog);
        expect(hours[0]).toBe("10 AM");
        expect(hours[hours.length - 1]).toBe("4 PM");
    });

    it("stretches to the work logged outside them, and up to now once the day is over", async () => {
        // 7 PM: the fixture's 9 AM to 5 PM day has work up to 6 PM
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        await within(dialog).findByRole("button", { name: /^Furniture schedule,/ });
        const hours = scale(dialog);
        expect(hours[0]).toBe("9 AM");
        expect(hours[hours.length - 1]).toBe("7 PM");
    });

    it("shows 7 AM to 9 PM on a day off", async () => {
        // Saturday 3 October, 11 AM in Beirut
        vi.setSystemTime(new Date("2026-10-03T08:00:00Z"));
        renderApp("/design/projects", sarah, scheduled({ isWorkingDay: false, startMinute: null, endMinute: null, requiredMinutes: 0 }), empty, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        await within(dialog).findByLabelText("Start time");
        // fourteen hours, labelled every two
        expect(scale(dialog)).toEqual(["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM"]);
    });
});

describe("deleting a logged task on the Log work timeline", () => {
    async function openDay() {
        const sent: string[] = [];
        const posted: Record<string, unknown>[] = [];
        renderApp("/design/projects", sarah,
            http.delete("/api/work-entries/:id", ({ params }) => { sent.push(`delete ${params.id}`); return new HttpResponse(null, { status: 204 }); }),
            http.post("/api/work-entries/:id/restore", ({ params }) => { sent.push(`restore ${params.id}`); return HttpResponse.json(work.day.entries[0]); }),
            http.post("/api/work-entries", async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                posted.push(body);
                return HttpResponse.json({ ...work.day.entries[0], id: 999, minutes: 60, startedAt: body.startedAt, endedAt: body.endedAt });
            }),
            ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        const task = await within(dialog).findByRole("button", { name: /^Furniture schedule,/ });
        return { dialog, task, sent, posted };
    }
    const shown = (dialog: HTMLElement, name: RegExp) => within(dialog).queryByRole("button", { name });
    async function deleteByMenu(dialog: HTMLElement, name: RegExp) {
        await userEvent.pointer({ keys: "[MouseRight]", target: within(dialog).getByRole("button", { name }) });
        await userEvent.click(await screen.findByRole("menuitem", { name: "Delete this log" }));
    }
    const ctrlZ = () => userEvent.keyboard("{Control>}z{/Control}");

    it("offers Delete on a right-click, with no × on the task, and only takes it off the timeline", async () => {
        const { dialog, task, sent } = await openDay();
        expect(within(dialog).queryByTitle("Delete this log")).toBeNull();

        // Escape closes the menu only, not the window under it
        await userEvent.pointer({ keys: "[MouseRight]", target: task });
        expect(await screen.findByRole("menu", { name: "Logged task" })).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).toBeNull();
        expect(dialog).toBeInTheDocument();

        await deleteByMenu(dialog, /^Furniture schedule,/);
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();
        expect(within(dialog).getByText(/“Furniture schedule” is deleted when you save this log/)).toBeInTheDocument();
        expect(screen.queryByRole("menu")).toBeNull();
        expect(dialog).toBeInTheDocument();
        expect(sent).toEqual([]);
    });

    it("takes off a task selected with a double-click when Delete is pressed, and never one only clicked", async () => {
        const { dialog, task, sent } = await openDay();
        await userEvent.click(task);
        await userEvent.keyboard("{Delete}");
        expect(shown(dialog, /^Furniture schedule,/)).not.toBeNull();
        expect(task).toHaveAttribute("aria-pressed", "false");

        await userEvent.dblClick(task);
        expect(task).toHaveAttribute("aria-pressed", "true");
        await userEvent.keyboard("{Delete}");
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();
        expect(sent).toEqual([]);
    });

    it("selects a task with Enter from the keyboard, then Delete takes it off", async () => {
        const { dialog, task } = await openDay();
        act(() => task.focus());
        await userEvent.keyboard("{Backspace}");
        expect(shown(dialog, /^Furniture schedule,/)).not.toBeNull();
        await userEvent.keyboard("{Enter}");
        expect(task).toHaveAttribute("aria-pressed", "true");
        await userEvent.keyboard("{Backspace}");
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();
    });

    it("brings back the last one deleted with Ctrl+Z, but not while typing, and all of them on request", async () => {
        const { dialog } = await openDay();
        await deleteByMenu(dialog, /^Furniture schedule,/);
        await deleteByMenu(dialog, /^Space planning for level 3,/);
        expect(within(dialog).getByText(/2 logged tasks are deleted when you save this log/)).toBeInTheDocument();

        await ctrlZ();
        expect(shown(dialog, /^Space planning for level 3,/)).not.toBeNull();
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();

        // in the description, Ctrl+Z is the text's own
        await userEvent.click(within(dialog).getByLabelText("What did you work on?"));
        await ctrlZ();
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();

        await userEvent.click(within(dialog).getByRole("button", { name: "Bring it back" }));
        expect(shown(dialog, /^Furniture schedule,/)).not.toBeNull();
        expect(within(dialog).queryByText(/is deleted when you save/)).toBeNull();
    });

    it("deletes them with the save, in the same call; afterwards Ctrl+Z does nothing, and Undo puts them back", async () => {
        const { dialog, sent, posted } = await openDay();
        await deleteByMenu(dialog, /^Furniture schedule,/);
        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "Redid the schedule");
        await userEvent.click(within(dialog).getByRole("button", { name: /^Log 1h 00m/ }));

        await waitFor(() => expect(posted).toHaveLength(1));
        expect(posted[0]).toMatchObject({ description: "Redid the schedule", deletes: [74] });
        expect(sent).toEqual([]);
        await waitFor(() => expect(screen.queryByRole("dialog", { name: /log work/i })).toBeNull());

        await ctrlZ();
        expect(sent).toEqual([]);

        const logged = (await screen.findByText(/logged on/)).closest(".toast") as HTMLElement;
        await userEvent.click(within(logged).getByRole("button", { name: "Undo" }));
        await waitFor(() => expect(sent).toEqual(["delete 999", "restore 74"]));
    });

    it("works the same on the home page's Add logs timeline", async () => {
        const posted: Record<string, unknown>[] = [];
        const sent: string[] = [];
        renderApp("/design/projects", sarah,
            http.delete("/api/work-entries/:id", ({ params }) => { sent.push(`delete ${params.id}`); return new HttpResponse(null, { status: 204 }); }),
            http.post("/api/work-entries", async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                posted.push(body);
                return HttpResponse.json({ ...work.day.entries[0], id: 999, minutes: 60, startedAt: body.startedAt, endedAt: body.endedAt });
            }),
            ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add logs" }));
        const panel = (await screen.findByText(/^Add logs · /)).closest(".panel") as HTMLElement;
        await deleteByMenu(panel, /^Furniture schedule,/);
        expect(shown(panel, /^Furniture schedule,/)).toBeNull();
        await ctrlZ();
        expect(shown(panel, /^Furniture schedule,/)).not.toBeNull();
        await deleteByMenu(panel, /^Furniture schedule,/);

        await userEvent.type(within(panel).getByLabelText("What did you work on?"), "Redid the schedule");
        await userEvent.click(within(panel).getByRole("button", { name: "Add log" }));
        await waitFor(() => expect(posted).toHaveLength(1));
        expect(posted[0]).toMatchObject({ deletes: [74] });
        expect(sent).toEqual([]);
    });

    it("deletes nothing when the window is closed without saving", async () => {
        const { dialog, sent, posted } = await openDay();
        await deleteByMenu(dialog, /^Furniture schedule,/);
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: /log work/i })).toBeNull());
        expect(sent).toEqual([]);
        expect(posted).toEqual([]);
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

    it("fills in the minute it started and the minute it stopped, not a rounded length", async () => {
        // started at 7:00:10 PM, stopped at 7:06:50 PM: the clock read 7:00 and 7:06
        vi.setSystemTime(new Date("2026-09-28T16:00:10Z"));
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /start timer/i }));
        vi.setSystemTime(new Date("2026-09-28T16:06:50Z"));
        await userEvent.click(await screen.findByRole("button", { name: /stop/i }));
        const dialog = await logWindow();
        expect(await within(dialog).findByRole("button", { name: /^Log 6m/ })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Start time")).toHaveValue("7:00 PM");
        expect(within(dialog).getByLabelText("End time")).toHaveValue("7:06 PM");
        expect(within(dialog).queryByText(/Your timer ran/)).toBeNull();
    });

    it("logs a run shorter than an entry's 5 minutes as 5, and says so", async () => {
        vi.setSystemTime(new Date("2026-09-28T16:00:00Z"));
        renderApp("/design/projects", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /start timer/i }));
        vi.setSystemTime(new Date("2026-09-28T16:01:05Z"));
        await userEvent.click(await screen.findByRole("button", { name: /stop/i }));
        const dialog = await logWindow();
        expect(await within(dialog).findByRole("button", { name: /^Log 5m/ })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("End time")).toHaveValue("7:05 PM");
        expect(within(dialog).getByText(/Your timer ran 1m\. An entry is at least 5 minutes, so it is logged as 5/)).toBeInTheDocument();
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
        expect(screen.getByText(/new work entries are paused until it resumes/)).toBeInTheDocument();
    });
});

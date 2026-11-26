import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http as api } from "@/api/http";
import { P } from "@/app/permissions/codes";
import { projectHandlers } from "@/test/fixtures";
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
    vi.unstubAllGlobals();
    localStorage.clear();
});

const logWindow = () => screen.findByRole("dialog", { name: /log work/i });

describe("the Design employee home", () => {
    it("is Log hours: their week, today, overtime and how many projects they have", async () => {
        renderApp("/design/log-hours", sarah, ...workHandlers);
        expect(await screen.findByRole("heading", { name: "Good evening, Sarah" })).toBeInTheDocument();
        const active = work.myProjects.filter((p) => p.status === "active").length;
        expect(await screen.findByText(new RegExp(`${active} active projects`))).toBeInTheDocument();
        expect(screen.getByText(/^Today · /)).toBeInTheDocument();
        expect(screen.getByText("Overtime")).toBeInTheDocument();
        // overtime is logged with Log work, like any work
        expect(screen.queryByRole("button", { name: "Log overtime" })).toBeNull();
        // the hours balance is on their profile
        expect(screen.queryByText("Hours balance")).toBeNull();
    });

    it("offers New project to an employee given project:create, and opens it on the Projects page", async () => {
        renderApp("/design/log-hours", withPermissions(sarah, { grant: [P.PROJECT_CREATE] }), ...workHandlers, ...projectHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "New project" }));
        expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    });

    it("offers no New project without project:create", async () => {
        renderApp("/design/log-hours", sarah, ...workHandlers);
        await screen.findByRole("heading", { name: "Good evening, Sarah" });
        expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
    });

    it("offers no logging to someone without work_entry:create", async () => {
        renderApp("/design/log-hours", cannotLog, ...workHandlers);
        await screen.findByRole("heading", { name: "Good evening, Sarah" });
        expect(screen.queryByRole("button", { name: /log work/i })).toBeNull();
        expect(screen.queryByRole("button", { name: /start timer/i })).toBeNull();
        expect(screen.queryByText(/^Today · /)).toBeNull();
    });
});

describe("logging work", () => {
    it("opens after the day's last entry, previews the overtime, saves the entry and undoes it", async () => {
        let body: Record<string, unknown> | null = null;
        const deleted: string[] = [];
        renderApp("/design/log-hours", sarah,
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
        // said once, on the timeline's label: no banner under it
        expect(within(dialog).queryByText(/This (is all|includes) overtime/)).toBeNull();
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
        // the window stays open for the next log: it says what went in, and the description is empty again
        expect(screen.getByRole("dialog", { name: /log work/i })).toBe(dialog);
        expect(within(dialog).getByRole("status")).toHaveTextContent(`1h 00m logged on ${work.myProjects[0].title}`);
        expect(within(dialog).getByLabelText("What did you work on?")).toHaveValue("");
        // Undo works from the toast too
        await userEvent.click(within(logged).getByRole("button", { name: "Undo" }));
        await waitFor(() => expect(deleted).toEqual(["999"]));
    });

    it("stays open after a log, so the next one starts where it ended", async () => {
        const bodies: Record<string, unknown>[] = [];
        renderApp("/design/log-hours", sarah,
            http.post("/api/work-entries", async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                bodies.push(body);
                return HttpResponse.json({ ...work.day.entries[0], id: 990 + bodies.length, minutes: 60, startedAt: body.startedAt, endedAt: body.endedAt });
            }),
            ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "Lounge elevations");
        await userEvent.click(await within(dialog).findByRole("button", { name: /^Log / }));
        await waitFor(() => expect(bodies).toHaveLength(1));

        await waitFor(() => expect(within(dialog).getByLabelText("What did you work on?")).toHaveValue(""));
        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "Kitchen joinery");
        await userEvent.click(await within(dialog).findByRole("button", { name: /^Log / }));
        await waitFor(() => expect(bodies).toHaveLength(2));
        expect(bodies[1]).toMatchObject({ description: "Kitchen joinery", startedAt: bodies[0].endedAt });
        // and it closes as before when they're done
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: /log work/i })).toBeNull());
    });

    it("closes when someone else signs in from another tab", async () => {
        renderApp("/design/log-hours", sarah, ...workHandlers);
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
        renderApp("/design/log-hours", sarah,
            http.post("/api/work-entries", () => HttpResponse.json({ type: "conflict", code: "work_entry_overlap", message: "This overlaps another entry." }, { status: 409 })),
            ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "Late drawings");
        await userEvent.click(await within(dialog).findByRole("button", { name: /^Log 1h 00m/ }));
        expect(await within(dialog).findByText("This overlaps another entry.")).toBeInTheDocument();
    });

    it("warns about an overlap before saving", async () => {
        renderApp("/design/log-hours", sarah, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        const start = await within(dialog).findByLabelText("Start time");
        await userEvent.clear(start);
        await userEvent.type(start, "5:30pm{Enter}");
        expect(await within(dialog).findByText(/This overlaps with your entry/)).toBeInTheDocument();
    });

    it("opens from the search palette", async () => {
        renderApp("/design/log-hours", sarah, ...workHandlers,
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
        renderApp("/design/log-hours", sarah, scheduled({ startMinute: 600, endMinute: 960, requiredMinutes: 300 }), empty, ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        expect(await within(dialog).findByLabelText("Start time")).toHaveValue("10:00 AM");
        const hours = scale(dialog);
        expect(hours[0]).toBe("10 AM");
        expect(hours[hours.length - 1]).toBe("4 PM");
    });

    it("stretches to the work logged outside them, and up to now once the day is over", async () => {
        // 7 PM: the fixture's 9 AM to 5 PM day has work up to 6 PM
        renderApp("/design/log-hours", sarah, ...workHandlers);
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
        renderApp("/design/log-hours", sarah, scheduled({ isWorkingDay: false, startMinute: null, endMinute: null, requiredMinutes: 0 }), empty, ...workHandlers);
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
        renderApp("/design/log-hours", sarah,
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

    it("takes off a task selected with a click when Delete is pressed, and never one only focused", async () => {
        const { dialog, task, sent } = await openDay();
        act(() => task.focus());
        await userEvent.keyboard("{Delete}");
        expect(shown(dialog, /^Furniture schedule,/)).not.toBeNull();
        expect(task).toHaveAttribute("aria-pressed", "false");

        await userEvent.click(task);
        expect(task).toHaveAttribute("aria-pressed", "true");
        await userEvent.keyboard("{Delete}");
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();
        expect(within(dialog).getByText(/“Furniture schedule” is deleted when you save this log/)).toBeInTheDocument();
        expect(sent).toEqual([]);
    });

    it("on a phone, offers Delete when a finger is held on a task", async () => {
        vi.stubGlobal("matchMedia", (query: string) => ({
            matches: query === "(pointer: coarse)", addEventListener: () => {}, removeEventListener: () => {},
        }));
        const { dialog, task, sent } = await openDay();
        // the timeline lists no markers or keys under it
        expect(within(dialog).queryByText(/drag to move/)).toBeNull();
        expect(within(dialog).queryByText(/Keyboard:/)).toBeNull();

        await userEvent.pointer({ keys: "[TouchA>]", target: task });
        await userEvent.click(await screen.findByRole("menuitem", { name: "Delete this log" }));
        expect(shown(dialog, /^Furniture schedule,/)).toBeNull();
        const gone = within(dialog).getByText(/“Furniture schedule” is deleted when you save this log/);
        expect(gone.textContent).not.toMatch(/Ctrl/);
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
        // the window stays open, ready for the next log
        await waitFor(() => expect(within(dialog).getByLabelText("What did you work on?")).toHaveValue(""));

        await ctrlZ();
        expect(sent).toEqual([]);

        const logged = (await screen.findByText(/logged on/)).closest(".toast") as HTMLElement;
        await userEvent.click(within(logged).getByRole("button", { name: "Undo" }));
        await waitFor(() => expect(sent).toEqual(["delete 999", "restore 74"]));
    });

    it("saves the changes alone when no new log is written: the button says Save changes", async () => {
        const { dialog, sent, posted } = await openDay();
        await deleteByMenu(dialog, /^Furniture schedule,/);
        await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

        await waitFor(() => expect(sent).toEqual(["delete 74"]));
        expect(posted).toEqual([]);
        expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    });

    it("logs work as outside the original scope when its box is ticked", async () => {
        let body: Record<string, unknown> | null = null;
        renderApp("/design/log-hours", sarah,
            http.post("/api/work-entries", async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ ...work.day.entries[0], id: 999, minutes: 60, startedAt: body.startedAt, endedAt: body.endedAt, outsideScope: true });
            }),
            ...workHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: "Log work" }))[0]);
        const dialog = await logWindow();
        const scope = within(dialog).getByRole("checkbox", { name: /Outside the original scope/ });
        expect(scope).not.toBeChecked();
        // what was done fits in 300 characters
        expect(within(dialog).getByLabelText("What did you work on?")).toHaveAttribute("maxlength", "300");
        await userEvent.type(within(dialog).getByLabelText("What did you work on?"), "The guest house the client added");
        await userEvent.click(scope);
        await userEvent.click(await within(dialog).findByRole("button", { name: /^Log / }));
        await waitFor(() => expect(body).toMatchObject({ description: "The guest house the client added", outsideScope: true }));
    });

    it("opens Log work from the home page's Add logs, and from a click on its day", async () => {
        renderApp("/design/log-hours", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add logs" }));
        await userEvent.click(within(await logWindow()).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: /log work/i })).toBeNull());
        // the day stays a preview: a click on it opens the same window
        expect(screen.queryByText(/^Add logs · /)).toBeNull();
        await userEvent.click(screen.getByTitle("Log work for today"));
        expect(await logWindow()).toBeInTheDocument();
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
        renderApp("/design/log-hours", sarah, ...workHandlers);
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
        renderApp("/design/log-hours", sarah, ...workHandlers);
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
        renderApp("/design/log-hours", sarah, ...workHandlers);
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
        renderApp("/design/log-hours", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("button", { name: /start timer/i }));
        vi.setSystemTime(new Date("2026-09-28T21:45:00Z"));
        await userEvent.click(await screen.findByRole("button", { name: /stop/i }));
        const dialog = await logWindow();
        expect(await within(dialog).findByRole("button", { name: /^Log 1h 15m/ })).toBeInTheDocument();
        expect(within(dialog).getByLabelText("Start time")).toHaveValue("11:30 PM");
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

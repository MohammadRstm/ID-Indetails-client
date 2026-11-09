import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schemas } from "@/api/types";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { companyHandlers } from "@/test/fixtures/company";
import { overviewHandlers } from "@/test/fixtures/overview";
import { settings } from "@/test/fixtures/settings";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

type Row = Schemas["EmployeeSummaryResponse"];

const rana = personas.superAdmin;
const nadia = personas.designAdmin;
const sarah: Row = { ...settings.superAdmins[0], id: 4, firstName: "Sarah", lastName: "Haddad", email: "sarah@id-indetails.test", role: "employee", domain: "design", status: "active" };
const omar: Row = { ...settings.superAdmins[0], id: 6, firstName: "Omar", lastName: "Fares", email: "omar@id-indetails.test", role: "admin", domain: "execution", status: "active" };
const people = http.get("/api/employees", () => HttpResponse.json({ items: [sarah, omar], page: 1, pageSize: 100, totalCount: 2 }));

/** A general meeting: no project, with its people. */
const general: Schemas["MeetingResponse"] = {
    ...fixtures.meetings[12], id: 90, project: null, domain: null, topic: "Partners' review",
    attendees: [{ id: 4, name: "Sarah Haddad" }],
};

// Wednesday 30 September 2026, 9 AM in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T06:00:00Z"));
    localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("General meetings", () => {
    it("are set by a super admin from the company overview, for the whole company by default", async () => {
        const sent: unknown[] = [];
        renderApp("/company/overview?tab=meetings", rana,
            people,
            http.get("/api/meetings", () => HttpResponse.json([...fixtures.meetings, general])),
            http.post("/api/meetings", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(general, { status: 201 }); }),
            ...companyHandlers, ...projectHandlers);
        expect(await screen.findByRole("tab", { name: "Meetings", selected: true })).toBeInTheDocument();
        // a general meeting shows its people, not a project
        const row = (await screen.findByText("Partners' review")).closest(".mtg-row") as HTMLElement;
        expect(within(row).getByText("General meeting")).toBeInTheDocument();
        expect(within(row).getByText("Sarah Haddad")).toBeInTheDocument();

        await userEvent.click(screen.getAllByRole("button", { name: /new meeting/i })[0]);
        const dialog = await screen.findByRole("dialog", { name: "New meeting" });
        expect(within(dialog).getByLabelText("About")).toHaveTextContent("General meeting");
        expect(within(dialog).getByLabelText("For")).toHaveTextContent("The whole company");
        await userEvent.type(within(dialog).getByLabelText("Topic"), "Partners' review");
        await userEvent.click(within(dialog).getByRole("button", { name: "Schedule meeting" }));
        expect(within(dialog).getByText("Choose who the meeting is with.")).toBeInTheDocument();

        await userEvent.click(within(dialog).getByLabelText("Attendees"));
        await userEvent.click(screen.getByRole("button", { name: /Sarah Haddad/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Schedule meeting" }));
        await waitFor(() => expect(sent).toEqual([expect.objectContaining({ topic: "Partners' review", domain: null, attendeeIds: [4] })]));
    });

    it("show who is on time off that day, and don't let them be picked", async () => {
        const asked: URLSearchParams[] = [];
        const sent: unknown[] = [];
        renderApp("/company/overview?tab=meetings", rana,
            people,
            http.get("/api/time-off/away", ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return HttpResponse.json([{ userId: 4, firstDay: "2026-09-29", lastDay: "2026-10-02" }]);
            }),
            http.get("/api/meetings", () => HttpResponse.json(fixtures.meetings)),
            http.post("/api/meetings", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(general, { status: 201 }); }),
            ...companyHandlers, ...projectHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: /new meeting/i }))[0]);
        const dialog = await screen.findByRole("dialog", { name: "New meeting" });
        await userEvent.click(within(dialog).getByLabelText("Attendees"));
        const away = await screen.findByRole("button", { name: /Sarah Haddad/ });
        await waitFor(() => expect(away).toBeDisabled());
        expect(away).toHaveAttribute("title", "On time off that day");
        expect(within(away).getByText("Off")).toBeInTheDocument();
        expect(asked.some((q) => q.get("from") === "2026-09-30" && q.get("to") === "2026-09-30")).toBe(true);

        // someone who is in, is not blocked
        expect(screen.getByRole("button", { name: /Omar Fares/ })).toBeEnabled();
        await userEvent.click(away);
        await userEvent.click(screen.getByRole("button", { name: /Omar Fares/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Schedule meeting" }));
        await waitFor(() => expect(sent).toEqual([expect.objectContaining({ attendeeIds: [6] })]));
    });

    it("show the API's refusal when someone on time off was added anyway", async () => {
        renderApp("/company/overview?tab=meetings", rana,
            people,
            http.get("/api/meetings", () => HttpResponse.json(fixtures.meetings)),
            http.post("/api/meetings", () => HttpResponse.json({ type: "unprocessable", code: "meeting_attendee_off", message: "Sarah Haddad is on time off that day." }, { status: 422 })),
            ...companyHandlers, ...projectHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: /new meeting/i }))[0]);
        const dialog = await screen.findByRole("dialog", { name: "New meeting" });
        await userEvent.click(within(dialog).getByLabelText("Attendees"));
        await userEvent.click(await screen.findByRole("button", { name: /Sarah Haddad/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Schedule meeting" }));
        expect(await within(dialog).findByText("Sarah Haddad is on time off that day.")).toBeInTheDocument();
    });

    it("are a tab of a domain admin's overview", async () => {
        renderApp("/design/overview", nadia, ...overviewHandlers, ...companyHandlers, ...projectHandlers);
        expect(await screen.findByRole("tab", { name: "Meetings" })).toBeInTheDocument();
    });

    it("aren't a tab of a domain's overview for a super admin, who has them on the company overview", async () => {
        renderApp("/design/overview", rana, ...overviewHandlers, ...companyHandlers, ...projectHandlers);
        expect(await screen.findByRole("heading", { name: /Good morning/ })).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Meetings" })).not.toBeInTheDocument();
    });

    it("can be about an active project instead, which has no attendees", async () => {
        const [active, other] = fixtures.projects.items;
        const held = { ...other, title: "Paused villa", status: "hold" as const };
        const sent: { path: string; body: unknown }[] = [];
        renderApp("/design/overview?tab=meetings", nadia,
            people,
            http.get("/api/projects", () => HttpResponse.json({ ...fixtures.projects, items: [active, held], totalCount: 2 })),
            http.post("/api/projects/:id/meetings", async ({ request }) => {
                sent.push({ path: new URL(request.url).pathname, body: await request.json() });
                return HttpResponse.json(fixtures.meetings[0], { status: 201 });
            }),
            ...overviewHandlers, ...companyHandlers, ...projectHandlers);
        await userEvent.click((await screen.findAllByRole("button", { name: /new meeting/i }))[0]);
        const dialog = await screen.findByRole("dialog", { name: "New meeting" });
        // an admin's general meeting belongs to their own business
        expect(within(dialog).queryByLabelText("For")).not.toBeInTheDocument();

        await userEvent.click(within(dialog).getByLabelText("About"));
        expect(screen.queryByRole("option", { name: "Paused villa" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("option", { name: active.title }));
        expect(within(dialog).queryByLabelText("Attendees")).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Schedule meeting" }));
        await waitFor(() => expect(sent.map((s) => s.path)).toEqual([`/api/projects/${active.id}/meetings`]));
    });
});

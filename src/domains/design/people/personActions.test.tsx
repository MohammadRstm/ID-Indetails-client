import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { people, peopleHandlers } from "@/test/fixtures/people";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const yara = people.employee;
const as = (patch: Partial<typeof yara>) => http.get("/api/employees/:id", () => HttpResponse.json({ ...yara, ...patch }));
const teams = http.get("/api/teams", () => HttpResponse.json([{ id: 20, name: "Site", domain: "execution" }, { id: 13, name: "Interiors", domain: "design" }]));

function recording(method: "post" | "put", path: string) {
    const sent: unknown[] = [];
    const handler = http[method](path, async ({ request }) => { sent.push(await request.json().catch(() => null)); return HttpResponse.json(yara); });
    return { sent, handler };
}

async function menu() {
    await userEvent.click(await screen.findByRole("button", { name: "More actions" }));
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Someone's account", () => {
    it("can be deactivated from a last working day", async () => {
        const { sent, handler } = recording("post", "/api/employees/:id/deactivate");
        renderApp("/design/people/9", rana, handler, ...peopleHandlers);
        await menu();
        expect(screen.getByRole("button", { name: "Change role…" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Move to Execution…" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Deactivate…" }));
        const dialog = await screen.findByRole("dialog", { name: "Deactivate account" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
        await waitFor(() => expect(sent).toEqual([{ lastWorkingDay: "2026-09-30" }]));
        expect(await screen.findByText(/deactivated$/)).toBeInTheDocument();
    });

    it("can be given another role", async () => {
        const { sent, handler } = recording("put", "/api/employees/:id/role");
        renderApp("/design/people/9", rana, handler, ...peopleHandlers);
        await menu();
        await userEvent.click(screen.getByRole("button", { name: "Change role…" }));
        const dialog = await screen.findByRole("dialog", { name: "Change role" });
        await userEvent.click(within(dialog).getByRole("tab", { name: "Admin" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Make admin" }));
        await waitFor(() => expect(sent).toEqual([{ role: "admin", domainCode: null }]));
    });

    it("can be given another role with a new position, which starts as the current one", async () => {
        const { sent, handler } = recording("put", "/api/employees/:id/role");
        renderApp("/design/people/9", rana, handler, as({ position: "Junior designer" }), ...peopleHandlers);
        await menu();
        await userEvent.click(screen.getByRole("button", { name: "Change role…" }));
        const dialog = await screen.findByRole("dialog", { name: "Change role" });
        const position = within(dialog).getByLabelText("Position");
        await waitFor(() => expect(position).toHaveValue("Junior designer"));
        await userEvent.click(within(dialog).getByRole("tab", { name: "Admin" }));
        await userEvent.clear(position);
        await userEvent.type(position, "Studio lead");
        await userEvent.click(within(dialog).getByRole("button", { name: "Make admin" }));
        await waitFor(() => expect(sent).toEqual([{ role: "admin", domainCode: null, position: "Studio lead" }]));
    });

    it("can be moved to the other business, into one of its teams", async () => {
        const { sent, handler } = recording("put", "/api/employees/:id/domain");
        renderApp("/design/people/9", rana, handler, teams, ...peopleHandlers);
        await menu();
        await userEvent.click(screen.getByRole("button", { name: "Move to Execution…" }));
        const dialog = await screen.findByRole("dialog", { name: "Move to Execution" });
        await userEvent.click(within(dialog).getByLabelText("Team"));
        await userEvent.click(await screen.findByRole("option", { name: "Site" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Move to Execution" }));
        await waitFor(() => expect(sent).toEqual([{ domainCode: "execution", teamId: 20 }]));
    });

    it("can be reactivated, asking whether time away this month is paid", async () => {
        const { sent, handler } = recording("post", "/api/employees/:id/reactivate");
        renderApp("/design/people/9", rana, handler, as({ status: "deactivated", leftOn: "2026-09-15" }), ...peopleHandlers);
        expect(await screen.findByText("Left Sep 15, 2026")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
        await menu();
        expect(screen.queryByRole("button", { name: "Deactivate…" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Reactivate…" }));
        const dialog = await screen.findByRole("dialog", { name: "Reactivate account" });
        await userEvent.click(within(dialog).getByRole("tab", { name: "Paid" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Reactivate" }));
        await waitFor(() => expect(sent).toEqual([{ payGap: true }]));
    });

    it("is reactivated without asking about pay when they left today", async () => {
        const { sent, handler } = recording("post", "/api/employees/:id/reactivate");
        renderApp("/design/people/9", rana, handler, as({ status: "deactivated", leftOn: "2026-09-30" }), ...peopleHandlers);
        await menu();
        await userEvent.click(screen.getByRole("button", { name: "Reactivate…" }));
        const dialog = await screen.findByRole("dialog", { name: "Reactivate account" });
        expect(within(dialog).queryByRole("tab", { name: "Paid" })).not.toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Reactivate" }));
        await waitFor(() => expect(sent).toEqual([{}]));
    });

    it("can't be changed, messaged or given permissions by its own holder", async () => {
        renderApp("/design/people/1", rana, as({ id: 1, role: "admin" }), ...peopleHandlers);
        expect(await screen.findByRole("button", { name: "Edit profile" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Permissions" })).not.toBeInTheDocument();
    });

    it("gets a fresh invitation while they haven't signed up", async () => {
        const sent: string[] = [];
        renderApp("/design/people/9", personas.designAdmin, as({ status: "invited" }),
            http.post("/api/invitations/:id/resend", ({ params }) => { sent.push(String(params.id)); return HttpResponse.json({}); }),
            ...peopleHandlers);
        await menu();
        await userEvent.click(screen.getByRole("button", { name: "Resend invitation" }));
        await waitFor(() => expect(sent).toEqual(["9"]));
        expect(await screen.findByText("Invitation sent again")).toBeInTheDocument();
    });

    it("stays in its business for an admin who sees only one", async () => {
        renderApp("/design/people/9", personas.designAdmin, ...peopleHandlers);
        await menu();
        expect(screen.getByRole("button", { name: "Deactivate…" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Move to/ })).not.toBeInTheDocument();
    });

    it("can have every session ended by a super admin, and sign-in restored", async () => {
        const ended = recording("post", "/api/employees/:id/sessions/end");
        renderApp("/design/people/9", rana, ended.handler, ...peopleHandlers);
        await menu();
        expect(screen.queryByRole("button", { name: "Restore sign-in…" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "End all sessions…" }));
        const dialog = await screen.findByRole("dialog", { name: "End all sessions" });
        expect(within(dialog).getByText(/can't sign in again, even with the right password/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "End sessions" }));
        await waitFor(() => expect(ended.sent).toHaveLength(1));
        expect(await screen.findByText(`${yara.firstName} ${yara.lastName} is signed out everywhere`)).toBeInTheDocument();
    });

    it("shows a suspended sign-in, which a super admin restores", async () => {
        const restored = recording("post", "/api/employees/:id/sessions/restore");
        renderApp("/design/people/9", rana, as({ sessionsRevokedAt: "2026-09-29T10:00:00Z" }), restored.handler, ...peopleHandlers);
        expect(await screen.findByText("Sign-in suspended since Sep 29, 2026")).toBeInTheDocument();
        await menu();
        expect(screen.queryByRole("button", { name: "End all sessions…" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Restore sign-in…" }));
        await userEvent.click(within(await screen.findByRole("dialog", { name: "Restore sign-in" })).getByRole("button", { name: "Restore sign-in" }));
        await waitFor(() => expect(restored.sent).toHaveLength(1));
    });

    it("leaves sessions to whoever holds session:manage", async () => {
        renderApp("/design/people/9", personas.designAdmin, as({ sessionsRevokedAt: "2026-09-29T10:00:00Z" }), ...peopleHandlers);
        await menu();
        expect(screen.getByRole("button", { name: "Deactivate…" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "End all sessions…" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Restore sign-in…" })).not.toBeInTheDocument();
    });

    it("lets someone given session:manage end sessions without managing the account", async () => {
        renderApp("/design/people/9", withPermissions(personas.designAdmin, { grant: [P.SESSION_MANAGE], revoke: [P.EMPLOYEE_MANAGE] }), ...peopleHandlers);
        await menu();
        expect(screen.getByRole("button", { name: "End all sessions…" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Deactivate…" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Change role…" })).not.toBeInTheDocument();
    });

    it("is out of reach without employee:manage", async () => {
        renderApp("/design/people/9", withPermissions(personas.designAdmin, { revoke: [P.EMPLOYEE_MANAGE] }), ...peopleHandlers);
        expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    });

    it("sends a message through the chat with them", async () => {
        renderApp("/design/people/9", rana, ...peopleHandlers,
            http.get("/api/messages/conversations", () => HttpResponse.json([])),
            http.get("/api/messages/contacts", () => HttpResponse.json([])),
            http.get("/api/messages/direct/:id", () => HttpResponse.json({ items: [], hasMore: false })),
            http.post("/api/messages/:type/:id/read", () => HttpResponse.json({ unread: 0, mention: false })),
            http.get("/api/presence", () => HttpResponse.json({ online: [] })));
        await userEvent.click(await screen.findByRole("button", { name: "Send message" }));
        await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/design/messages?with=9"));
    });
});

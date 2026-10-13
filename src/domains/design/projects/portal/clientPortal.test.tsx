import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { PortalClient, PortalClients } from "./clientAccessApi";

const nadia = personas.designAdmin;
const page = `/design/projects/${projectWork.project.id}`;
// the Client access part of the tab; the tab itself opens on the first section
const access = `${page}?tab=portal&part=access`;
const tabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, "").trim());
// the row, not the toast that may repeat the address
const rowOf = (email: string) => screen.getAllByText(email).map((e) => e.closest(".pa-row")).find(Boolean) as HTMLElement;

const none: PortalClient = {
    email: "", label: null, isContact: true, status: "not_invited", accountId: null, name: null, invitationId: null, invitedAt: null,
    invitationExpiresAt: null, accessId: null, accessGrantedAt: null, accessEndedAt: null, lastSeenAt: null,
};
const list = (clients: Partial<PortalClient>[], cannotInviteReason: string | null = null): PortalClients => ({
    projectId: projectWork.project.id, cannotInviteReason, clients: clients.map((c) => ({ ...none, ...c })),
});
const contacts = list([
    { email: "mounir@client.test", label: "Owner" },
    { email: "rania@client.test", status: "active", accountId: 7, name: "Rania Aoun", accessId: 3, accessGrantedAt: "2026-09-20T09:00:00Z", lastSeenAt: "2026-09-29T09:00:00Z" },
    { email: "office@client.test", status: "invited", accountId: 8, invitationId: 11, invitedAt: "2026-09-30T08:00:00Z", invitationExpiresAt: "2026-10-01T08:00:00Z" },
]);
const listed = (body: PortalClients) => http.get("/api/projects/:id/portal/clients", () => HttpResponse.json(body));

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("a Design project's Client portal tab", () => {
    it("lists the client's contacts and where each one stands", async () => {
        renderApp(access, nadia, listed(contacts), ...projectWorkHandlers);
        expect(await screen.findByText("Client portal access")).toBeInTheDocument();
        expect(within(rowOf("mounir@client.test")).getByText("Not invited")).toBeInTheDocument();
        expect(within(rowOf("rania@client.test")).getByText("Has access")).toBeInTheDocument();
        expect(within(rowOf("office@client.test")).getByText("Invited")).toBeInTheDocument();
        expect(within(rowOf("mounir@client.test")).getByRole("button", { name: "Invite" })).toBeInTheDocument();
        expect(within(rowOf("rania@client.test")).getByRole("button", { name: "End access" })).toBeInTheDocument();
        expect(within(rowOf("office@client.test")).getByRole("button", { name: "Resend" })).toBeInTheDocument();
        expect(within(rowOf("office@client.test")).getByRole("button", { name: "Cancel invitation" })).toBeInTheDocument();
    });

    it("invites a contact and shows the answer the server gives back", async () => {
        const sent: unknown[] = [];
        renderApp(access, nadia, listed(contacts), ...projectWorkHandlers,
            http.post("/api/projects/:id/portal/invitations", async ({ request }) => {
                sent.push(await request.json());
                return HttpResponse.json(list([
                    { email: "mounir@client.test", label: "Owner", status: "invited", accountId: 9, invitationId: 12, invitedAt: "2026-09-30T09:00:00Z", invitationExpiresAt: "2026-10-01T09:00:00Z" },
                ]));
            }));
        await userEvent.click(within(await screen.findByText("mounir@client.test").then((e) => e.closest("li") as HTMLElement)).getByRole("button", { name: "Invite" }));
        expect(await within(rowOf("mounir@client.test")).findByText("Invited")).toBeInTheDocument();
        expect(sent).toEqual([{ email: "mounir@client.test" }]);
    });

    it("asks before ending a client's access", async () => {
        const ended: string[] = [];
        renderApp(access, nadia, listed(contacts), ...projectWorkHandlers,
            http.post("/api/projects/:id/portal/access/:accessId/revoke", ({ params }) => {
                ended.push(String(params.accessId));
                return HttpResponse.json(list([{ email: "rania@client.test", status: "access_ended", accountId: 7, accessId: 3, accessEndedAt: "2026-09-30T09:00:00Z" }]));
            }));
        await screen.findByText("rania@client.test");
        await userEvent.click(within(rowOf("rania@client.test")).getByRole("button", { name: "End access" }));
        const dialog = screen.getByRole("dialog", { name: "End this client's access?" });
        expect(ended).toEqual([]);
        await userEvent.click(within(dialog).getByRole("button", { name: "End access" }));
        expect(await within(rowOf("rania@client.test")).findByText("Access ended")).toBeInTheDocument();
        expect(ended).toEqual(["3"]);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("says why no one can be invited, and offers no invite", async () => {
        renderApp(access, nadia, listed(list([{ email: "mounir@client.test" }], "The project is archived.")), ...projectWorkHandlers);
        expect(await screen.findByText("The project is archived.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    });

    it("isn't there without client_access:manage or client_portal:manage, even by link", async () => {
        renderApp(`${page}?tab=portal`, withPermissions(nadia, { revoke: [P.CLIENT_ACCESS_MANAGE, P.CLIENT_PORTAL_MANAGE] }), ...projectWorkHandlers);
        expect(await screen.findByText("Total hours")).toBeInTheDocument();
        expect(tabs()).not.toContain("Client portal");
    });

    it("isn't there on an internal project", async () => {
        // ahead of the fixture's own project, so it answers first
        renderApp(page, nadia, http.get("/api/projects/:id", () => HttpResponse.json({ ...projectWork.project, billingType: "internal", client: null })), ...projectWorkHandlers);
        await screen.findAllByRole("tab");
        expect(tabs()).not.toContain("Client portal");
    });
});

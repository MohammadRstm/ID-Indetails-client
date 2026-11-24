import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { message, messageHandlers, messages, people } from "@/test/fixtures/messages";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { ChatGroup, ChatGroupDetail, Contact, Conversation } from "./messagesApi";

const rana = personas.superAdmin;
const sarah = personas.designEmployee;
const sidebar = () => document.querySelector(".msg-sidebar") as HTMLElement;
const thread = () => document.querySelector(".msg-thread") as HTMLElement;

const me = { id: 1, name: "Rana Khoury", role: "super_admin", domain: null, position: "Managing director", team: null, photoFileId: null } as Contact;
const siteLeads: ChatGroup = { id: 40, name: "Site leads", photoFileId: null, memberCount: 3 };
const created = message(401, me, "created the group “Site leads”", "2026-09-30T07:00:00Z", { kind: "group_event" });
const pour = message(402, people.tarek, "Pour on Monday", "2026-09-30T07:30:00Z");
const groupChat: Conversation = { type: "custom_group", team: null, person: null, group: siteLeads, lastMessage: pour, unread: 0, unreadMention: false, onlineCount: 0 };
const members = [me, people.sarah, people.tarek];
const detail: ChatGroupDetail = { id: 40, name: "Site leads", photoFileId: null, members, isMember: true, createdAt: "2026-09-30T07:00:00Z" };

const groupHandlers = [
    http.get("/api/messages/conversations", () => HttpResponse.json([...messages.conversations, groupChat])),
    http.get("/api/messages/groups/40/members", () => HttpResponse.json(members)),
    http.get("/api/messages/groups/40", () => HttpResponse.json({ items: [created, pour], hasMore: false })),
    http.get("/api/messages/groups/people", () => HttpResponse.json([me, ...messages.contacts])),
    http.get("/api/messages/groups", () => HttpResponse.json([detail])),
    ...messageHandlers,
];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Chat groups", () => {
    it("list the groups the person is in and open one, with its grey lines and its members to mention", async () => {
        const sent: unknown[] = [];
        renderApp("/design/messages?custom=40", rana,
            http.post("/api/messages/groups/40", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(pour); }),
            ...groupHandlers);
        const t = await screen.findByText("Pour on Monday").then(() => thread());
        expect(within(sidebar()).getByText("Chat groups")).toBeInTheDocument();
        expect(within(sidebar()).getByText("Site leads").closest(".msg-contact-row")).toHaveClass("on");
        expect(t.querySelector(".msg-thread-head")).toHaveTextContent("Site leads3 members");
        // what changed in the group, from whoever changed it: the person themselves reads "You"
        expect(within(t).getByText("You created the group “Site leads”", { exact: false })).toHaveClass("msg-event");

        const box = within(t).getByRole("textbox", { name: "Message" });
        await userEvent.type(box, "Thanks @Ta");
        await userEvent.click(await screen.findByRole("option", { name: "Tarek Salem" }));
        await userEvent.type(box, "see you there{Enter}");
        await waitFor(() => expect(sent).toEqual([{ body: "Thanks @Tarek Salem see you there", mentionIds: [11], attachmentIds: [] }]));
    });

    it("let a super admin make a group of anyone on staff, by business, with errors beside the fields", async () => {
        const posted: unknown[] = [];
        renderApp("/design/messages?with=2", rana,
            http.post("/api/messages/groups", async ({ request }) => {
                const body = await request.json() as { memberIds: number[] };
                posted.push(body);
                return posted.length === 1
                    ? HttpResponse.json({ type: "validation", code: "validation_failed", message: "Only active staff can be in a group.", errors: { memberIds: ["Only active staff can be in a group."] } }, { status: 400 })
                    : HttpResponse.json({ ...detail, id: 41, name: "Handover" }, { status: 201 });
            }),
            http.get("/api/messages/groups/41", () => HttpResponse.json({ items: [], hasMore: false })),
            http.get("/api/messages/groups/41/members", () => HttpResponse.json(members)),
            ...groupHandlers);
        await userEvent.click(await within(await screen.findByText("Chat groups").then(() => sidebar())).findByRole("button", { name: "New group" }));
        const form = await screen.findByRole("dialog", { name: "New group" });

        await userEvent.click(within(form).getByRole("button", { name: "Create group" }));
        expect(within(form).getByText("Give the group a name.")).toBeInTheDocument();
        expect(posted).toEqual([]);

        await userEvent.type(within(form).getByLabelText("Name"), "Handover");
        expect(within(form).queryByText("Give the group a name.")).not.toBeInTheDocument();
        // people of every business, the person making it left out: they're in it anyway
        const picker = await within(form).findByRole("group", { name: "People to put in the group" });
        expect([...picker.querySelectorAll(".msg-sub-label")].map((l) => l.firstChild?.textContent)).toEqual(["Design", "Execution"]);
        expect(within(picker).queryByRole("button", { name: /Rana Khoury/ })).not.toBeInTheDocument();
        await userEvent.click(within(picker).getByRole("button", { name: /Sarah Haddad/ }));
        await userEvent.click(within(picker).getByRole("button", { name: /Tarek Salem/ }));

        await userEvent.click(within(form).getByRole("button", { name: "Create group" }));
        expect(await within(form).findByText("Only active staff can be in a group.")).toBeInTheDocument();
        await userEvent.click(within(form).getByRole("button", { name: "Create group" }));
        await waitFor(() => expect(posted[1]).toEqual({ name: "Handover", memberIds: [3, 11] }));
        // the new group opens
        await waitFor(() => expect(window.location.search).toBe("?custom=41"));
    });

    it("show no way to make groups to someone without the permission, but let them leave a group they're in", async () => {
        let left = false;
        renderApp("/design/messages?custom=40", sarah,
            http.post("/api/messages/groups/40/leave", () => { left = true; return new HttpResponse(null, { status: 204 }); }),
            ...groupHandlers);
        await screen.findByText("Pour on Monday");
        expect(within(sidebar()).queryByRole("button", { name: "New group" })).not.toBeInTheDocument();

        await userEvent.click(within(thread()).getByRole("button", { name: "Group actions" }));
        expect(screen.queryByRole("button", { name: "Manage group" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Leave group" }));
        const ask = await screen.findByRole("dialog", { name: "Leave Site leads?" });
        expect(ask).toHaveTextContent("The group and its messages go from your chats.");
        await userEvent.click(within(ask).getByRole("button", { name: "Leave group" }));
        await waitFor(() => expect(left).toBe(true));
        await waitFor(() => expect(window.location.search).not.toContain("custom=40"));
    });

    it("let a super admin rename a group, take someone out, and delete it after saying the history goes for everyone", async () => {
        const calls: string[] = [];
        renderApp("/design/messages?custom=40", rana,
            http.put("/api/messages/groups/40", async ({ request }) => {
                calls.push(`rename ${(await request.json() as { name: string }).name}`);
                return HttpResponse.json({ ...detail, name: "Site team" });
            }),
            http.delete("/api/messages/groups/40/members/:userId", ({ params }) => { calls.push(`remove ${params.userId}`); return HttpResponse.json(detail); }),
            http.delete("/api/messages/groups/40", () => { calls.push("delete"); return new HttpResponse(null, { status: 204 }); }),
            ...groupHandlers);
        await screen.findByText("Pour on Monday");
        await userEvent.click(within(thread()).getByRole("button", { name: "Group actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Manage group" }));
        const manage = await screen.findByRole("dialog", { name: "Manage Site leads" });

        const name = await within(manage).findByLabelText("Name");
        await userEvent.clear(name);
        await userEvent.click(within(manage).getByRole("button", { name: "Rename" }));
        expect(await within(manage).findByText("Give the group a name.")).toBeInTheDocument();
        expect(calls).toEqual([]);
        await userEvent.type(name, "Site team");
        await userEvent.click(within(manage).getByRole("button", { name: "Rename" }));
        await userEvent.click(within(manage).getByRole("button", { name: "Take Tarek Salem out of the group" }));

        await userEvent.click(within(manage).getByRole("button", { name: "Delete group" }));
        const ask = await screen.findByRole("dialog", { name: "Delete Site leads?" });
        expect(ask).toHaveTextContent("whole history are deleted for everyone in it");
        expect(ask).toHaveTextContent("can't be undone");
        await userEvent.click(within(ask).getByRole("button", { name: "Delete for everyone" }));
        await waitFor(() => expect(calls).toEqual(["rename Site team", "remove 11", "delete"]));
    });
});

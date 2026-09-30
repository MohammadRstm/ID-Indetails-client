import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageHandlers, messages, people } from "@/test/fixtures/messages";
import { live } from "@/test/liveHub";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const sidebar = () => document.querySelector(".msg-sidebar") as HTMLElement;
const thread = () => document.querySelector(".msg-thread") as HTMLElement;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Messages", () => {
    it("list team chats and direct messages by who people are, and open the newest chat", async () => {
        const read: string[] = [];
        renderApp("/design/messages", rana,
            http.post("/api/messages/:type/:id/read", ({ params }) => { read.push(`${params.type}/${params.id}`); return HttpResponse.json({ unread: 0, mention: false }); }),
            ...messageHandlers);
        expect(await within(await screen.findByText("Groups").then(() => sidebar())).findByText("Interiors")).toBeInTheDocument();
        const interiors = within(sidebar()).getByText("Interiors").closest(".msg-contact-row") as HTMLElement;
        expect(within(interiors).getByText("@")).toHaveClass("msg-count", "mention");
        expect([...sidebar().querySelectorAll(".msg-sub-label")].map((l) => l.textContent)).toEqual(["Admins2", "Employees3"]);
        // the newest chat is Interiors, marked read once opened
        expect(await within(thread()).findByText("Morning! The Villa Mounir samples arrived.")).toBeInTheDocument();
        await waitFor(() => expect(read).toEqual(["teams/13"]));
    });

    it("show a group's messages by day, each run under its sender, with mentions and shared task comments", async () => {
        renderApp("/design/messages?group=13", rana, ...messageHandlers);
        const t = await screen.findByText("Morning! The Villa Mounir samples arrived.").then(() => thread());
        expect(within(t).getByText("4 members · Design")).toBeInTheDocument();
        expect([...t.querySelectorAll(".day-head h4")].map((h) => h.textContent)).toEqual(["Yesterday", "Today"]);
        // Sarah's two messages a couple of minutes apart are one run: her name once
        expect(within(t).getAllByText("Sarah Haddad", { selector: ".msg-sender *, .msg-sender" })).toHaveLength(1);
        expect(within(t).getByText("@Rana Khoury")).toHaveClass("msg-mention");
        const card = within(t).getByText("Task comment").closest(".task-card") as HTMLElement;
        expect(within(card).getByText("Villa Mounir interiors")).toBeInTheDocument();
        expect(within(card).getByText("Stair details")).toBeInTheDocument();
        expect(within(card).getByText("Lovely detail on the landing")).toHaveClass("tc-quote");
    });

    it("send a message with a mention picked from the group's members", async () => {
        const sent: unknown[] = [];
        renderApp("/design/messages?group=13", rana,
            http.post("/api/messages/teams/13", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(messages.conversations[0].lastMessage); }),
            ...messageHandlers);
        const box = await screen.findByRole("textbox", { name: "Message" });
        await userEvent.type(box, "Thanks @Li");
        await userEvent.click(await screen.findByRole("option", { name: "Lina Saad" }));
        await userEvent.type(box, "looks great{Enter}");
        await waitFor(() => expect(sent).toEqual([{ body: "Thanks @Lina Saad looks great", mentionIds: [5], attachmentIds: [] }]));
        await waitFor(() => expect(box).toHaveValue(""));
    });

    it("send a photo, uploaded as soon as it is picked", async () => {
        const sent: unknown[] = [];
        URL.createObjectURL = vi.fn(() => "blob:photo");
        URL.revokeObjectURL = vi.fn();
        renderApp("/design/messages?with=2", rana,
            http.post("/api/files", () => HttpResponse.json({ id: 55, name: "site.png", mimeType: "image/png", kind: "image", sizeBytes: 10, createdAt: "2026-09-30T08:59:00Z" }, { status: 201 })),
            http.post("/api/messages/direct/2", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(messages.conversations[2].lastMessage); }),
            ...messageHandlers);
        await screen.findByText("Can we talk about the Q4 plan?");
        const input = document.querySelector('.msg-composer input[type="file"]') as HTMLInputElement;
        await userEvent.upload(input, new File(["png"], "site.png", { type: "image/png" }));
        expect(await screen.findByRole("button", { name: "Remove site.png" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(sent).toEqual([{ body: "", mentionIds: [], attachmentIds: [55] }]));
    });

    it("open a direct chat from the address, with who it is with", async () => {
        const read: string[] = [];
        renderApp("/design/messages?with=2", rana,
            http.post("/api/messages/:type/:id/read", ({ params }) => { read.push(`${params.type}/${params.id}`); return HttpResponse.json({ unread: 0, mention: false }); }),
            ...messageHandlers);
        const t = await screen.findByText("Can we talk about the Q4 plan?").then(() => thread());
        expect(within(t.querySelector(".msg-thread-head") as HTMLElement).getByText("Design director")).toBeInTheDocument();
        expect(within(t).getByText("Yes, after lunch.").closest(".msg-bubble")).toHaveClass("mine");
        await waitFor(() => expect(read).toEqual(["direct/2"]));
    });

    it("keep what was written when a message isn't sent, and say why", async () => {
        renderApp("/design/messages?with=2", rana,
            http.post("/api/messages/direct/2", () => HttpResponse.json({ code: "validation_failed", message: "A message is at most 4000 characters." }, { status: 400 })),
            ...messageHandlers);
        const box = await screen.findByRole("textbox", { name: "Message" });
        await userEvent.type(box, "Hello{Enter}");
        expect(await screen.findByRole("alert")).toHaveTextContent("A message is at most 4000 characters.");
        expect(box).toHaveValue("Hello");
    });

    it("load older messages on request", async () => {
        const asked: (string | null)[] = [];
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", ({ request }) => {
                const before = new URL(request.url).searchParams.get("before");
                asked.push(before);
                return HttpResponse.json(before ? { items: [], hasMore: false } : { items: [messages.conversations[2].lastMessage], hasMore: true });
            }),
            ...messageHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Show older messages" }));
        await waitFor(() => expect(asked).toEqual([null, "202"]));
    });

    it("refresh when the live connection says a chat changed", async () => {
        let unread = 0;
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/conversations", () => HttpResponse.json(messages.conversations.map((c) => (c.person?.id === people.nadia.id ? { ...c, unread } : c)))),
            ...messageHandlers);
        await screen.findByText("Can we talk about the Q4 plan?");
        await waitFor(() => expect(live.connected).toBeGreaterThan(0));
        unread = 4;
        act(() => live.emit("messages", { userId: 2 }));
        const nadia = within(sidebar()).getByText("Nadia Karam").closest(".msg-contact-row") as HTMLElement;
        await waitFor(() => expect(within(nadia).getByText("4")).toHaveClass("msg-count"));
    });
});

describe("The chat icon", () => {
    it("lists the chats with the newest messages, and opens one", async () => {
        renderApp("/design/overview", rana, ...messageHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Messages" }));
        const rows = await screen.findAllByText(/Nadia Karam|Interiors · Design/, { selector: ".notif-txt" });
        expect(rows.map((r) => r.textContent)).toEqual(["Interiors · Design @", "Nadia Karam"]);
        expect(screen.getByText("Nadia: Task comment: Lovely detail on the landing")).toBeInTheDocument();
        await userEvent.click(rows[1]);
        await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/design/messages?with=2"));
    });
});

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interiors, messageHandlers, messages, people, withNadia } from "@/test/fixtures/messages";
import { live } from "@/test/liveHub";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { lastSeenWords } from "./lastSeenWords";

const rana = personas.superAdmin;
const thread = () => document.querySelector(".msg-thread") as HTMLElement;
const sidebar = () => document.querySelector(".msg-sidebar") as HTMLElement;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "visibilityState");
});

describe("Message ticks", () => {
    it("show on the sender's own messages: two blue once read", async () => {
        const read = { ...withNadia[1], receipt: { status: "read" as const, seen: 1, delivered: 1, of: 1 } };
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [withNadia[0], read], hasMore: false })),
            ...messageHandlers);
        const mine = await screen.findByText("Yes, after lunch.").then((t) => t.closest(".msg-bubble") as HTMLElement);
        expect(within(mine).getByRole("button", { name: "Read" })).toHaveClass("msg-ticks", "read");
        // never on the other person's
        const theirs = screen.getByText("Can we talk about the Q4 plan?").closest(".msg-bubble") as HTMLElement;
        expect(within(theirs).queryByRole("button", { name: /Read|Delivered|Sent/ })).not.toBeInTheDocument();
    });

    it("say who has seen a team chat's newest message, and list everyone on request", async () => {
        const latest = { ...interiors[3], receipt: { status: "delivered" as const, seen: 2, delivered: 3, of: 4 } };
        const who = (id: number, name: string, at: string | null = null) => ({ id, name, photoFileId: null, at });
        renderApp("/design/messages?group=13", rana,
            http.get("/api/messages/teams/13", () => HttpResponse.json({ items: [...interiors.slice(0, 3), latest], hasMore: false })),
            http.get("/api/messages/104/receipts", () => HttpResponse.json({
                messageId: 104,
                summary: latest.receipt,
                seen: [who(3, "Sarah Haddad", "2026-09-30T08:20:00Z"), who(5, "Lina Saad")],
                delivered: [who(1, "Rana Khoury")],
                notReceived: [who(9, "Omar Nassar")],
            })),
            ...messageHandlers);
        const seenBy = await within(await screen.findByText("Lovely detail on the landing").then(() => thread())).findByRole("button", { name: /Seen by 2 of 4/ });
        await userEvent.click(seenBy);
        const info = await screen.findByRole("dialog");
        expect(within(info).getByText("Message info")).toBeInTheDocument();
        expect(within(info).getByText("Sarah Haddad")).toBeInTheDocument();
        expect(within(info).getByText(/Today at/)).toBeInTheDocument();
        expect(within(info).getByText("Omar Nassar").closest(".receipt-sec")).toHaveTextContent("Not received yet");
    });

    it("reload when someone receives or reads a message", async () => {
        let loads = 0;
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => { loads++; return HttpResponse.json({ items: withNadia, hasMore: false }); }),
            ...messageHandlers);
        await screen.findByText("Yes, after lunch.");
        const before = loads;
        act(() => live.emit("receipts", { teamId: null, userId: 2, announcements: false }));
        await waitFor(() => expect(loads).toBeGreaterThan(before));
    });
});

describe("Reading a chat", () => {
    it("waits until the tab is looked at", async () => {
        let state: DocumentVisibilityState = "hidden";
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
        const read: string[] = [];
        renderApp("/design/messages?with=2", rana,
            http.post("/api/messages/:type/:id/read", ({ params }) => { read.push(`${params.type}/${params.id}`); return HttpResponse.json({ unread: 0, mention: false }); }),
            ...messageHandlers);
        await screen.findByText("Yes, after lunch.");
        expect(read).toEqual([]);
        state = "visible";
        act(() => { document.dispatchEvent(new Event("visibilitychange")); });
        await waitFor(() => expect(read).toEqual(["direct/2"]));
    });
});

describe("Last seen", () => {
    it("shows for each person in the list and at the top of their chat", async () => {
        const nadia = { ...people.nadia, lastSeenAt: "2026-09-30T08:30:00Z" };
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/contacts", () => HttpResponse.json([nadia, ...messages.contacts.slice(1)])),
            ...messageHandlers);
        const head = await screen.findByText("Nadia Karam", { selector: ".msg-thread-head *" });
        expect(head.closest(".msg-thread-head")).toHaveTextContent(/Last seen today at/);
        // Sarah has the app open
        const sarah = within(sidebar()).getByText("Sarah Haddad").closest(".msg-contact-row") as HTMLElement;
        expect(within(sarah).getByText("Online")).toHaveClass("msg-online");
    });

    it("says online, today, yesterday, this week or the date", () => {
        const now = new Date("2026-09-30T09:00:00Z");
        expect(lastSeenWords(true, null, now)).toBe("Online");
        expect(lastSeenWords(false, null, now)).toBe("Not seen yet");
        expect(lastSeenWords(false, "2026-09-30T07:00:00Z", now)).toMatch(/^Last seen today at /);
        expect(lastSeenWords(false, "2026-09-29T07:00:00Z", now)).toMatch(/^Last seen yesterday at /);
        expect(lastSeenWords(false, "2026-09-10T07:00:00Z", now)).toBe("Last seen Sep 10");
    });
});

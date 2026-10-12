import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";

/*
 * Chats as Rana sees them. The development seed has no messages, so these are written in the API's shape:
 * the Interiors team's chat (Sarah and Lina, a mention of Rana, a shared task comment) and a direct chat
 * with Nadia.
 */

type Message = Schemas["MessageResponse"];
type Contact = Schemas["ContactResponse"];

const person = (id: number, name: string, role: string, domain: string | null, position: string | null, team: { id: number; name: string } | null = null): Contact =>
    ({ id, name, role, domain, position, team, photoFileId: null });

export const people = {
    nadia: person(2, "Nadia Karam", "admin", "design", "Design director"),
    sarah: person(3, "Sarah Haddad", "employee", "design", "Senior interior designer", { id: 13, name: "Interiors" }),
    lina: person(5, "Lina Saad", "employee", "design", "Interior designer", { id: 13, name: "Interiors" }),
    karim: person(10, "Karim Jaber", "admin", "execution", "Operations manager"),
    tarek: person(11, "Tarek Salem", "employee", "execution", "Site engineer", { id: 20, name: "Site" }),
};

const chatPerson = (c: Contact) => ({ id: c.id, name: c.name, photoFileId: null });

export function message(id: number, from: Contact, body: string | null, createdAt: string, patch: Partial<Message> = {}): Message {
    return { id, sender: chatPerson(from), body, kind: "text", mentions: [], attachments: [], taskComment: null, createdAt, viaProton: false, ...patch };
}

const rana = { id: 1, name: "Rana Khoury", role: "super_admin", domain: null, position: "Managing director", team: null, photoFileId: null } as Contact;

export const interiors = [
    message(101, people.sarah, "Morning! The Villa Mounir samples arrived.", "2026-09-29T06:10:00Z"),
    message(102, people.sarah, "I'll lay them out in the studio.", "2026-09-29T06:12:00Z"),
    message(103, people.lina, "@Rana Khoury can you have a look before noon?", "2026-09-30T07:40:00Z", { mentions: [{ id: 1, name: "Rana Khoury", photoFileId: null }] }),
    message(104, people.nadia, "Lovely detail on the landing", "2026-09-30T08:05:00Z", {
        kind: "task_comment",
        taskComment: {
            entryId: 77, commentId: 9, author: { id: 3, name: "Sarah Haddad", photoFileId: null }, projectId: 2, projectTitle: "Villa Mounir interiors",
            description: "Stair details", startedAt: "2026-09-29T06:00:00Z", minutes: 90, attachment: null,
        },
    }),
];

export const withNadia = [
    message(201, people.nadia, "Can we talk about the Q4 plan?", "2026-09-30T07:00:00Z"),
    message(202, rana, "Yes, after lunch.", "2026-09-30T07:05:00Z", { viaProton: true }),
];

export const messages = {
    contacts: [people.nadia, people.sarah, people.lina, people.karim, people.tarek],
    members: [rana, people.nadia, people.sarah, people.lina],
    conversations: [
        { type: "group", team: { id: 13, name: "Interiors", domain: "design" }, person: null, lastMessage: interiors[3], unread: 2, unreadMention: true },
        { type: "group", team: { id: 20, name: "Site", domain: "execution" }, person: null, lastMessage: null, unread: 0, unreadMention: false },
        { type: "dm", team: null, person: people.nadia, lastMessage: withNadia[1], unread: 0, unreadMention: false },
    ] as Schemas["ConversationResponse"][],
};

export const messageHandlers = [
    http.get("/api/messages/conversations", () => HttpResponse.json(messages.conversations)),
    http.get("/api/messages/contacts", () => HttpResponse.json(messages.contacts)),
    http.get("/api/messages/teams/:id/members", () => HttpResponse.json(messages.members)),
    http.get("/api/messages/teams/13", () => HttpResponse.json({ items: interiors, hasMore: false })),
    http.get("/api/messages/teams/:id", () => HttpResponse.json({ items: [], hasMore: false })),
    http.get("/api/messages/direct/2", () => HttpResponse.json({ items: withNadia, hasMore: false })),
    http.get("/api/messages/direct/:id", () => HttpResponse.json({ items: [], hasMore: false })),
    http.post("/api/messages/:type/:id/read", () => HttpResponse.json({ unread: 0, mention: false })),
    http.get("/api/presence", () => HttpResponse.json({ online: [3] })),
];

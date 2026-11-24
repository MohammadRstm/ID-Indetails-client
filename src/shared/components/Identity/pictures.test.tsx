import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyHandlers } from "@/test/fixtures/company";
import { interiors, message, messageHandlers, people } from "@/test/fixtures/messages";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { savedVoice } from "@/test/voice";

// Lina has a photo of her own; Sarah has only her generated avatar
const withPhoto = interiors.map((m) => (m.sender.id === people.lina.id ? { ...m, sender: { ...m.sender, photoFileId: 55 } } : m));
const pictures = [
    http.get("/api/messages/teams/13", () => HttpResponse.json({ items: withPhoto, hasMore: false })),
    http.get("/api/files/:id", () => new HttpResponse(new Blob(["x"], { type: "image/jpeg" }))),
];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    // files are shown from object URLs, which the test browser doesn't make
    URL.createObjectURL = vi.fn(() => "blob:photo");
});

describe("Someone else's picture", () => {
    it("opens their profile for whoever may open profiles", async () => {
        renderApp("/design/messages?group=13", personas.superAdmin, ...pictures, ...messageHandlers);
        expect(await screen.findByRole("link", { name: "Open Lina Saad's profile" })).toBeInTheDocument();
    });

    it("opens their photo full screen for an employee, who can't open profiles, and only when they have one", async () => {
        renderApp("/design/messages?group=13", personas.designEmployee, ...pictures, ...messageHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "See Lina Saad's photo" }));
        const lightbox = await screen.findByRole("dialog");
        expect(within(lightbox).getByRole("img", { name: "Lina Saad" })).toBeInTheDocument();
        // a profile photo is only looked at, never downloaded from here
        expect(within(lightbox).queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "See Sarah Haddad's photo" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /profile$/ })).not.toBeInTheDocument();
    });
});

describe("The viewer's own picture", () => {
    it("opens nothing in a chat, while the other person's does", async () => {
        const rana = { ...personas.superAdmin, photoFileId: 56 };
        const mine = message(92, { ...people.nadia, id: rana.id, name: "Rana Test" }, null, "2026-09-30T08:40:00Z", {
            attachments: [savedVoice(92)], sender: { id: rana.id, name: "Rana Test", photoFileId: 56 },
        });
        const theirs = message(91, people.nadia, null, "2026-09-30T08:30:00Z", { attachments: [savedVoice(91)] });
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [theirs, mine], hasMore: false })),
            ...pictures, ...messageHandlers);
        expect(await screen.findAllByRole("link", { name: "Open Nadia Karam's profile" })).not.toHaveLength(0);
        expect(screen.queryByRole("link", { name: "Open Rana Test's profile" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "See Rana Test's photo" })).not.toBeInTheDocument();
    });
});

describe("The picture on a profile", () => {
    it("opens full screen when it is a photo", async () => {
        renderApp("/company/profile", { ...personas.superAdmin, photoFileId: 57 }, ...companyHandlers, ...pictures);
        await userEvent.click(await screen.findByRole("button", { name: "Rana Test's photo" }));
        expect(within(await screen.findByRole("dialog")).getByRole("img", { name: "Rana Test" })).toBeInTheDocument();
    });

    it("is only a picture when it is the generated avatar", async () => {
        renderApp("/company/profile", personas.superAdmin, ...companyHandlers);
        expect(await screen.findByRole("heading", { name: "Rana Test" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Rana Test's photo" })).not.toBeInTheDocument();
    });
});

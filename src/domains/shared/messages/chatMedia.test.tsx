import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { message, messageHandlers, people, withNadia } from "@/test/fixtures/messages";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const photo = { id: 61, name: "site-crack.jpg", mimeType: "image/jpeg", kind: "image" as const, sizeBytes: 10, createdAt: "2026-09-30T08:20:00Z" };
const withPhoto = message(93, people.nadia, null, "2026-09-30T08:20:00Z", { attachments: [photo] });
const files = http.get("/api/files/:id", () => new HttpResponse(new Blob(["x"], { type: "image/jpeg" })));

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    // files are shown from object URLs, which the test browser doesn't make
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
});

describe("A file in a chat", () => {
    const pdf = { id: 71, name: "Holiday schedule.pdf", mimeType: "application/pdf", kind: "document" as const, sizeBytes: 2.4 * 1024 * 1024, createdAt: "2026-09-30T08:20:00Z" };

    it("shows as a card with its name and size, opens in place, and downloads from the menu", async () => {
        const downloaded: string[] = [];
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [message(94, people.nadia, null, "2026-09-30T08:20:00Z", { attachments: [pdf] })], hasMore: false })),
            http.get("/api/files/:id", ({ params }) => { downloaded.push(String(params.id)); return new HttpResponse(new Blob(["%PDF"], { type: "application/pdf" })); }),
            ...messageHandlers);
        const card = await screen.findByRole("button", { name: /Holiday schedule\.pdf/ });
        expect(card).toHaveTextContent("2.4 MB");
        await userEvent.click(card);
        const viewer = await screen.findByRole("dialog");
        expect(await within(viewer).findByTitle("Holiday schedule.pdf")).toBeInTheDocument();
        expect(within(viewer).getByRole("button", { name: "Download" })).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");

        await userEvent.click(screen.getByRole("button", { name: "Message actions" }));
        downloaded.length = 0;
        await userEvent.click(screen.getByRole("button", { name: "Download file" }));
        await waitFor(() => expect(downloaded).toEqual(["71"]));
    });
});

describe("A photo in a chat", () => {
    it("opens full size when clicked, with a download", async () => {
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [withPhoto], hasMore: false })), files, ...messageHandlers);
        // the photo is a button named by its file, and says it opens full size
        const open = await screen.findByRole("button", { name: "site-crack.jpg" });
        expect(open).toHaveAttribute("title", "site-crack.jpg: open full size");
        await userEvent.click(open);
        const lightbox = await screen.findByRole("dialog");
        expect(within(lightbox).getByRole("img", { name: "site-crack.jpg" })).toBeInTheDocument();
        expect(within(lightbox).getByRole("button", { name: "Download" })).toBeInTheDocument();
    });

    it("is downloaded from the message's menu by anyone in the chat", async () => {
        const downloaded: string[] = [];
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [withPhoto], hasMore: false })),
            http.get("/api/files/:id", ({ params }) => { downloaded.push(String(params.id)); return new HttpResponse(new Blob(["x"], { type: "image/jpeg" })); }),
            ...messageHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Message actions" }));
        // someone else's message: a download, and no Delete
        expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
        downloaded.length = 0;
        await userEvent.click(screen.getByRole("button", { name: "Download photo" }));
        await waitFor(() => expect(downloaded).toEqual(["61"]));
    });
});

describe("A text message", () => {
    it("is deleted by its sender, and someone else's has no menu at all", async () => {
        const deleted: number[] = [];
        renderApp("/design/messages?with=2", rana,
            http.delete("/api/messages/:id", ({ params }) => { deleted.push(Number(params.id)); return new HttpResponse(null, { status: 204 }); }),
            ...messageHandlers);
        // Nadia's question, then Rana's answer: only Rana's has the dots
        expect(await screen.findByText("Yes, after lunch.")).toBeInTheDocument();
        const menus = screen.getAllByRole("button", { name: "Message actions" });
        expect(menus).toHaveLength(1);
        await userEvent.click(menus[0]);
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        const ask = await screen.findByRole("dialog", { name: "Delete this message?" });
        expect(within(ask).getByText(/^It's deleted for everyone in the chat\. This can't be undone\.$/)).toBeInTheDocument();
        await userEvent.click(within(ask).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(deleted).toEqual([withNadia[1].id]));
    });
});

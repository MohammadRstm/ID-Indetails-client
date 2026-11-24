import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { message, messageHandlers, messages, people } from "@/test/fixtures/messages";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { savedVoice, stubVoice } from "@/test/voice";
import { snippet } from "./messageText";

const rana = personas.superAdmin;
let voice: ReturnType<typeof stubVoice>;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    voice = stubVoice();
});
afterEach(() => {
    voice.restore();
    vi.useRealTimers();
});

const mic = () => screen.findByRole("button", { name: "Record a voice note" });

describe("Voice messages", () => {
    it("record, then send as a message with the voice note as its only attachment", async () => {
        const uploads: { type: string | null }[] = [];
        const sent: unknown[] = [];
        renderApp("/design/messages?with=2", rana,
            http.post("/api/files/voice", ({ request }) => { uploads.push({ type: request.headers.get("content-type") }); return HttpResponse.json(savedVoice(77), { status: 201 }); }),
            http.post("/api/messages/direct/2", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(messages.conversations[3].lastMessage); }),
            ...messageHandlers);
        await userEvent.click(await mic());
        expect(await screen.findByRole("timer", { name: "Recording time" })).toHaveTextContent("0:00");
        expect(voice.recorders[0].options).toEqual({ audioBitsPerSecond: 32000, mimeType: "audio/webm;codecs=opus" });
        await userEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(sent).toEqual([{ body: "", mentionIds: [], attachmentIds: [77] }]));
        expect(uploads).toHaveLength(1);
        expect(uploads[0].type).toContain("multipart/form-data");
        // the microphone is let go, and the composer is back
        expect(voice.stopTrack).toHaveBeenCalled();
        expect(await mic()).toBeInTheDocument();
    });

    it("throw a recording away without uploading or sending anything", async () => {
        // no handler for the upload or the send: either would fail the test
        renderApp("/design/messages?with=2", rana, ...messageHandlers);
        await userEvent.click(await mic());
        await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
        expect(await mic()).toBeInTheDocument();
        expect(voice.stopTrack).toHaveBeenCalled();
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    });

    it("show the microphone button only while nothing is written", async () => {
        renderApp("/design/messages?with=2", rana, ...messageHandlers);
        await userEvent.type(await screen.findByLabelText("Message"), "Hi");
        expect(screen.queryByRole("button", { name: "Record a voice note" })).not.toBeInTheDocument();
    });

    it("say how to allow the microphone when it is blocked", async () => {
        voice.restore();
        voice = stubVoice({ micBlocked: true });
        renderApp("/design/messages?with=2", rana, ...messageHandlers);
        await userEvent.click(await mic());
        expect(await screen.findByText("Allow the microphone in your browser to record a voice note.")).toBeInTheDocument();
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    });

    it("show the upload's error and keep the recording to try again", async () => {
        renderApp("/design/messages?with=2", rana,
            http.post("/api/files/voice", () => HttpResponse.json({ code: "file_type_not_allowed", message: "Voice notes can be WebM, Ogg or MP4 audio." }, { status: 422 })),
            ...messageHandlers);
        await userEvent.click(await mic());
        await userEvent.click(await screen.findByRole("button", { name: "Send" }));
        expect(await screen.findByText("Voice notes can be WebM, Ogg or MP4 audio.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    });

    it("play a voice note in the thread, and call it a voice message in previews", async () => {
        const note = message(91, people.nadia, null, "2026-09-30T08:30:00Z", { attachments: [savedVoice(91)] });
        const conversations = messages.conversations.map((c) => (c.type === "dm" ? { ...c, lastMessage: note } : c));
        renderApp("/design/messages?with=2", rana,
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [note], hasMore: false })),
            http.get("/api/messages/conversations", () => HttpResponse.json(conversations)),
            http.get("/api/files/91", () => new HttpResponse(new Blob(["x"], { type: "audio/webm" }))),
            ...messageHandlers);
        const thread = await screen.findByRole("button", { name: "Play voice note" }).then(() => document.querySelector(".msg-thread") as HTMLElement);
        // the voice note isn't shown as a picture (the sender's avatar is the only image)
        expect(thread.querySelector("img.msg-att")).toBeNull();
        await waitFor(() => expect(within(thread).getByRole("button", { name: "Play voice note" })).toBeEnabled());
        await userEvent.click(within(thread).getByRole("button", { name: "Play voice note" }));
        expect(voice.play).toHaveBeenCalled();
        // previews (the header's messages menu) describe a voice-only message; the page's list shows no previews
        expect(snippet(note)).toBe("🎤 Voice message");
    });

    describe("their menu", () => {
        const mine = message(92, { ...people.nadia, id: rana.id, name: "Rana Khoury" }, null, "2026-09-30T08:40:00Z", { attachments: [savedVoice(92)] });
        const theirs = message(91, people.nadia, null, "2026-09-30T08:30:00Z", { attachments: [savedVoice(91)] });
        const thread = (deleted: number[]) => [
            http.get("/api/messages/direct/2", () => HttpResponse.json({ items: [theirs, mine].filter((m) => !deleted.includes(m.id)), hasMore: false })),
            http.get("/api/files/:id", () => new HttpResponse(new Blob(["x"], { type: "audio/webm" }))),
        ];
        const menus = () => screen.findAllByRole("button", { name: "Message actions" });

        it("deletes the sender's own: asked first, then gone for everyone", async () => {
            const deleted: number[] = [];
            renderApp("/design/messages?with=2", rana,
                http.delete("/api/messages/:id", ({ params }) => { deleted.push(Number(params.id)); return new HttpResponse(null, { status: 204 }); }),
                ...thread(deleted), ...messageHandlers);
            // the newest message is Rana's own voice note
            const own = (await menus()).at(-1)!;
            await userEvent.click(own);
            await userEvent.click(screen.getByRole("button", { name: "Delete" }));

            const ask = await screen.findByRole("dialog", { name: "Delete this message?" });
            expect(within(ask).getByText(/It's deleted for everyone in the chat, with its photos, videos and voice notes\./)).toBeInTheDocument();
            await userEvent.click(within(ask).getByRole("button", { name: "Delete" }));
            await waitFor(() => expect(deleted).toEqual([92]));
            expect(await screen.findByText("Message deleted")).toBeInTheDocument();
        });

        it("downloads someone else's voice note, without a Delete", async () => {
            renderApp("/design/messages?with=2", rana, ...thread([]), ...messageHandlers);
            await userEvent.click((await menus())[0]);
            expect(screen.getByRole("button", { name: "Download voice note" })).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
        });

        it("keeps the message when asked, and shows a refusal in the question", async () => {
            renderApp("/design/messages?with=2", rana,
                http.delete("/api/messages/:id", () => HttpResponse.json({ code: "forbidden", message: "Only the person who sent a message can delete it." }, { status: 403 })),
                ...thread([]), ...messageHandlers);
            await userEvent.click((await menus()).at(-1)!);
            await userEvent.click(screen.getByRole("button", { name: "Delete" }));
            const ask = await screen.findByRole("dialog", { name: "Delete this message?" });
            await userEvent.click(within(ask).getByRole("button", { name: "Delete" }));
            expect(await within(ask).findByText("Only the person who sent a message can delete it.")).toBeInTheDocument();
            await userEvent.click(within(ask).getByRole("button", { name: "Keep it" }));
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete this message?" })).not.toBeInTheDocument());
        });
    });
});

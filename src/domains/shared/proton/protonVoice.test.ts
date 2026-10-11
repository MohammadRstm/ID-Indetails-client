import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import type { ProtonReply } from "./protonApi";
import { chunksOf, endVoice, startVoice, tellVoice, useVoice, voiceUpdatesOf, type VoiceAnswer, type VoiceAsk } from "./protonVoice";

/* A browser's WebRTC, faked: the data channel is where the test plays the voice model's events. */

type Sent = Record<string, unknown>;

class FakeChannel extends EventTarget {
    readyState: RTCDataChannelState = "connecting";
    sent: Sent[] = [];
    send(data: string) { this.sent.push(JSON.parse(data) as Sent); }
    close() {
        if (this.readyState === "closed") return;
        this.readyState = "closed";
        this.dispatchEvent(new Event("close"));
    }
    emit(event: Sent) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) })); }
}

let peers: FakePeer[] = [];

class FakePeer extends EventTarget {
    iceGatheringState = "complete";
    connectionState = "new";
    localDescription: { type: string; sdp: string } | null = null;
    channel: FakeChannel | null = null;
    constructor() {
        super();
        peers.push(this);
    }
    addTrack() {}
    createDataChannel() { return (this.channel = new FakeChannel()); }
    async createOffer() { return { type: "offer", sdp: "v=0\r\no=- offer\r\n" }; }
    async setLocalDescription(description: { type: string; sdp: string }) { this.localDescription = description; }
    async setRemoteDescription() { this.channel!.readyState = "open"; }
    close() { this.connectionState = "closed"; }
}

class FakeStream {
    tracks: { enabled: boolean; stop: () => void }[];
    constructor(tracks: { enabled: boolean; stop: () => void }[] = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks; }
}

const track = { enabled: true, stop: vi.fn() };
const getUserMedia = vi.fn();

const reply = (text: string, cards: string[] = []) => ({
    conversationId: "c1", reply: text, refs: [], limited: false, sources: [], uiCommands: [], choices: [], quickReplies: [], suggestions: [],
    pendingActions: cards.map((title, i) => ({ id: `a${i}`, preview: { title } })), rolledOver: false,
}) as unknown as ProtonReply;

const channel = () => peers.at(-1)!.channel!;
const sentOf = (type: string) => channel().sent.filter((e) => e.type === type);

function sessionHandlers() {
    const started: unknown[] = [];
    const ended: string[] = [];
    server.use(
        http.post("/api/proton/voice/sessions", async ({ request }) => {
            started.push(await request.json());
            return HttpResponse.json({ sessionId: "live_1", sdp: "v=0\r\no=- answer\r\n", conversationId: "c1", endsAt: "2099-01-01T00:00:00Z" });
        }),
        http.post("/api/proton/voice/sessions/:id/end", ({ params }) => {
            ended.push(String(params.id));
            return new HttpResponse(null, { status: 204 });
        }),
    );
    return { started, ended };
}

async function talk(ask: VoiceAsk = vi.fn(async () => ({ kind: "answer", reply: reply("Fine.") }) as VoiceAnswer)) {
    const conversation = vi.fn();
    const voice = renderHook(() => useVoice());
    await act(() => startVoice({ conversationId: null, ask, onConversation: conversation }));
    return { voice, conversation };
}

beforeEach(() => {
    peers = [];
    track.enabled = true;
    track.stop.mockReset();
    getUserMedia.mockReset().mockResolvedValue(new FakeStream([track]));
    vi.stubGlobal("RTCPeerConnection", FakePeer);
    vi.stubGlobal("MediaStream", FakeStream);
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});

afterEach(async () => {
    await act(async () => {
        const ending = endVoice();
        if (peers.at(-1)?.channel?.readyState === "open") channel().emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 1 } });
        await ending;
    });
    vi.unstubAllGlobals();
});

describe("talking to Proton", () => {
    it("asks the API for the session with the browser's offer, and listens once the voice model is ready", async () => {
        const { started } = sessionHandlers();
        const { voice, conversation } = await talk();

        expect(started).toEqual([{ conversationId: null, sdp: "v=0\r\no=- offer\r\n" }]);
        expect(conversation).toHaveBeenCalledWith("c1");
        expect(voice.result.current.status).toBe("connecting");

        act(() => channel().emit({ type: "session.started", session: { id: "live_1" } }));
        expect(voice.result.current.status).toBe("listening");
    });

    it("hands what the person said to Proton once, and gives the voice model the answer and the card to mention", async () => {
        sessionHandlers();
        const ask = vi.fn(async () => ({ kind: "answer", reply: reply("You have three active projects.", ["Put Villa Mounir on hold"]) }) as VoiceAnswer);
        const { voice } = await talk(ask);
        act(() => {
            channel().emit({ type: "session.started", session: { id: "live_1" } });
            channel().emit({ type: "session.input_transcript.delta", delta: "How many ", start_ms: 0, end_ms: 200 });
            channel().emit({ type: "session.input_transcript.delta", delta: "projects are active?", start_ms: 200, end_ms: 900 });
        });
        expect(voice.result.current.heard).toBe("How many projects are active?");

        act(() => channel().emit({ type: "session.delegation.created", offset_ms: 1000, delegation: { id: "item_1", type: "delegation", target: "client" } }));
        expect(voice.result.current.status).toBe("thinking");

        await waitFor(() => expect(sentOf("session.commentary.append")).toHaveLength(1));
        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask).toHaveBeenCalledWith("How many projects are active?", { sessionId: "live_1", delegationId: "item_1" });
        expect(sentOf("session.commentary.append")[0]).toMatchObject({ delegation_id: "item_1", content: "You have three active projects." });
        const [card] = sentOf("session.thinking.append");
        expect(card).toMatchObject({ delegation_id: "item_1" });
        expect(String(card.content)).toContain('"Put Villa Mounir on hold"');
        expect(String(card.content)).toContain("saying yes does not confirm it");
        expect(voice.result.current.status).toBe("listening");
        expect(voice.result.current.heard).toBe("");
    });

    it("asks the person to say it again when it heard nothing, without asking Proton", async () => {
        sessionHandlers();
        const ask = vi.fn();
        await talk(ask);
        act(() => {
            channel().emit({ type: "session.started", session: { id: "live_1" } });
            channel().emit({ type: "session.delegation.created", offset_ms: 10, delegation: { id: "item_1", target: "client" } });
        });

        await waitFor(() => expect(sentOf("session.commentary.append")).toHaveLength(1));
        expect(sentOf("session.commentary.append")[0].content).toBe("I didn't catch that. Could you say it again?");
        expect(ask).not.toHaveBeenCalled();
    });

    it("tells the voice model what became of a card, and mutes the microphone itself as well", async () => {
        sessionHandlers();
        const { voice } = await talk();
        act(() => channel().emit({ type: "session.started", session: { id: "live_1" } }));

        tellVoice("The person confirmed the card \"Put Villa Mounir on hold\" and it is done.");
        expect(sentOf("session.commentary.append")[0]).toMatchObject({ delegation_id: null });

        const { muteVoice } = await import("./protonVoice");
        act(() => muteVoice(true));
        expect(track.enabled).toBe(false);
        expect(sentOf("session.input_audio.mute")).toHaveLength(1);
        expect(voice.result.current.muted).toBe(true);
    });

    it("ends cleanly: it asks the voice model to close, releases the microphone and tells the server", async () => {
        const { ended } = sessionHandlers();
        const { voice } = await talk();
        act(() => channel().emit({ type: "session.started", session: { id: "live_1" } }));

        let ending: Promise<void> = Promise.resolve();
        act(() => { ending = endVoice(); });
        expect(voice.result.current.status).toBe("ending");
        expect(sentOf("session.close")).toHaveLength(1);
        await act(async () => {
            channel().emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 30 } });
            await ending;
        });

        expect(voice.result.current.status).toBe("idle");
        expect(track.stop).toHaveBeenCalled();
        expect(peers[0].connectionState).toBe("closed");
        await waitFor(() => expect(ended).toEqual(["live_1"]));
    });

    it("says why when the session reached its time limit", async () => {
        sessionHandlers();
        const { voice } = await talk();
        act(() => {
            channel().emit({ type: "session.started", session: { id: "live_1" } });
            channel().emit({ type: "session.closed", reason: "expired", usage: { seconds: 600 } });
        });

        expect(voice.result.current.status).toBe("idle");
        expect(voice.result.current.message).toContain("time limit");
    });

    it("explains a refused microphone, and asks nothing of the API", async () => {
        const { started } = sessionHandlers();
        getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
        const { voice } = await talk();

        expect(voice.result.current.status).toBe("error");
        expect(voice.result.current.message).toContain("Microphone access was refused");
        expect(started).toEqual([]);
    });

    it("shows the API's reason when it can't start a session, and lets go of the microphone", async () => {
        server.use(http.post("/api/proton/voice/sessions", () => HttpResponse.json(
            { type: "conflict", code: "proton_voice_busy", message: "You already have a voice conversation open.", errors: null, traceId: "t" }, { status: 409 })));
        const { voice } = await talk();

        expect(voice.result.current.status).toBe("error");
        expect(voice.result.current.message).toBe("You already have a voice conversation open.");
        expect(track.stop).toHaveBeenCalled();
    });
});

describe("what the voice model is given", () => {
    it("keeps a short answer whole and cuts a long one between sentences", () => {
        expect(chunksOf("  Hello there.  ")).toEqual(["Hello there."]);
        expect(chunksOf("")).toEqual([]);
        const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
        const chunks = chunksOf(long, 200);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((c) => c.length <= 200)).toBe(true);
        expect(chunks.every((c) => c.endsWith("."))).toBe(true);
        expect(chunks.join(" ")).toBe(long);
    });

    it("cuts a sentence longer than a piece", () => {
        const chunks = chunksOf("a".repeat(450), 200);
        expect(chunks.map((c) => c.length)).toEqual([200, 200, 50]);
    });

    it("says a failure as it is, and nothing for an answer that was replaced", () => {
        expect(voiceUpdatesOf({ kind: "failed", message: "Proton isn't switched on." })).toEqual({ say: ["I couldn't get that: Proton isn't switched on."], know: [] });
        expect(voiceUpdatesOf({ kind: "replaced" })).toEqual({ say: [], know: [] });
        expect(voiceUpdatesOf({ kind: "answer", reply: reply("Done.") })).toEqual({ say: ["Done."], know: [] });
    });
});
